/*
 * libgit2 "branch" example - Get local / remote branch list and delete a local branch.
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
 * The following example demonstrates how to list and delete branches with libgit2.
 *
 * It will use the repository in the current working directory and list local branches by default, but also allows deleting local branches and list remote branches with options.
 *
 * Recognized options are:
 *   -r: list remote branches.
 *   -d <branch_name>: delete local branch.
 */

typedef struct {
	int list : 1;
	int remote : 1;
	int delete : 1;
	char* branch_name;
} branch_options;

static void print_usage(void)
{
	fprintf(stderr, "usage: branch [options]\n"
					"Options are :\n"
					"  : list local branches."
					"  -r: list remote branches.\n"
					"  -d <branch_name>: delete local branch.\n");
	exit(1);
}

static void parse_options(const char **repo_path, branch_options *opts, struct args_info *args)
{
	memset(opts, 0, sizeof(*opts));

	/* Default values */
	opts->list = 1;
	opts->remote = 0;
	opts->delete = 0;
	opts->branch_name = NULL;

	for (args->pos = 1; args->pos < args->argc; ++args->pos) {
		const char *curr = args->argv[args->pos];

		if (match_arg_separator(args)) {
			break;
		} else if (!strcmp(curr, "-r")) {
			opts->remote = 1;
			if (args->pos != args->argc -1) {
				print_usage();
			}
		} else if (!strcmp(curr, "-d")) {
			opts->list = 0;
			opts->delete = 1;

			if (args->pos == args->argc -1) {
				print_usage();
			} else {
				opts->branch_name = strdup(args->argv[args->pos + 1]);
			}
		}
	}
}

int lg2_branch(git_repository *repo, int argc, char **argv)
{
	struct args_info args = ARGS_INFO_INIT;
	branch_options opts;
	const char *path = ".";
	
	git_branch_iterator *iter = NULL;
	git_branch_t git_branch_type = GIT_BRANCH_LOCAL;
	git_reference *ref = NULL;
	git_reference *upstream_ref = NULL;

	/** Parse our command line options */
	parse_options(&path, &opts, &args);

	if (opts.list) {
		if (opts.remote) {
			git_branch_type = GIT_BRANCH_REMOTE;
		}

		// Create the branch iterator for branches
		if (git_branch_iterator_new(&iter, repo, git_branch_type) != 0) {
			fprintf(stderr, "Could not create branch iterator\n");
			goto cleanup;
		}

		// Iterate through the branches
		while (git_branch_next(&ref, &git_branch_type, iter) != GIT_ITEROVER) {
			const char *branch_name;
			if (git_branch_name(&branch_name, ref) == 0) {
				if (!opts.remote) {
					if (git_branch_upstream(&upstream_ref, ref) == 0) {
						printf("%s:%s\n", branch_name, branch_name);
					} else {
						printf("%s\n", branch_name);
					}
				} else {
					printf("%s\n", branch_name);
				}
				
			}
			git_reference_free(ref);
		}
	} else if (opts.delete) {
		 // Lookup the reference for the branch
		if (git_branch_lookup(&ref, repo, opts.branch_name, GIT_BRANCH_LOCAL) != 0) {
			fprintf(stderr, "Error looking up branch: %s\n", opts.branch_name);
			goto cleanup;
		}

		// Delete the reference
		if (git_branch_delete(ref) != 0) {
			fprintf(stderr, "Error deleting branch: %s\n", opts.branch_name);
			goto cleanup;
		}
	}

cleanup:
    if (iter) git_branch_iterator_free(iter);

	return 0;
}
