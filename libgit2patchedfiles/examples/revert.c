/*
 * libgit2 "revert" example - shows how to git revert
 *
 * Written by the libgit2 contributors
 *
 * To the extent possible under law, the author(s) have dedicated all copyright
 * and related and neighboring rights to this software to the public domain
 * worldwide. This software is distributed without any warranty.
 *
 * You should have received a copy of the CC0 Public Domain Dedication along
 * with this software. If not, see
 * <http://creativecommons.org/publicdomain/zero/1.0/>.
 */

#include "common.h"

/**
 * This example demonstrates the libgit2 revert APIs to roughly
 * simulate `git revert`.
 *
 * This does not have:
 *
 * - Robust error handling
 * - Most of the `git revert` options
 * 
 */
int lg2_revert(git_repository *repo, int argc, char **argv)
{
    git_revert_options revert_options;
    git_commit *target_commit = NULL;
	git_revspec revspec;
	int err = 0;

    check_lg2(git_revert_options_init(&revert_options, GIT_REVERT_OPTIONS_VERSION), git_error_last()->message, NULL);

    err = git_revparse(&revspec, repo, argv[argc - 1]);
	if (err != 0)
	{
		fprintf(stderr, "failed to lookup rev: %s\n", git_error_last()->message);
		goto cleanup;
	}
	err = git_commit_lookup(&target_commit, repo, revspec.from);
	if (err != 0)
	{
		fprintf(stderr, "failed to lookup commit: %s\n", git_error_last()->message);
		goto cleanup;
	}
    err = git_revert(repo, target_commit, &revert_options);
cleanup:
	git_commit_free(target_commit);

	return err;
}
