/* POSIX identity stubs for WASI, which has no users or processes. */
#ifdef __wasi__
#include <sys/types.h>

uid_t getuid(void) { return 0; }
uid_t geteuid(void) { return 0; }
gid_t getgid(void) { return 0; }
pid_t getpid(void) { return 1; }
pid_t getppid(void) { return 0; }
pid_t getsid(pid_t pid) { (void)pid; return 1; }
pid_t getpgid(pid_t pid) { (void)pid; return 1; }
#endif
