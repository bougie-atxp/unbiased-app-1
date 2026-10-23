// A separate process group keeps this guardian alive when Electron is killed.
// The private stdin pipe is a lifetime lease, not a browser command channel.
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <limits.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/sysctl.h>
#include <sys/wait.h>
#include <unistd.h>

static volatile sig_atomic_t stopping;
static void stop(int sig) { (void)sig; stopping = 1; }

static int identity(pid_t pid, struct proc_bsdinfo *info) {
  return proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, sizeof(*info)) == sizeof(*info);
}

static int matches(pid_t pid, const char *executable, const char *profile) {
  char actual[PROC_PIDPATHINFO_MAXSIZE], expected[PATH_MAX];
  if (!realpath(executable, expected) || proc_pidpath(pid, actual, sizeof(actual)) <= 0 || strcmp(actual, expected)) return 0;
  int mib[] = { CTL_KERN, KERN_PROCARGS2, pid };
  size_t size = 0;
  if (sysctl(mib, 3, NULL, &size, NULL, 0) || size < sizeof(int)) return 0;
  char *data = malloc(size);
  if (!data) return 0;
  if (sysctl(mib, 3, data, &size, NULL, 0) || size < sizeof(int)) { free(data); return 0; }
  int argc; memcpy(&argc, data, sizeof(argc));
  char *p = data + sizeof(argc), *end = data + size;
  p += strnlen(p, (size_t)(end - p));
  while (p < end && !*p) p++;
  char flag[PATH_MAX + 32]; snprintf(flag, sizeof(flag), "--user-data-dir=%s", profile);
  int found = 0;
  for (int i = 0; i < argc && p < end; i++) {
    size_t len = strnlen(p, (size_t)(end - p));
    if (p + len == end) break;
    if (!strcmp(p, flag)) found = 1;
    p += len + 1;
  }
  free(data);
  return found;
}

static void shutdown_group(pid_t pid) {
  struct proc_bsdinfo original;
  int had_identity = identity(pid, &original);
  // This group was created by us; never signal all Chrome processes.
  kill(-pid, SIGTERM);
  for (int i = 0; i < 20; i++) {
    if (kill(-pid, 0) && errno == ESRCH) return;
    usleep(100000);
  }
  struct proc_bsdinfo current;
  if (had_identity && identity(pid, &current) &&
      (current.pbi_start_tvsec != original.pbi_start_tvsec || current.pbi_start_tvusec != original.pbi_start_tvusec)) return;
  kill(-pid, SIGKILL);
}

static int recover(const char *record, const char *executable, const char *profile) {
  FILE *f = fopen(record, "r");
  if (!f) return errno == ENOENT ? 0 : 1;
  int pid; unsigned long long sec, usec;
  int valid = fscanf(f, "%d %llu %llu", &pid, &sec, &usec) == 3;
  fclose(f);
  struct proc_bsdinfo info;
  // PID plus start time plus executable plus exact profile: stale/reused PIDs
  // and unrelated debuggable browsers are never authority to terminate.
  if (valid && pid > 1 && identity(pid, &info) &&
      info.pbi_start_tvsec == sec && info.pbi_start_tvusec == usec &&
      matches(pid, executable, profile) && getpgid(pid) == pid) shutdown_group(pid);
  unlink(record);
  return 0;
}

static int retire_legacy(const char *profile) {
  const char *browsers[] = {
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  };
  int bytes = proc_listpids(PROC_ALL_PIDS, 0, NULL, 0);
  if (bytes <= 0) return 1;
  pid_t *pids = calloc(1, (size_t)bytes + 4096);
  if (!pids) return 1;
  bytes = proc_listpids(PROC_ALL_PIDS, 0, pids, bytes + 4096);
  for (int i = 0; i < bytes / (int)sizeof(pid_t); i++) {
    for (int b = 0; b < 4; b++) {
      if (pids[i] <= 1 || !matches(pids[i], browsers[b], profile)) continue;
      struct proc_bsdinfo info;
      if (!identity(pids[i], &info)) continue;
      if (info.pbi_ppid != 1) {
        fprintf(stderr, "An older live Unbiased instance owns the legacy browser; quit it first.\n");
        free(pids); return 73;
      }
      // Legacy Chrome did not have a private process group. Gracefully stop
      // only this verified root; never signal its inherited process group.
      kill(pids[i], SIGTERM);
      for (int retry = 0; retry < 30; retry++) {
        struct proc_bsdinfo now;
        if (!identity(pids[i], &now) || now.pbi_start_tvsec != info.pbi_start_tvsec || now.pbi_start_tvusec != info.pbi_start_tvusec) break;
        usleep(100000);
      }
      if (matches(pids[i], browsers[b], profile)) {
        fprintf(stderr, "Legacy browser did not exit; close the old Unbiased browser before retrying.\n");
        free(pids); return 74;
      }
    }
  }
  free(pids); return 0;
}

int main(int argc, char **argv) {
  if (argc == 5 && !strcmp(argv[1], "--owns")) return matches((pid_t)atoi(argv[2]), argv[3], argv[4]) ? 0 : 1;
  if (argc == 3 && !strcmp(argv[1], "--retire-legacy")) return retire_legacy(argv[2]);
  // supervisor [--recover] record executable profile [browser args...]
  int recovery = argc > 1 && !strcmp(argv[1], "--recover");
  int base = recovery ? 2 : 1;
  if (argc < base + 3) return 64;
  const char *record = argv[base], *executable = argv[base + 1], *profile = argv[base + 2];
  char lock_path[PATH_MAX];
  int lock_length = snprintf(lock_path, sizeof(lock_path), "%s.lock", record);
  if (lock_length < 0 || (size_t)lock_length >= sizeof(lock_path)) return 64;
  int lock = open(lock_path, O_CREAT | O_RDWR | O_CLOEXEC | O_NOFOLLOW, 0600);
  if (lock < 0 || flock(lock, LOCK_EX | LOCK_NB)) {
    fprintf(stderr, "Another Unbiased instance owns this automation browser.\n"); return 73;
  }
  if (recover(record, executable, profile)) return 74;
  if (recovery) return 0;
  signal(SIGTERM, stop); signal(SIGINT, stop); signal(SIGHUP, stop);
  // Ignore SIGPIPE so cleanup still runs if Electron disappears during ready.
  signal(SIGPIPE, SIG_IGN);
  pid_t pid = fork();
  if (pid < 0) return 71;
  if (!pid) {
    if (setpgid(0, 0)) _exit(71);
    int null = open("/dev/null", O_RDWR);
    if (null < 0 || dup2(null, 0) < 0 || dup2(null, 1) < 0 || dup2(null, 2) < 0) _exit(71);
    if (null > 2) close(null);
    char **args = calloc((size_t)argc + 1, sizeof(char *));
    if (!args) _exit(71);
    args[0] = (char *)executable;
    for (int i = base + 3; i < argc; i++) args[i - base - 2] = argv[i];
    execv(executable, args);
    _exit(71);
  }
  setpgid(pid, pid);
  if (getpgid(pid) != pid) { kill(pid, SIGKILL); waitpid(pid, NULL, 0); return 71; }
  struct proc_bsdinfo info;
  if (!identity(pid, &info)) { shutdown_group(pid); waitpid(pid, NULL, 0); return 71; }
  int fd = open(record, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0600);
  if (fd < 0) { shutdown_group(pid); waitpid(pid, NULL, 0); return 74; }
  int written = dprintf(fd, "%d %llu %llu\n", pid, info.pbi_start_tvsec, info.pbi_start_tvusec);
  int synced = fsync(fd);
  int closed = close(fd);
  if (written < 0 || synced || closed) {
    shutdown_group(pid); waitpid(pid, NULL, 0); unlink(record); return 74;
  }
  printf("%d\n", pid); fflush(stdout);
  struct pollfd lease = { .fd = STDIN_FILENO, .events = POLLIN | POLLHUP };
  while (!stopping) {
    // WNOWAIT keeps the root PID reserved until the entire group is stopped.
    siginfo_t exited = {0};
    if (!waitid(P_PID, (id_t)pid, &exited, WEXITED | WNOHANG | WNOWAIT) && exited.si_pid) break;
    int result = poll(&lease, 1, 100);
    if (result > 0) {
      char buffer[64];
      if ((lease.revents & (POLLHUP | POLLERR | POLLNVAL)) || read(0, buffer, sizeof(buffer)) <= 0) break;
    }
  }
  shutdown_group(pid);
  waitpid(pid, NULL, 0);
  unlink(record);
  return 0;
}
