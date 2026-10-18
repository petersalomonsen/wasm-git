/* Storage backend: bare repositories below a preopened directory. */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <git2.h>
#include <git2/sys/odb_backend.h>
#include <git2/sys/errors.h>
#include "backend.h"

#define REPO_ROOT "/repos"

struct srv_repo {
	git_repository *repo;
};

int srv_repo_open(srv_repo **out, const char *path, int create_if_missing)
{
	char full[2100];
	srv_repo *r = calloc(1, sizeof(*r));

	(void)create_if_missing;
	snprintf(full, sizeof(full), REPO_ROOT "%s", path);
	if (git_repository_open_bare(&r->repo, full) < 0) {
		free(r);
		return -1;
	}
	*out = r;
	return 0;
}

git_repository *srv_repo_git(srv_repo *r)
{
	return r->repo;
}

typedef struct {
	git_repository *repo;
	srv_ref *refs;
	size_t count;
} collect_ctx;

static int collect_ref(const char *name, void *payload)
{
	collect_ctx *c = payload;
	git_reference *ref = NULL, *resolved = NULL;

	if (git_reference_lookup(&ref, c->repo, name) == 0 &&
	    git_reference_resolve(&resolved, ref) == 0) {
		c->refs = realloc(c->refs, (c->count + 1) * sizeof(srv_ref));
		snprintf(c->refs[c->count].name, sizeof(c->refs[c->count].name), "%s", name);
		git_oid_cpy(&c->refs[c->count].oid, git_reference_target(resolved));
		c->count++;
	}
	git_reference_free(resolved);
	git_reference_free(ref);
	return 0;
}

int srv_repo_refs(srv_repo *r, srv_ref **refs, size_t *count, char *head_target, size_t head_target_len)
{
	collect_ctx c = { r->repo, NULL, 0 };
	git_reference *head = NULL;

	head_target[0] = '\0';
	if (git_reference_lookup(&head, r->repo, "HEAD") == 0 &&
	    git_reference_type(head) == GIT_REFERENCE_SYMBOLIC)
		snprintf(head_target, head_target_len, "%s", git_reference_symbolic_target(head));
	git_reference_free(head);

	git_reference_foreach_name(r->repo, collect_ref, &c);
	*refs = c.refs;
	*count = c.count;
	return 0;
}

int srv_repo_store_pack(srv_repo *r, const unsigned char *data, size_t len)
{
	git_odb *odb = NULL;
	git_odb_writepack *wp = NULL;
	git_indexer_progress stats = { 0 };
	int error;

	if ((error = git_repository_odb(&odb, r->repo)) == 0 &&
	    (error = git_odb_write_pack(&wp, odb, NULL, NULL)) == 0 &&
	    (error = wp->append(wp, data, len, &stats)) == 0)
		error = wp->commit(wp, &stats);

	if (wp)
		wp->free(wp);
	git_odb_free(odb);
	return error;
}

int srv_repo_update_ref(srv_repo *r, const char *name, const git_oid *old_id, const git_oid *new_id)
{
	git_reference *ref = NULL;
	int error;

	if (git_oid_is_zero(new_id)) {
		if ((error = git_reference_lookup(&ref, r->repo, name)) == 0) {
			if (git_oid_cmp(git_reference_target(ref), old_id) != 0) {
				git_error_set_str(GIT_ERROR_REFERENCE, "ref changed concurrently");
				error = GIT_EMODIFIED;
			} else {
				error = git_reference_delete(ref);
			}
		}
	} else if (git_oid_is_zero(old_id)) {
		error = git_reference_create(&ref, r->repo, name, new_id, 0, "push");
	} else {
		error = git_reference_create_matching(&ref, r->repo, name, new_id, 1, old_id, "push");
	}

	git_reference_free(ref);
	return error;
}

void srv_repo_free(srv_repo *r)
{
	if (!r)
		return;
	git_repository_free(r->repo);
	free(r);
}
