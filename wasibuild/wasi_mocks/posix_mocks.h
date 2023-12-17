#ifndef POSIX_MOCKS_H
#define POSIX_MOCKS_H

#include <sys/types.h>
#include <unistd.h>
#include "pwd.h"

// Mock function declarations
char *realpath(const char *path, char *resolved_path);
pid_t getpid(void);
pid_t getppid(void);
pid_t getpgid(pid_t pid);
pid_t getsid(pid_t pid);
uid_t getuid(void);
gid_t getgid(void);
int chmod(const char *pathname, mode_t mode);
uid_t geteuid(void);
struct passwd *getpwuid(uid_t uid);
int git_socket_stream_global_init(void);
void *git_socket_stream_new(int a, int b, int c);
void *git_smart_subtransport_http(void);
int getpwuid_r(uid_t uid, struct passwd *pwd, char *buf, size_t buflen, struct passwd **result);

#endif // POSIX_MOCKS_H
