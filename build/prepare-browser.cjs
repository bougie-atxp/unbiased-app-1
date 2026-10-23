// Build one immutable browser component revision. No browser implementation lives here.
const fs = require("node:fs");
const { join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");
const root = resolve(__dirname, "..");
const lock = require("../browser-runtime.lock.json");
function run(command, args, cwd, capture = false) {
  const env = { ...process.env };
  // GitHub App token is scoped by CI to this repository. Do not put it in URLs/logs.
  if (env.GITHUB_TOKEN) {
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader";
    env.GIT_CONFIG_VALUE_0 = "AUTHORIZATION: basic " + Buffer.from("x-access-token:" + env.GITHUB_TOKEN).toString("base64");
  }
  return execFileSync(command, args, { cwd, env, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
}
function sourceDirectory() {
  if (lock.repository !== "circuitandchisel/unbiased-browser" || !/^[a-f0-9]{40}$/.test(lock.revision) || lock.protocolVersion !== 1 || !/^\d+\.\d+\.\d+$/.test(lock.version)) throw new Error("Invalid browser component lock");
  const override = process.env.UNBIASED_BROWSER_SOURCE_DIR;
  const source = override ? resolve(override) : join(root, "build", ".browser-source", lock.revision);
  if (!fs.existsSync(join(source, ".git")) && !override) {
    fs.mkdirSync(source, { recursive: true });
    run("git", ["init", "--quiet"], source);
    run("git", ["remote", "add", "origin", `https://github.com/${lock.repository}.git`], source);
  }
  let head;
  try { head = run("git", ["rev-parse", "HEAD"], source, true).trim(); } catch {}
  if (head !== lock.revision && !override) {
    run("git", ["fetch", "--depth", "1", "origin", lock.revision], source);
    run("git", ["checkout", "--detach", lock.revision], source);
    head = run("git", ["rev-parse", "HEAD"], source, true).trim();
  }
  if (head !== lock.revision) throw new Error("Browser source must match browser-runtime.lock.json exactly");
  if (run("git", ["status", "--porcelain", "--untracked-files=no"], source, true).trim()) throw new Error("Browser source has tracked modifications; commit and update the pin first");
  const pkg = JSON.parse(fs.readFileSync(join(source, "package.json"), "utf8"));
  if (pkg.version !== lock.version) throw new Error("Browser package version does not match its pin");
  return source;
}
function prepare(runtimeOnly = false) {
  const source = sourceDirectory();
  // Conformance wrappers execute from this checkout, including after a cached
  // runtime was prepared from a different local checkout of the same revision.
  if (!fs.existsSync(join(source, "node_modules", "tsx", "package.json"))) run("npm", ["ci"], source);
  const destination = join(root, "build", "browser-runtime");
  const stamp = join(destination, "source.json");
  let prior;
  try { prior = JSON.parse(fs.readFileSync(stamp, "utf8")); } catch {}
  const nativeDestination = join(root, "build", "browser-bundle");
  const current = prior?.revision === lock.revision && fs.existsSync(join(destination, "main.js")) && fs.existsSync(join(destination, "client.d.ts"));
  if (current && (runtimeOnly || (prior.native && fs.existsSync(join(nativeDestination, "browser-supervisor"))))) return source;
  if (!current) {
    run("npm", ["ci"], source);
    run("npm", ["run", "build"], source);
    const component = JSON.parse(fs.readFileSync(join(source, "dist", "component.json"), "utf8"));
    if (component.version !== lock.version || component.protocolVersion !== lock.protocolVersion) throw new Error("Browser build metadata is incompatible");
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(join(source, "dist"))) {
      if (/\.(js|d\.ts)$/.test(name) || name === "component.json") fs.copyFileSync(join(source, "dist", name), join(destination, name));
    }
    for (const name of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) fs.copyFileSync(join(source, name), join(destination, name));
  }
  if (!runtimeOnly) {
    run("npm", ["run", "prepare:browser"], source);
    fs.rmSync(nativeDestination, { recursive: true, force: true });
    fs.cpSync(join(source, "build", "browser-bundle"), nativeDestination, { recursive: true, verbatimSymlinks: true });
  }
  fs.writeFileSync(stamp, JSON.stringify({ ...lock, native: !runtimeOnly || (current && prior.native) }, null, 2) + "\n");
  return source;
}
module.exports = { prepare };
if (require.main === module) prepare(process.argv.includes("--runtime-only"));
