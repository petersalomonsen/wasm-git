#include <sys/types.h>
#include <stddef.h>

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

// Mock function similar to 'getpwnam' in pwd.h
struct passwd *getpwnam(const char *name) {
    static struct passwd mock_user;

    // Hardcoded user information
    mock_user.pw_name = "mockuser";
    mock_user.pw_passwd = "mockpassword";
    mock_user.pw_uid = 1000;
    mock_user.pw_gid = 1000;
    mock_user.pw_gecos = "Mock User";
    mock_user.pw_dir = "/home/mockuser";
    mock_user.pw_shell = "/bin/sh";

    return &mock_user;
}

// ... other mock functions as needed ...
