#ifdef __wasi__

/*
 * Smart HTTP subtransport on top of wasi:http/outgoing-handler (WASI 0.2),
 * used by the WASI component build (wasibuild/build.sh).
 *
 * Mirrors emscriptenhttp.c: a GET is sent on the first read, a POST buffers
 * all writes and is sent on the first read. The response body is streamed.
 * Redirects and authentication are not handled yet.
 */

#include "common.h"
#include "git2/transport.h"
#include "smart.h"
#include "lg2_http.h"

bool git_http__expect_continue = false;

static const char *upload_pack_ls_service_url = "/info/refs?service=git-upload-pack";
static const char *upload_pack_service_url = "/git-upload-pack";
static const char *receive_pack_ls_service_url = "/info/refs?service=git-receive-pack";
static const char *receive_pack_service_url = "/git-receive-pack";

typedef struct {
	git_smart_subtransport_stream parent;
	git_str url;
	int is_post;
	git_str request_body;
	int sent;
	int eof;
	wasi_http_types_own_incoming_response_t response;
	wasi_http_types_own_incoming_body_t body;
	wasi_io_streams_own_input_stream_t body_stream;
} wasihttp_stream;

typedef struct {
	git_smart_subtransport parent;
	transport_smart *owner;
} wasihttp_subtransport;

static void set_str(lg2_http_string_t *s, const char *p, size_t len)
{
	s->ptr = (uint8_t *)p;
	s->len = len;
}

static int append_header(wasi_http_types_own_fields_t fields, const char *name, const char *value)
{
	wasi_http_types_field_name_t n;
	wasi_http_types_field_value_t v;
	wasi_http_types_header_error_t err;

	set_str(&n, name, strlen(name));
	v.ptr = (uint8_t *)value;
	v.len = strlen(value);

	if (!wasi_http_types_method_fields_append(wasi_http_types_borrow_fields(fields), &n, &v, &err)) {
		git_error_set(GIT_ERROR_NET, "wasi:http: invalid header '%s'", name);
		return -1;
	}
	return 0;
}

static int send_request(wasihttp_stream *s)
{
	const char *url = git_str_cstr(&s->url);
	const char *rest, *slash;
	wasi_http_types_scheme_t scheme;
	wasi_http_types_method_t method;
	lg2_http_string_t authority, path;
	wasi_http_types_own_fields_t headers;
	wasi_http_types_own_outgoing_request_t req;
	wasi_http_types_own_outgoing_body_t body;
	wasi_http_outgoing_handler_own_future_incoming_response_t future;
	wasi_http_outgoing_handler_error_code_t herr;
	wasi_http_types_result_result_own_incoming_response_error_code_void_t result;
	wasi_io_poll_own_pollable_t pollable;
	wasi_http_types_status_code_t status;

	if (!strncmp(url, "https://", 8)) {
		scheme.tag = WASI_HTTP_TYPES_SCHEME_HTTPS;
		rest = url + 8;
	} else if (!strncmp(url, "http://", 7)) {
		scheme.tag = WASI_HTTP_TYPES_SCHEME_HTTP;
		rest = url + 7;
	} else {
		git_error_set(GIT_ERROR_NET, "wasi:http: unsupported url '%s'", url);
		return -1;
	}

	slash = strchr(rest, '/');
	set_str(&authority, rest, slash ? (size_t)(slash - rest) : strlen(rest));
	set_str(&path, slash ? slash : "/", slash ? strlen(slash) : 1);

	headers = wasi_http_types_constructor_fields();
	if (append_header(headers, "User-Agent", "git/2.0 (wasm-git; libgit2)") < 0)
		return -1;
	if (s->is_post) {
		const char *ct = strstr(url, "git-upload-pack") ?
			"application/x-git-upload-pack-request" :
			"application/x-git-receive-pack-request";
		char len[32];

		snprintf(len, sizeof(len), "%" PRIuZ, s->request_body.size);
		if (append_header(headers, "Content-Type", ct) < 0 ||
		    append_header(headers, "Content-Length", len) < 0)
			return -1;
	}

	req = wasi_http_types_constructor_outgoing_request(headers);
	method.tag = s->is_post ? WASI_HTTP_TYPES_METHOD_POST : WASI_HTTP_TYPES_METHOD_GET;
	wasi_http_types_method_outgoing_request_set_method(wasi_http_types_borrow_outgoing_request(req), &method);
	wasi_http_types_method_outgoing_request_set_scheme(wasi_http_types_borrow_outgoing_request(req), &scheme);
	wasi_http_types_method_outgoing_request_set_authority(wasi_http_types_borrow_outgoing_request(req), &authority);
	wasi_http_types_method_outgoing_request_set_path_with_query(wasi_http_types_borrow_outgoing_request(req), &path);

	if (!wasi_http_types_method_outgoing_request_body(wasi_http_types_borrow_outgoing_request(req), &body)) {
		git_error_set(GIT_ERROR_NET, "wasi:http: could not get request body");
		return -1;
	}
	/*
	 * Dispatch before writing the body: the host only drains the body pipe
	 * once the request is in flight, so large bodies would otherwise block.
	 */
	if (!wasi_http_outgoing_handler_handle(req, NULL, &future, &herr)) {
		git_error_set(GIT_ERROR_NET, "wasi:http: request failed (error code %d)", herr.tag);
		return -1;
	}

	if (s->is_post) {
		wasi_http_types_own_output_stream_t os;
		wasi_io_streams_stream_error_t serr;
		size_t off = 0;

		if (!wasi_http_types_method_outgoing_body_write(wasi_http_types_borrow_outgoing_body(body), &os)) {
			git_error_set(GIT_ERROR_NET, "wasi:http: could not open request body stream");
			return -1;
		}
		/* blocking-write-and-flush accepts at most 4096 bytes per call */
		while (off < s->request_body.size) {
			lg2_http_list_u8_t chunk;
			size_t n = s->request_body.size - off;

			if (n > 4096)
				n = 4096;
			chunk.ptr = (uint8_t *)s->request_body.ptr + off;
			chunk.len = n;
			if (!wasi_io_streams_method_output_stream_blocking_write_and_flush(
				wasi_io_streams_borrow_output_stream(os), &chunk, &serr)) {
				wasi_io_streams_output_stream_drop_own(os);
				git_error_set(GIT_ERROR_NET, "wasi:http: failed writing request body");
				return -1;
			}
			off += n;
		}
		wasi_io_streams_output_stream_drop_own(os);
	}

	{
		wasi_http_types_error_code_t ferr;

		if (!wasi_http_types_static_outgoing_body_finish(body, NULL, &ferr)) {
			git_error_set(GIT_ERROR_NET, "wasi:http: failed to finish request body (error code %d)", ferr.tag);
			return -1;
		}
	}

	pollable = wasi_http_types_method_future_incoming_response_subscribe(
		wasi_http_types_borrow_future_incoming_response(future));
	wasi_io_poll_method_pollable_block(wasi_io_poll_borrow_pollable(pollable));
	wasi_io_poll_pollable_drop_own(pollable);

	/* the pollable is ready, so get returns some(result) */
	if (!wasi_http_types_method_future_incoming_response_get(
		wasi_http_types_borrow_future_incoming_response(future), &result) ||
	    result.is_err || result.val.ok.is_err) {
		wasi_http_types_future_incoming_response_drop_own(future);
		git_error_set(GIT_ERROR_NET, "wasi:http: request to '%s' failed", url);
		return -1;
	}
	wasi_http_types_future_incoming_response_drop_own(future);

	status = wasi_http_types_method_incoming_response_status(
		wasi_http_types_borrow_incoming_response(result.val.ok.val.ok));
	if (status != 200) {
		wasi_http_types_incoming_response_drop_own(result.val.ok.val.ok);
		git_error_set(GIT_ERROR_HTTP, "unexpected http status code: %d", status);
		return -1;
	}
	s->response = result.val.ok.val.ok;

	if (!wasi_http_types_method_incoming_response_consume(wasi_http_types_borrow_incoming_response(s->response), &s->body) ||
	    !wasi_http_types_method_incoming_body_stream(wasi_http_types_borrow_incoming_body(s->body), &s->body_stream)) {
		wasi_http_types_incoming_response_drop_own(s->response);
		git_error_set(GIT_ERROR_NET, "wasi:http: could not read response body");
		return -1;
	}

	s->sent = 1;
	return 0;
}

static int wasihttp_stream_read(
	git_smart_subtransport_stream *stream,
	char *buffer,
	size_t buf_size,
	size_t *bytes_read)
{
	wasihttp_stream *s = (wasihttp_stream *)stream;
	lg2_http_list_u8_t data;
	wasi_io_streams_stream_error_t serr;

	*bytes_read = 0;

	if (!s->sent && send_request(s) < 0)
		return -1;
	if (s->eof)
		return 0;

	if (!wasi_io_streams_method_input_stream_blocking_read(
		wasi_io_streams_borrow_input_stream(s->body_stream), buf_size, &data, &serr)) {
		if (serr.tag == WASI_IO_STREAMS_STREAM_ERROR_CLOSED) {
			s->eof = 1;
			return 0;
		}
		git_error_set(GIT_ERROR_NET, "wasi:http: failed reading response body");
		return -1;
	}

	memcpy(buffer, data.ptr, data.len);
	*bytes_read = data.len;
	lg2_http_list_u8_free(&data);
	return 0;
}

static int wasihttp_stream_write(
	git_smart_subtransport_stream *stream,
	const char *buffer,
	size_t len)
{
	wasihttp_stream *s = (wasihttp_stream *)stream;

	s->is_post = 1;
	return git_str_put(&s->request_body, buffer, len);
}

static void wasihttp_stream_free(git_smart_subtransport_stream *stream)
{
	wasihttp_stream *s = (wasihttp_stream *)stream;

	if (s->sent) {
		wasi_io_streams_input_stream_drop_own(s->body_stream);
		wasi_http_types_incoming_body_drop_own(s->body);
		wasi_http_types_incoming_response_drop_own(s->response);
	}
	git_str_dispose(&s->url);
	git_str_dispose(&s->request_body);
	git__free(s);
}

static int wasihttp_action(
	git_smart_subtransport_stream **stream,
	git_smart_subtransport *subtransport,
	const char *url,
	git_smart_service_t action)
{
	wasihttp_stream *s;
	const char *suffix = NULL;

	switch (action) {
	case GIT_SERVICE_UPLOADPACK_LS:
		suffix = upload_pack_ls_service_url;
		break;
	case GIT_SERVICE_UPLOADPACK:
		suffix = upload_pack_service_url;
		break;
	case GIT_SERVICE_RECEIVEPACK_LS:
		suffix = receive_pack_ls_service_url;
		break;
	case GIT_SERVICE_RECEIVEPACK:
		suffix = receive_pack_service_url;
		break;
	}

	s = git__calloc(1, sizeof(wasihttp_stream));
	GIT_ERROR_CHECK_ALLOC(s);

	s->parent.subtransport = subtransport;
	s->parent.read = wasihttp_stream_read;
	s->parent.write = wasihttp_stream_write;
	s->parent.free = wasihttp_stream_free;

	if (git_str_printf(&s->url, "%s%s", url, suffix) < 0) {
		git__free(s);
		return -1;
	}

	*stream = &s->parent;
	return 0;
}

static int wasihttp_close(git_smart_subtransport *subtransport)
{
	GIT_UNUSED(subtransport);
	return 0;
}

static void wasihttp_free(git_smart_subtransport *subtransport)
{
	git__free(subtransport);
}

int git_smart_subtransport_http(git_smart_subtransport **out, git_transport *owner, void *param)
{
	wasihttp_subtransport *t;

	GIT_UNUSED(param);

	if (!out)
		return -1;

	t = git__calloc(1, sizeof(wasihttp_subtransport));
	GIT_ERROR_CHECK_ALLOC(t);

	t->owner = (transport_smart *)owner;
	t->parent.action = wasihttp_action;
	t->parent.close = wasihttp_close;
	t->parent.free = wasihttp_free;

	*out = (git_smart_subtransport *)t;
	return 0;
}

#endif /* __wasi__ */
