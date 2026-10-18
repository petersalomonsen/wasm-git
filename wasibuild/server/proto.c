/*
 * Minimal git smart HTTP server as a wasi:http/incoming-handler component,
 * built on libgit2 (wasibuild/build.sh server).
 *
 *   GET  /<repo>/info/refs?service=git-upload-pack|git-receive-pack
 *   POST /<repo>/git-upload-pack     (clone / fetch)
 *   POST /<repo>/git-receive-pack    (push)
 *
 * Storage goes through backend.h; backend_fs.c serves bare repositories on
 * a preopened directory.
 *
 * Protocol v0 only, no side-band, no shallow. Negotiation uses
 * multi_ack_detailed: each round ACKs the common "have" lines so that the
 * stateless HTTP client re-sends them, and the final pack excludes them all.
 */

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <git2.h>
#include <git2/sys/errors.h>
#include <git2/sys/transport.h>
#include "zlib.h"
#include "git_server.h"
#include "backend.h"

#define AGENT "agent=wasm-git-server/0.1"

typedef struct {
	char *ptr;
	size_t len, cap;
} buf_t;

static void buf_put(buf_t *b, const void *data, size_t len)
{
	if (b->len + len > b->cap) {
		b->cap = (b->len + len) * 2 + 1024;
		b->ptr = realloc(b->ptr, b->cap);
	}
	memcpy(b->ptr + b->len, data, len);
	b->len += len;
}

static void pkt(buf_t *b, const char *fmt, ...)
{
	char line[65520 + 1];
	char hdr[5];
	va_list ap;
	int n;

	va_start(ap, fmt);
	n = vsnprintf(line, sizeof(line), fmt, ap);
	va_end(ap);

	snprintf(hdr, sizeof(hdr), "%04x", n + 4);
	buf_put(b, hdr, 4);
	buf_put(b, line, n);
}

/* pkt-line with an embedded NUL (ref advertisement capabilities) */
static void pkt_caps(buf_t *b, const char *oid, const char *name, const char *caps)
{
	char hdr[5];
	size_t n = strlen(oid) + 1 + strlen(name) + 1 + strlen(caps) + 1;

	snprintf(hdr, sizeof(hdr), "%04zx", n + 4);
	buf_put(b, hdr, 4);
	buf_put(b, oid, strlen(oid));
	buf_put(b, " ", 1);
	buf_put(b, name, strlen(name));
	buf_put(b, "\0", 1);
	buf_put(b, caps, strlen(caps));
	buf_put(b, "\n", 1);
}

static void flush_pkt(buf_t *b)
{
	buf_put(b, "0000", 4);
}

/* ---- wasi:http plumbing ------------------------------------------------ */

static void send_response(wasi_http_types_own_response_outparam_t out, int status,
	const char *content_type, const buf_t *body)
{
	wasi_http_types_own_fields_t headers = wasi_http_types_constructor_fields();
	wasi_http_types_own_outgoing_response_t resp;
	wasi_http_types_own_outgoing_body_t obody;
	wasi_http_types_own_output_stream_t os;
	wasi_http_types_result_own_outgoing_response_error_code_t result;
	wasi_http_types_header_error_t herr;
	wasi_io_streams_stream_error_t serr;
	wasi_http_types_error_code_t ferr;
	size_t off = 0;
	struct { const char *k, *v; } hs[] = {
		{ "Content-Type", content_type },
		{ "Cache-Control", "no-cache" },
	};

	for (size_t i = 0; i < sizeof(hs) / sizeof(hs[0]); i++) {
		wasi_http_types_field_name_t k = { (uint8_t *)hs[i].k, strlen(hs[i].k) };
		wasi_http_types_field_value_t v = { (uint8_t *)hs[i].v, strlen(hs[i].v) };
		wasi_http_types_method_fields_append(wasi_http_types_borrow_fields(headers), &k, &v, &herr);
	}

	resp = wasi_http_types_constructor_outgoing_response(headers);
	wasi_http_types_method_outgoing_response_set_status_code(wasi_http_types_borrow_outgoing_response(resp), status);
	wasi_http_types_method_outgoing_response_body(wasi_http_types_borrow_outgoing_response(resp), &obody);

	/* hand the response to the host first so it drains the body as we write */
	result.is_err = false;
	result.val.ok = resp;
	wasi_http_types_static_response_outparam_set(out, &result);

	wasi_http_types_method_outgoing_body_write(wasi_http_types_borrow_outgoing_body(obody), &os);
	while (body && off < body->len) {
		size_t n = body->len - off > 4096 ? 4096 : body->len - off;
		git_server_list_u8_t chunk = { (uint8_t *)body->ptr + off, n };

		if (!wasi_io_streams_method_output_stream_blocking_write_and_flush(
			wasi_io_streams_borrow_output_stream(os), &chunk, &serr))
			break;
		off += n;
	}
	wasi_io_streams_output_stream_drop_own(os);
	wasi_http_types_static_outgoing_body_finish(obody, NULL, &ferr);
}

static void send_text(wasi_http_types_own_response_outparam_t out, int status, const char *msg)
{
	buf_t b = { 0 };

	buf_put(&b, msg, strlen(msg));
	send_response(out, status, "text/plain", &b);
	free(b.ptr);
}

static int header_equals(wasi_http_types_own_incoming_request_t req, const char *name, const char *value)
{
	wasi_http_types_own_headers_t h = wasi_http_types_method_incoming_request_headers(
		wasi_http_types_borrow_incoming_request(req));
	wasi_http_types_field_name_t k = { (uint8_t *)name, strlen(name) };
	wasi_http_types_list_field_value_t vals;
	int found = 0;

	wasi_http_types_method_fields_get(wasi_http_types_borrow_fields(h), &k, &vals);
	for (size_t i = 0; i < vals.len; i++)
		if (vals.ptr[i].len == strlen(value) && !memcmp(vals.ptr[i].ptr, value, vals.ptr[i].len))
			found = 1;
	wasi_http_types_list_field_value_free(&vals);
	wasi_http_types_fields_drop_own(h);
	return found;
}

static int read_body(wasi_http_types_own_incoming_request_t req, buf_t *out)
{
	wasi_http_types_own_incoming_body_t body;
	wasi_io_streams_own_input_stream_t is;
	git_server_list_u8_t data;
	wasi_io_streams_stream_error_t serr;

	if (!wasi_http_types_method_incoming_request_consume(wasi_http_types_borrow_incoming_request(req), &body) ||
	    !wasi_http_types_method_incoming_body_stream(wasi_http_types_borrow_incoming_body(body), &is))
		return -1;

	while (wasi_io_streams_method_input_stream_blocking_read(
		wasi_io_streams_borrow_input_stream(is), 65536, &data, &serr)) {
		buf_put(out, data.ptr, data.len);
		git_server_list_u8_free(&data);
	}

	wasi_io_streams_input_stream_drop_own(is);
	wasi_http_types_incoming_body_drop_own(body);
	return serr.tag == WASI_IO_STREAMS_STREAM_ERROR_CLOSED ? 0 : -1;
}

/* git gzips large request bodies (Content-Encoding: gzip) */
static int gunzip(buf_t *in, buf_t *out)
{
	z_stream zs = { 0 };
	char chunk[65536];
	int rc;
	const unsigned char *p = (const unsigned char *)in->ptr;
	size_t hdr = 10;

	/*
	 * libgit2's bundled zlib is built with NO_GZIP, so skip the gzip header
	 * by hand (RFC 1952) and inflate the raw deflate stream.
	 */
	if (in->len < 18 || p[0] != 0x1f || p[1] != 0x8b || p[2] != 8)
		return -1;
	if (p[3] & 4)
		hdr += 2 + (p[10] | (p[11] << 8));
	if (p[3] & 8)
		while (hdr < in->len && p[hdr++]);
	if (p[3] & 16)
		while (hdr < in->len && p[hdr++]);
	if (p[3] & 2)
		hdr += 2;
	if (hdr >= in->len)
		return -1;

	if (inflateInit2(&zs, -MAX_WBITS) != Z_OK)
		return -1;
	zs.next_in = (Bytef *)in->ptr + hdr;
	zs.avail_in = in->len - hdr;
	do {
		zs.next_out = (Bytef *)chunk;
		zs.avail_out = sizeof(chunk);
		rc = inflate(&zs, Z_NO_FLUSH);
		if (rc != Z_OK && rc != Z_STREAM_END) {
			inflateEnd(&zs);
			return -1;
		}
		buf_put(out, chunk, sizeof(chunk) - zs.avail_out);
	} while (rc != Z_STREAM_END);
	inflateEnd(&zs);
	return 0;
}

/* ---- pkt-line parsing --------------------------------------------------- */

/* Returns line length (0 for flush), -1 at end/error; *line points at payload */
static int next_pkt(const buf_t *b, size_t *pos, const char **line)
{
	char hex[5] = { 0 };
	long n;

	if (*pos + 4 > b->len)
		return -1;
	memcpy(hex, b->ptr + *pos, 4);
	n = strtol(hex, NULL, 16);
	if (n == 0) {
		*pos += 4;
		return 0;
	}
	if (n < 4 || *pos + n > b->len)
		return -1;
	*line = b->ptr + *pos + 4;
	*pos += n;
	return (int)(n - 4);
}

/* Is cap one of the space separated capabilities in caps[0..len)? */
static int has_cap(const char *caps, size_t len, const char *cap)
{
	size_t caplen = strlen(cap);
	const char *p = caps, *end = caps + len;

	while (p < end) {
		const char *sep = memchr(p, ' ', end - p);
		size_t n = sep ? (size_t)(sep - p) : (size_t)(end - p);

		if (n && p[n - 1] == '\n')
			n--;
		if (n == caplen && !memcmp(p, cap, n))
			return 1;
		p += n + 1;
	}
	return 0;
}

/* ---- ref advertisement --------------------------------------------------- */

static void adv_line(buf_t *b, int *first, const char *caps, const git_oid *oid, const char *name)
{
	char hex[GIT_OID_MAX_HEXSIZE + 1];

	git_oid_tostr(hex, sizeof(hex), oid);
	if (*first) {
		pkt_caps(b, hex, name, caps);
		*first = 0;
	} else {
		pkt(b, "%s %s\n", hex, name);
	}
}

static void info_refs(srv_repo *repo, const char *service, wasi_http_types_own_response_outparam_t out)
{
	buf_t b = { 0 };
	char caps[1200], content_type[128], head_target[1024];
	int first = 1, upload = !strcmp(service, "git-upload-pack");
	srv_ref *refs = NULL;
	size_t nrefs = 0;

	srv_repo_refs(repo, &refs, &nrefs, head_target, sizeof(head_target));

	pkt(&b, "# service=%s\n", service);
	flush_pkt(&b);

	if (upload) {
		char symref_cap[1100] = "";

		if (head_target[0])
			snprintf(symref_cap, sizeof(symref_cap), " symref=HEAD:%s", head_target);
		snprintf(caps, sizeof(caps), "multi_ack_detailed ofs-delta%s " AGENT, symref_cap);

		for (size_t i = 0; i < nrefs; i++)
			if (!strcmp(refs[i].name, head_target))
				adv_line(&b, &first, caps, &refs[i].oid, "HEAD");
	} else {
		snprintf(caps, sizeof(caps), "report-status delete-refs ofs-delta " AGENT);
	}

	for (size_t i = 0; i < nrefs; i++) {
		git_object *obj = NULL, *peeled = NULL;

		adv_line(&b, &first, caps, &refs[i].oid, refs[i].name);

		/* advertise the peeled target of annotated tags */
		if (upload && !strncmp(refs[i].name, "refs/tags/", 10) &&
		    git_object_lookup(&obj, srv_repo_git(repo), &refs[i].oid, GIT_OBJECT_TAG) == 0 &&
		    git_object_peel(&peeled, obj, GIT_OBJECT_ANY) == 0) {
			char peeled_name[1100];

			snprintf(peeled_name, sizeof(peeled_name), "%s^{}", refs[i].name);
			adv_line(&b, &first, caps, git_object_id(peeled), peeled_name);
		}
		git_object_free(peeled);
		git_object_free(obj);
	}
	git_error_clear();

	if (first) {
		/* empty repository */
		pkt_caps(&b, "0000000000000000000000000000000000000000", "capabilities^{}", caps);
	}
	flush_pkt(&b);

	snprintf(content_type, sizeof(content_type), "application/x-%s-advertisement", service);
	send_response(out, 200, content_type, &b);

	free(refs);
	free(b.ptr);
}

/* ---- upload-pack ------------------------------------------------------- */

static int pack_cb(void *data, size_t len, void *payload)
{
	buf_put(payload, data, len);
	return 0;
}

static int add_want(git_repository *repo, git_packbuilder *pb, git_revwalk *walk, const git_oid *oid)
{
	git_object *obj = NULL, *target = NULL;
	int error;

	if ((error = git_object_lookup(&obj, repo, oid, GIT_OBJECT_ANY)) < 0)
		return error;

	switch (git_object_type(obj)) {
	case GIT_OBJECT_TAG:
		/* include the tag object itself, then whatever it points to */
		if ((error = git_packbuilder_insert(pb, oid, NULL)) < 0 ||
		    (error = git_object_peel(&target, obj, GIT_OBJECT_ANY)) < 0)
			break;
		if (git_object_type(target) == GIT_OBJECT_COMMIT)
			error = git_revwalk_push(walk, git_object_id(target));
		else
			error = git_packbuilder_insert_recur(pb, git_object_id(target), NULL);
		break;
	case GIT_OBJECT_COMMIT:
		error = git_revwalk_push(walk, oid);
		break;
	default:
		error = git_packbuilder_insert_recur(pb, oid, NULL);
	}

	git_object_free(target);
	git_object_free(obj);
	return error;
}

static void upload_pack(srv_repo *srepo, buf_t *req, wasi_http_types_own_response_outparam_t out)
{
	buf_t resp = { 0 };
	git_oid *wants = NULL, *common = NULL;
	size_t nwants = 0, ncommon = 0, pos = 0;
	int done = 0, n;
	const char *line;
	git_odb *odb = NULL;
	git_packbuilder *pb = NULL;
	git_revwalk *walk = NULL;
	char hex[GIT_OID_MAX_HEXSIZE + 1];
	git_repository *repo = srv_repo_git(srepo);

	git_repository_odb(&odb, repo);

	while ((n = next_pkt(req, &pos, &line)) >= 0) {
		if (n == 0)
			continue;
		if (n >= 45 && !strncmp(line, "want ", 5)) {
			wants = realloc(wants, (nwants + 1) * sizeof(git_oid));
			git_oid_fromstrn(&wants[nwants++], line + 5, 40);
		} else if (n >= 45 && !strncmp(line, "have ", 5)) {
			git_oid oid;

			git_oid_fromstrn(&oid, line + 5, 40);
			if (git_odb_exists(odb, &oid)) {
				common = realloc(common, (ncommon + 1) * sizeof(git_oid));
				common[ncommon++] = oid;
			}
		} else if (n >= 4 && !strncmp(line, "done", 4)) {
			done = 1;
		}
	}

	if (!done) {
		for (size_t i = 0; i < ncommon; i++) {
			git_oid_tostr(hex, sizeof(hex), &common[i]);
			pkt(&resp, "ACK %s common\n", hex);
		}
		pkt(&resp, "NAK\n");
		send_response(out, 200, "application/x-git-upload-pack-result", &resp);
		goto cleanup;
	}

	if (ncommon) {
		git_oid_tostr(hex, sizeof(hex), &common[ncommon - 1]);
		pkt(&resp, "ACK %s\n", hex);
	} else {
		pkt(&resp, "NAK\n");
	}

	if (git_packbuilder_new(&pb, repo) < 0 || git_revwalk_new(&walk, repo) < 0)
		goto fail;
	for (size_t i = 0; i < nwants; i++)
		if (add_want(repo, pb, walk, &wants[i]) < 0)
			goto fail;
	for (size_t i = 0; i < ncommon; i++)
		git_revwalk_hide(walk, &common[i]);
	if (git_packbuilder_insert_walk(pb, walk) < 0 ||
	    git_packbuilder_foreach(pb, pack_cb, &resp) < 0)
		goto fail;

	send_response(out, 200, "application/x-git-upload-pack-result", &resp);
	goto cleanup;

fail:
	send_text(out, 500, git_error_last() ? git_error_last()->message : "pack failed");
cleanup:
	git_revwalk_free(walk);
	git_packbuilder_free(pb);
	git_odb_free(odb);
	free(wants);
	free(common);
	free(resp.ptr);
}

/* ---- receive-pack ------------------------------------------------------ */

typedef struct {
	git_oid old_id, new_id;
	char name[1024];
} ref_cmd;

static void receive_pack(srv_repo *repo, buf_t *req, wasi_http_types_own_response_outparam_t out)
{
	buf_t resp = { 0 };
	ref_cmd *cmds = NULL;
	size_t ncmds = 0, pos = 0;
	int n, report_status = 0;
	const char *line, *unpack_status = "ok";

	/* "<old> <new> <ref>", the first line followed by NUL and capabilities */
	while ((n = next_pkt(req, &pos, &line)) > 0) {
		ref_cmd *c;
		size_t namelen;
		const char *nul = memchr(line, '\0', n);
		const char *end = nul ? nul : line + n;

		if (nul && has_cap(nul + 1, line + n - (nul + 1), "report-status"))
			report_status = 1;
		if (end - line < 83)
			continue;

		cmds = realloc(cmds, (ncmds + 1) * sizeof(ref_cmd));
		c = &cmds[ncmds++];
		git_oid_fromstrn(&c->old_id, line, 40);
		git_oid_fromstrn(&c->new_id, line + 41, 40);
		namelen = end - (line + 82);
		if (namelen && line[82 + namelen - 1] == '\n')
			namelen--;
		if (namelen >= sizeof(c->name))
			namelen = sizeof(c->name) - 1;
		memcpy(c->name, line + 82, namelen);
		c->name[namelen] = '\0';
	}

	/* everything after the command flush is the packfile (absent for deletes) */
	if (pos < req->len &&
	    srv_repo_store_pack(repo, (const unsigned char *)req->ptr + pos, req->len - pos) < 0)
		unpack_status = git_error_last() ? git_error_last()->message : "index-pack failed";

	pkt(&resp, "unpack %s\n", unpack_status);

	for (size_t i = 0; i < ncmds; i++) {
		ref_cmd *c = &cmds[i];

		if (strcmp(unpack_status, "ok")) {
			pkt(&resp, "ng %s unpacker error\n", c->name);
			continue;
		}

		if (srv_repo_update_ref(repo, c->name, &c->old_id, &c->new_id) < 0)
			pkt(&resp, "ng %s %s\n", c->name, git_error_last() ? git_error_last()->message : "failed");
		else
			pkt(&resp, "ok %s\n", c->name);
	}
	flush_pkt(&resp);

	if (!report_status)
		resp.len = 0;
	send_response(out, 200, "application/x-git-receive-pack-result", &resp);

	free(cmds);
	free(resp.ptr);
}

/* ---- request routing --------------------------------------------------- */

static int git_initialized;

void exports_wasi_http_incoming_handler_handle(
	exports_wasi_http_incoming_handler_own_incoming_request_t request,
	exports_wasi_http_incoming_handler_own_response_outparam_t response_out)
{
	wasi_http_types_method_t method;
	git_server_string_t pq = { 0 };
	char path[2048], repo_path[2048];
	char *query, *endpoint;
	srv_repo *repo = NULL;
	buf_t body = { 0 }, inflated = { 0 };
	buf_t *payload = &body;

	if (!git_initialized) {
		git_libgit2_init();
		git_libgit2_opts(GIT_OPT_SET_OWNER_VALIDATION, 0);
		git_libgit2_opts(GIT_OPT_SET_SEARCH_PATH, GIT_CONFIG_LEVEL_SYSTEM, "");
		git_libgit2_opts(GIT_OPT_SET_SEARCH_PATH, GIT_CONFIG_LEVEL_XDG, "");
		git_libgit2_opts(GIT_OPT_SET_SEARCH_PATH, GIT_CONFIG_LEVEL_GLOBAL, "");
		git_initialized = 1;
	}

	wasi_http_types_method_incoming_request_method(wasi_http_types_borrow_incoming_request(request), &method);
	if (!wasi_http_types_method_incoming_request_path_with_query(wasi_http_types_borrow_incoming_request(request), &pq) ||
	    pq.len >= sizeof(path)) {
		send_text(response_out, 400, "bad path\n");
		goto cleanup;
	}
	memcpy(path, pq.ptr, pq.len);
	path[pq.len] = '\0';

	query = strchr(path, '?');
	if (query)
		*query++ = '\0';

	if (strstr(path, "..")) {
		send_text(response_out, 400, "bad path\n");
		goto cleanup;
	}

	/* liveness check, as in test-browser/githttpserver.js */
	if (strstr(path, "ping")) {
		send_text(response_out, 200, "pong");
		goto cleanup;
	}

	if ((endpoint = strstr(path, "/info/refs")) == NULL &&
	    (endpoint = strstr(path, "/git-upload-pack")) == NULL &&
	    (endpoint = strstr(path, "/git-receive-pack")) == NULL) {
		send_text(response_out, 404, "not a git endpoint\n");
		goto cleanup;
	}

	snprintf(repo_path, sizeof(repo_path), "%.*s", (int)(endpoint - path), path);

	if (srv_repo_open(&repo, repo_path, !strcmp(endpoint, "/git-receive-pack") ||
	                  (query && strstr(query, "service=git-receive-pack"))) < 0) {
		send_text(response_out, 404, "repository not found\n");
		goto cleanup;
	}

	if (!strcmp(endpoint, "/info/refs") && method.tag == WASI_HTTP_TYPES_METHOD_GET) {
		const char *service = query ? strstr(query, "service=") : NULL;

		if (service && (!strcmp(service + 8, "git-upload-pack") || !strcmp(service + 8, "git-receive-pack")))
			info_refs(repo, service + 8, response_out);
		else
			send_text(response_out, 403, "dumb http not supported\n");
		goto cleanup;
	}

	if (method.tag != WASI_HTTP_TYPES_METHOD_POST || read_body(request, &body) < 0) {
		send_text(response_out, 400, "bad request\n");
		goto cleanup;
	}
	if (header_equals(request, "content-encoding", "gzip")) {
		if (gunzip(&body, &inflated) < 0) {
			send_text(response_out, 400, "bad gzip body\n");
			goto cleanup;
		}
		payload = &inflated;
	}

	if (!strcmp(endpoint, "/git-upload-pack"))
		upload_pack(repo, payload, response_out);
	else
		receive_pack(repo, payload, response_out);

cleanup:
	srv_repo_free(repo);
	git_server_string_free(&pq);
	free(body.ptr);
	free(inflated.ptr);
	wasi_http_types_incoming_request_drop_own(request);
}

/* the http client transport is compiled out of the server's libgit2 build */
int git_smart_subtransport_http(git_smart_subtransport **out, git_transport *owner, void *param)
{
	(void)out; (void)owner; (void)param;
	return -1;
}

/* normally defined by the http transport; referenced by settings.c */
bool git_http__expect_continue = false;
