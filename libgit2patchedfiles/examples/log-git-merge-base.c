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

int lg2_log_git_merge_base(git_repository *repo, int argc, char *argv[])
{
	git_oid merge_base_oid;
	char* commit_id_1 = NULL;
	char* commit_id_2 = NULL;
	git_commit *commit_1 = NULL;
    git_commit *commit_2 = NULL;
	git_oid oid_1;
    git_oid oid_2;
	int error;

	if (argc != 3) {
		fprintf(stderr, "You have to specify exactly two commit ids. Usage: git log-git-merge-base <commitId1> <commitId2>\n");
        goto cleanup;
	} else {
		commit_id_1 = argv[1];
		commit_id_2 = argv[2];
	}

	// Lookup commit_id_1 commit by hash
    error = git_oid_fromstr(&oid_1, commit_id_1);
    if (error < 0) {
        fprintf(stderr, "Failed to convert commitId1 commit hash.\n");
        goto cleanup;
    }

    error = git_commit_lookup(&commit_1, repo, &oid_1);
    if (error < 0) {
        fprintf(stderr, "Failed to lookup commitId1 commit.\n");
        goto cleanup;
    }

    // Lookup commit_id_2 commit by hash
    error = git_oid_fromstr(&oid_2, commit_id_2);
    if (error < 0) {
        fprintf(stderr, "Failed to convert commitId2 commit hash.\n");
        goto cleanup;
    }

    error = git_commit_lookup(&commit_2, repo, &oid_2);
    if (error < 0) {
        fprintf(stderr, "Failed to lookup commitId2 commit.\n");
        goto cleanup;
    }

    // Find the merge base between commitId1 and commitId2
    error = git_merge_base(&merge_base_oid, repo, &oid_1, &oid_2);
    if (error < 0) {
        fprintf(stderr, "Failed to find merge base.\n");
        goto cleanup;
    }

    // Convert the merge base oid to a hex string and print it
    char merge_base_str[40 + 1];
    git_oid_tostr(merge_base_str, sizeof(merge_base_str), &merge_base_oid);
    printf("Merge base commit hash: %s\n", merge_base_str);

cleanup:
    git_commit_free(commit_1);
    git_commit_free(commit_2);

	return 0;
}
