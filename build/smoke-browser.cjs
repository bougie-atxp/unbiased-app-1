const assert = require("node:assert/strict");
const { execFile, spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const net = require("node:net");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { promisify } = require("node:util");

const exec = promisify(execFile);
const root = resolve(process.argv[2] ?? join(__dirname, "browser-bundle"));
const cli = join(root, "agent-browser");
const chrome = join(root, "Unbiased Browser.app", "Contents", "MacOS", "Google Chrome for Testing");
const supervisor = join(root, "browser-supervisor");

async function freePort() {
  const server = net.createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function main() {
  const cliVersion = (await exec(cli, ["--version"])).stdout.trim();
  assert.ok(existsSync(chrome), "Run npm run prepare:browser first");
  const plist = join(root, "Unbiased Browser.app", "Contents", "Info.plist");
  assert.equal((await exec("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist])).stdout.trim(), "ai.unbiased.browser");
  for (const key of ["CFBundleURLTypes", "CFBundleDocumentTypes"]) {
    await assert.rejects(exec("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist]));
  }
  const chromeVersion = (await exec(chrome, ["--version"])).stdout.trim();
  assert.equal(cliVersion, "agent-browser 0.38.1");

  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "unbiased-browser-smoke-"));
  const env = { ...process.env, AGENT_BROWSER_NAMESPACE: `ub-${randomUUID().slice(0, 8)}`, AGENT_BROWSER_EXECUTABLE_PATH: join(root, "browser-no-direct-launch") };
  const child = spawn(supervisor, [join(profile, "browser.pid"), chrome, profile,
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "about:blank",
  ], { detached: true, stdio: ["pipe", "ignore", "inherit"] });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (child.exitCode !== null) throw new Error(`Chrome exited with ${child.exitCode}`);
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })).ok;
      } catch {}
      if (ready) break;
      await new Promise((done) => setTimeout(done, 250));
    }
    if (!ready) throw new Error("Chrome did not open its CDP port");

    await exec(cli, ["connect", String(port)], { env, timeout: 30_000 });
    const fixture = "data:text/html," + encodeURIComponent('<h1>Browser smoke</h1><button onclick="this.textContent=\'Clicked\'">Press me</button>');
    await exec(cli, ["open", fixture, "--cdp", String(port)], { env, timeout: 30_000 });
    const snapshot = await exec(cli, ["snapshot", "--cdp", String(port)], { env, timeout: 30_000 });
    assert.match(snapshot.stdout, /heading "Browser smoke"/);
    const buttonRef = /button "Press me" \[ref=(\w+)\]/.exec(snapshot.stdout)?.[1];
    assert.ok(buttonRef, "snapshot should expose the fixture button");
    await exec(cli, ["click", `@${buttonRef}`, "--cdp", String(port)], { env, timeout: 30_000 });
    const clicked = await exec(cli, ["snapshot", "--cdp", String(port)], { env, timeout: 30_000 });
    assert.match(clicked.stdout, /button "Clicked"/);
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    assert.ok(tabs.some(tab => tab.url === fixture), "the controlled page must belong to the supervised browser");
    console.log(`${cliVersion}; ${chromeVersion}; CDP navigation and snapshot passed`);
    // Without an explicit CDP attachment the CLI must fail; otherwise a
    // disconnected daemon could silently spawn an unsupervised browser.
    await assert.rejects(exec(cli, ["open", "about:blank"], { env: { ...env, AGENT_BROWSER_NAMESPACE: `${env.AGENT_BROWSER_NAMESPACE}-unbound` }, timeout: 30000 }));
  } finally {
    try { await exec(cli, ["close"], { env, timeout: 10_000 }); } catch {}
    try { await exec(cli, ["close", "--all"], { env: { ...env, AGENT_BROWSER_NAMESPACE: `${env.AGENT_BROWSER_NAMESPACE}-unbound` }, timeout: 10_000 }); } catch {}
    if (child.exitCode === null) {
      const exited = new Promise((done) => child.once("exit", done));
      child.stdin.end();
      await Promise.race([exited, new Promise((done) => setTimeout(done, 5_000))]);
    }
    try { rmSync(profile, { recursive: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
