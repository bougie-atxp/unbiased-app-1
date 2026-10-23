import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));
function alive(pid: number) {
  try {
    // A reparented zombie cannot execute or hold the debugging port.
    return !execFileSync("ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().startsWith("Z");
  } catch { return false; }
}
async function eventually(check: () => boolean) {
  for (let i = 0; i < 80; i++) { if (check()) return; await delay(100); }
  assert.ok(check(), "process did not reach the expected lifetime state");
}

test("native browser guardian handles owner death, recovery and ownership boundaries", { skip: process.platform !== "darwin", timeout: 40000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "unbiased-guardian-test-"));
  const supervisor = join(root, "guardian");
  const executable = join(root, "test browser");
  execFileSync("clang", ["-Wall", "-Wextra", "-Werror", resolve("build/browser-supervisor.c"), "-o", supervisor]);
  const fixture = join(root, "browser.c");
  writeFileSync(fixture, `
    #include <signal.h>
    #include <stdio.h>
    #include <string.h>
    #include <unistd.h>
    int main(int argc, char **argv) {
      signal(SIGTERM, SIG_IGN);
      const char *profile = NULL;
      for (int i=1;i<argc;i++) if (!strncmp(argv[i], "--user-data-dir=", 16)) profile=argv[i]+16;
      if (!profile) return 1;
      pid_t child=fork();
      if (child>0) { char file[4096]; snprintf(file,sizeof(file),"%s/grandchild.pid",profile); FILE *f=fopen(file,"w"); fprintf(f,"%d",child); fclose(f); }
      for (;;) pause();
    }
  `);
  execFileSync("clang", [fixture, "-o", executable]);
  const children: ChildProcess[] = [];
  async function launch(name: string) {
    const profile = mkdtempSync(join(root, name));
    const record = join(profile, "browser.pid");
    const child = spawn(supervisor, [record, executable, profile, `--user-data-dir=${profile}`], { detached: true, stdio: ["pipe", "pipe", "pipe"] });
    children.push(child);
    child.stderr!.resume();
    await once(child.stdout!, "data");
    const pid = Number(readFileSync(record, "utf8").split(" ")[0]);
    await eventually(() => { try { return Number(readFileSync(join(profile, "grandchild.pid"), "utf8")) > 0; } catch { return false; } });
    const grandchild = Number(readFileSync(join(profile, "grandchild.pid"), "utf8"));
    return { child, profile, record, pid, grandchild };
  }
  try {
    await t.test("lease closure terminates browser and TERM-resistant descendants", async () => {
      const browser = await launch("lease-");
      browser.child.stdin!.end();
      await eventually(() => !alive(browser.pid) && !alive(browser.grandchild));
    });
    await t.test("live lock and exact executable/profile prevent taking another browser", async () => {
      const browser = await launch("ownership-");
      assert.throws(() => execFileSync(supervisor, ["--recover", browser.record, executable, browser.profile], { stdio: "ignore" }));
      execFileSync(supervisor, ["--owns", String(browser.pid), executable, browser.profile]);
      assert.throws(() => execFileSync(supervisor, ["--owns", String(browser.pid), executable, `${browser.profile}-lookalike`], { stdio: "ignore" }));
      assert.throws(() => execFileSync(supervisor, ["--owns", String(browser.pid), "/bin/sleep", browser.profile], { stdio: "ignore" }));
      assert.ok(alive(browser.pid));
      browser.child.stdin!.end();
      await eventually(() => !alive(browser.pid));
    });
    await t.test("guardian crash is recoverable, while stale/reused PID records are ignored", async () => {
      const browser = await launch("recover-");
      const record = readFileSync(browser.record, "utf8");
      const exited = once(browser.child, "exit");
      browser.child.kill("SIGKILL"); await exited;
      execFileSync(supervisor, ["--recover", browser.record, executable, `${browser.profile}-lookalike`]);
      assert.ok(alive(browser.pid), "a different profile must not authorize termination");
      writeFileSync(browser.record, record);
      execFileSync(supervisor, ["--recover", browser.record, "/bin/sleep", browser.profile]);
      assert.ok(alive(browser.pid), "a different executable must not authorize termination");
      writeFileSync(browser.record, `${browser.pid} 0 0\n`);
      execFileSync(supervisor, ["--recover", browser.record, executable, browser.profile]);
      assert.ok(alive(browser.pid), "mismatched start time must not terminate a process");
      writeFileSync(browser.record, record);
      execFileSync(supervisor, ["--recover", browser.record, executable, browser.profile]);
      await eventually(() => !alive(browser.pid) && !alive(browser.grandchild));
    });
    await t.test("SIGKILL of the owner closes the guardian lease", async () => {
      const profile = mkdtempSync(join(root, "owner-"));
      const record = join(profile, "browser.pid");
      const owner = spawn(process.execPath, ["-e", `
        const child = require('node:child_process').spawn(process.argv[1], process.argv.slice(2), {detached:true,stdio:['pipe','pipe','ignore']});
        child.stdout.once('data', () => process.stdout.write('ready'));
        setInterval(() => {}, 1000);
      `, supervisor, record, executable, profile, `--user-data-dir=${profile}`], { stdio: ["ignore", "pipe", "inherit"] });
      children.push(owner);
      await once(owner.stdout!, "data");
      const pid = Number(readFileSync(record, "utf8").split(" ")[0]);
      const exited = once(owner, "exit"); owner.kill("SIGKILL"); await exited;
      await eventually(() => !alive(pid));
    });
  } finally {
    for (const child of children) { child.stdin?.end(); if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); }
    rmSync(root, { recursive: true, force: true });
  }
});
