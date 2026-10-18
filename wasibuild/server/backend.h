/*
 * Storage backend interface for the git smart HTTP server.
 *
 * The protocol code (proto.c) only talks to libgit2 through a
 * git_repository (for object access: revwalk, packbuilder, peeling) and
 * to this interface for everything that touches storage directly:
 * listing and updating refs, and storing a received packfile.
 *
 * backend_fs.c - bare repositories on a preopened directory
 */

#ifndef BACKEND_H
#define BACKEND_H

#include <git2.h>

typedef struct srv_repo srv_repo;

typedef struct {
	char name[1024];
	git_oid oid;
} srv_ref;

/* path is the URL path of the repository, e.g. "/express.git" */
int srv_repo_open(srv_repo **out, const char *path, int create_if_missing);
git_repository *srv_repo_git(srv_repo *repo);

/*
 * All refs with their resolved targets (HEAD excluded), and the symbolic
 * target of HEAD in head_target (empty string if none). *refs is malloc'ed.
 */
int srv_repo_refs(srv_repo *repo, srv_ref **refs, size_t *count, char *head_target, size_t head_target_len);

/* Store all objects of a received packfile (may be thin) */
int srv_repo_store_pack(srv_repo *repo, const unsigned char *data, size_t len);

/*
 * Compare-and-swap a ref: a zero old_id means "must not exist", a zero
 * new_id means delete.
 */
int srv_repo_update_ref(srv_repo *repo, const char *name, const git_oid *old_id, const git_oid *new_id);

void srv_repo_free(srv_repo *repo);

#endif
