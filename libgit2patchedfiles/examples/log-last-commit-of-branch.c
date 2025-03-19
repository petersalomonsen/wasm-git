/*
 * libgit2 "log" example - shows how to walk history and get commit info
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
 * This example demonstrates the libgit2 rev walker APIs to roughly
 * simulate the output of `git log {{branchName}} -1` and a few of command line arguments.
 *
 */

/** utility functions that parse options and help with log output */
static void print_time(const git_time *intime, const char *prefix);

void print_commit_info(git_commit *commit) {
	char buf[GIT_OID_SHA1_HEXSIZE + 1];
	const git_signature *author = git_commit_author(commit);
	const char *scan, *eol;

	git_oid_tostr(buf, sizeof(buf), git_commit_id(commit));

    printf("commit %s\n", buf);
    printf("Author: %s <%s>\n", author->name, author->email);
	print_time(&author->when, "Date:   ");

    for (scan = git_commit_message(commit); scan && *scan; ) {
		for (eol = scan; *eol && *eol != '\n'; ++eol) /* find eol */;

		printf("    %.*s\n", (int)(eol - scan), scan);
		scan = *eol ? eol + 1 : NULL;
	}
	printf("\n");
}


int lg2_log_last_commit_of_branch(git_repository *repo, int argc, char *argv[])
{
	git_branch_t git_branch_type = GIT_BRANCH_LOCAL;
	char* branch_name = NULL;

	if (argc != 2) {
		fprintf(stderr, "You have to specify exactly one branchname as argument. Usage: git log-last-commit-of-branch {branch}\n");
        goto cleanup;
	} else {
		branch_name = argv[1];
	}

	// check if branchname starts with origin/ to determine if it is a remote branch
	if (strlen(branch_name) > 6) {
		if (strncmp(branch_name, "origin/", 7) == 0) {
			git_branch_type = GIT_BRANCH_REMOTE;
		}
	}

	git_reference *branch_ref = NULL;
    if (git_branch_lookup(&branch_ref, repo, branch_name, git_branch_type) != 0) {
        fprintf(stderr, "Could not find branch: %s\n", branch_name);
        goto cleanup;
    }

	const git_oid *commit_id = git_reference_target(branch_ref);
    if (commit_id == NULL) {
        fprintf(stderr, "Could not find commit for branch: %s\n", branch_name);
        goto cleanup;
    }

	git_commit *commit = NULL;
    if (git_commit_lookup(&commit, repo, commit_id) != 0) {
        fprintf(stderr, "Could not lookup commit: %s\n", git_oid_tostr_s(commit_id));
        goto cleanup;
    }

	print_commit_info(commit);

cleanup:
    if (branch_ref) git_reference_free(branch_ref);

	return 0;
}

/** Helper to format a git_time value like Git. */
static void print_time(const git_time *intime, const char *prefix)
{
	char sign, out[32];
	struct tm *intm;
	int offset, hours, minutes;
	time_t t;

	offset = intime->offset;
	if (offset < 0) {
		sign = '-';
		offset = -offset;
	} else {
		sign = '+';
	}

	hours   = offset / 60;
	minutes = offset % 60;

	t = (time_t)intime->time + (intime->offset * 60);

	intm = gmtime(&t);
	strftime(out, sizeof(out), "%a %b %e %T %Y", intm);

	printf("%s%s %c%02d%02d\n", prefix, out, sign, hours, minutes);
}