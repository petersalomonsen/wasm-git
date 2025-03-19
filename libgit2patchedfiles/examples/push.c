/*
 * libgit2 "push" example - shows how to push to remote
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
 * This example demonstrates the libgit2 push API to roughly
 * simulate `git push`.
 *
 * This does not have:
 *
 * - Robust error handling
 * - Any of the `git push` options
 *
 * This does have:
 *
 * - Example of push to origin/master
 * 
 */

typedef struct {
	int force : 1;
} push_options;

static void print_usage(void)
{
	fprintf(stderr, "usage: push\n"
					"Options are :\n"
					"  --force: perform a force push.\n");
	exit(1);
}

static void parse_options(push_options *opts, struct args_info *args)
{
	memset(opts, 0, sizeof(*opts));

	/* Default values */
	opts->force = 0;

	for (args->pos = 1; args->pos < args->argc; ++args->pos) {
		const char *curr = args->argv[args->pos];

		if (match_arg_separator(args)) {
			break;
		} else if (!strcmp(curr, "--force")) {
			opts->force = 1;
		} else {
			print_usage();
		}
	}
}

/** Entry point for this command */
int lg2_push(git_repository *repo, int argc, char **argv) {
	struct args_info args = ARGS_INFO_INIT;
	push_options opts;
	git_push_options options;
	git_remote* remote = NULL;
	char *refspec = NULL;
	git_reference* head_ref;
	
	/** Parse our command line options */
	parse_options(&opts, &args);
	
	git_reference_lookup(&head_ref, repo, "HEAD");
	refspec = git_reference_symbolic_target(head_ref);

	if (opts.force) {
		char *new_refspec = NULL;
        size_t new_refspec_len = strlen(refspec) + 2; // 1 for '+' and 1 for null terminator
        new_refspec = (char *)malloc(new_refspec_len);
        if (!new_refspec) {
            fprintf(stderr, "Memory allocation failed\n");
            exit(1);
        }
		strcpy(new_refspec, "+");
		strcat(new_refspec, refspec);
        refspec = new_refspec; // Update refspec to point to the new string
    }

	const git_strarray refspecs = {
		&refspec,
		1
	};

	check_lg2(git_remote_lookup(&remote, repo, "origin" ), "Unable to lookup remote", NULL);
	
	check_lg2(git_push_options_init(&options, GIT_PUSH_OPTIONS_VERSION ), "Error initializing push", NULL);

	check_lg2(git_remote_push(remote, &refspecs, &options), "Error pushing", NULL);

	printf("pushed\n");
	git_reference_free(head_ref);
	return 0;
}
