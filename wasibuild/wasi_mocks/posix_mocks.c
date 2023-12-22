#include "posix_mocks.h"
#include <errno.h>

char *realpath(const char *path, char *resolved_path) {
    if (resolved_path) {
        // Mock implementation - return an empty string or some mock path
        resolved_path[0] = '\0';
    }
    return resolved_path;
}

pid_t getpid(void) {
    return 1; // Mock PID
}

pid_t getppid(void) {
    return 1; // Mock Parent PID
}

pid_t getpgid(pid_t pid) {
    return 1; // Mock PGID
}

pid_t getsid(pid_t pid) {
    return 1; // Mock SID
}

uid_t getuid(void) {
    return 0; // Mock UID
}

gid_t getgid(void) {
    return 1000; // Mock GID
}

int chmod(const char *pathname, mode_t mode) {
    return 0; // Mock success
}

uid_t geteuid(void) {
    return 0; // Mock effective UID
}

struct passwd *getpwuid(uid_t uid) {
    static struct passwd dummy_passwd;
    // Populate dummy_passwd with mock data
    return &dummy_passwd;
}

int git_socket_stream_global_init(void) {
    return 0; // Mock success
}

void *git_socket_stream_new(int a, int b, int c) {
    return NULL; // Mock return
}

void *git_smart_subtransport_http(void) {
    return NULL; // Mock return
}

int getpwuid_r(uid_t uid, struct passwd *pwd, char *buf, size_t buflen, struct passwd **result) {
    if (!pwd || !buf || buflen < sizeof(struct passwd)) {
        errno = ERANGE;
        return ERANGE;
    }

    // You can fill in the `pwd` structure with mock data as needed
    pwd->pw_name = "codespace";
    pwd->pw_passwd = "mockpassword";
    pwd->pw_uid = uid;
    pwd->pw_gid = 0; // Mock GID
    pwd->pw_gecos = "Mock User";
    pwd->pw_dir = "/home/codespace";
    pwd->pw_shell = "/bin/sh";

    // Copy the structure to the provided buffer
    memcpy(buf, pwd, sizeof(struct passwd));

    // Set the result
    *result = (struct passwd *)buf;

    return 0; // Return success
}

// ... Add more function implementations as needed ...
