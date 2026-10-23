// Explicit interactive macOS regression check. Opens harmless test URLs in
// the user's configured browser; never quits/restarts their everyday browser.
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { once } = require("node:events");
const net = require("node:net");

async function main() {
  const root = join(__dirname, "browser-bundle");
  const temp = mkdtempSync(join(tmpdir(), "unbiased-routing-"));
  const probe = join(temp, "routing-probe");
  // NSWorkspace completion proves delivery, not page-load completion. Keep
  // the tiny fixture outside the deleted profile so Chrome can finish loading.
  const html = join(tmpdir(), "unbiased-browser-routing-check.html");
  const record = join(temp, "browser.pid");
  writeFileSync(html, "<!doctype html><title>Unbiased link routing check</title><h1>Link reached your visible browser</h1>");
  execFileSync("swiftc", [join(__dirname, "browser-routing-probe.swift"), "-o", probe]);
  const server = net.createServer();
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise(done => server.close(done));
  const child = spawn(join(root, "browser-supervisor"), [record,
    join(root, "Unbiased Browser.app/Contents/MacOS/Google Chrome for Testing"), temp,
    "--headless=new", `--user-data-dir=${temp}`, `--remote-debugging-port=${port}`, "--no-first-run", "about:blank",
  ], { detached: true, stdio: ["pipe", "pipe", "inherit"] });
  try {
    await once(child.stdout, "data");
    const pid = Number(readFileSync(record, "utf8").split(" ")[0]);
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {}
      if (ready) break;
      await new Promise(done => setTimeout(done, 100));
    }
    assert.ok(ready, "private browser CDP startup");
    for (const url of ["https://example.com/#unbiased-link-routing", require("node:url").pathToFileURL(html).href]) {
      process.stdout.write(execFileSync(probe, [url, String(pid)], { encoding: "utf8" }));
    }
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    assert.ok(!tabs.some(tab => tab.url.includes("unbiased-link-routing") || tab.url.includes("unbiased-routing.html")), "external links must not enter automation tabs");
    const exit = once(child, "exit"); child.stdin.end(); await exit;
    for (const url of ["https://example.com/#unbiased-after-cleanup", require("node:url").pathToFileURL(html).href]) {
      process.stdout.write(execFileSync(probe, [url, String(pid)], { encoding: "utf8" }));
    }
    console.log(`Launch Services routing passed with automation running and after cleanup. Everyday Chrome was not restarted. HTML fixture retained at ${html}.`);
  } finally {
    if (child.exitCode === null) { child.stdin.end(); await once(child, "exit"); }
    rmSync(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
