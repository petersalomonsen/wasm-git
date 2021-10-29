/*
 * libgit2 "reset" example - Reset current HEAD to the specified state
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
 * The following example demonstrates how to reset libgit2.
 *
 * It will use the repository in the current working directory, and reset to the specified revspec
 *
 * Recognized options are:
 *   --hard: reset hard
 * 	 --soft: reset soft
 */

int lg2_reset(git_repository *repo, int argc, char **argv)
{
	git_checkout_options checkout_opts = GIT_CHECKOUT_OPTIONS_INIT;
	git_commit *target_commit = NULL;
	git_revspec revspec;
	git_reset_t reset_type = GIT_RESET_MIXED;
	int err;

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

	if (argc > 1)
	{
		if (!strcmp(argv[argc - 2], "--hard"))
		{
			reset_type = GIT_RESET_HARD;
		}
		else if (!strcmp(argv[argc - 2], "--soft"))
		{
			reset_type = GIT_RESET_SOFT;
		}
	}
	err = git_reset(repo, target_commit, reset_type, &checkout_opts);
	if (err != 0)
	{
		fprintf(stderr, "reset error: %s\n", git_error_last()->message);
		goto cleanup;
	}
cleanup:
	git_commit_free(target_commit);

	return 0;
}
