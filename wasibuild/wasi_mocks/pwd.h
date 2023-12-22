#ifndef MOCK_PWD_H
#define MOCK_PWD_H

#include <sys/types.h>

// Mock structure similar to 'struct passwd' in pwd.h
struct passwd {
    char *pw_name;   // user's name
    char *pw_passwd; // user's password
    uid_t pw_uid;    // user's user ID
    gid_t pw_gid;    // user's group ID
    char *pw_gecos;  // user's real name
    char *pw_dir;    // user's home directory
    char *pw_shell;  // user's shell program
};

// Mock function declaration
struct passwd *getpwnam(const char *name);

#endif // MOCK_PWD_H
