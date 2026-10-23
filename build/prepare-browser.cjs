// Stage a pinned CLI, private browser application, and lifetime supervisor.
const { execFileSync } = require("node:child_process");
const { copyFileSync, existsSync, mkdirSync, rmSync, renameSync, chmodSync, readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("The browser bundle currently supports only macOS arm64");
}

const root = join(__dirname, "..");
const cache = join(root, "build", ".browser-cache");
const bundle = join(root, "build", "browser-bundle");
const browserPin = require("./browser.lock.json");
const artifacts = [
  {
    file: "agent-browser-darwin-arm64-v0.38.1",
    url: "https://github.com/vercel-labs/agent-browser/releases/download/v0.38.1/agent-browser-darwin-arm64",
    sha256: "2e61287259053ea964d39e77002c6a34af0e589e55ccff25e659efae7e892e0d",
  },
  {
    file: "agent-browser-LICENSE-v0.38.1",
    url: "https://raw.githubusercontent.com/vercel-labs/agent-browser/v0.38.1/LICENSE",
    sha256: "014bb31e83d5c2e76aea1cc6e82217346ab41362f32cb355ad0f5c10aa0aeaff",
  },
  browserPin,
];

function checksum(path) {
  return execFileSync("shasum", ["-a", "256", path], { encoding: "utf8" }).split(" ")[0];
}

function fetchVerified({ file, url, sha256 }) {
  const path = join(cache, file);
  if (!existsSync(path) || checksum(path) !== sha256) {
    const partial = `${path}.partial`;
    rmSync(partial, { force: true });
    execFileSync("curl", ["--fail", "--location", "--retry", "3", "--output", partial, url], { stdio: "inherit" });
    if (checksum(partial) !== sha256) {
      rmSync(partial, { force: true });
      throw new Error(`SHA-256 mismatch for ${file}`);
    }
    renameSync(partial, path);
  }
  return path;
}

mkdirSync(cache, { recursive: true });
const [cli, license, chrome] = artifacts.map(fetchVerified);
rmSync(bundle, { recursive: true, force: true });
mkdirSync(bundle, { recursive: true });
copyFileSync(cli, join(bundle, "agent-browser"));
chmodSync(join(bundle, "agent-browser"), 0o755);
mkdirSync(join(bundle, "licenses", "agent-browser"), { recursive: true });
copyFileSync(license, join(bundle, "licenses", "agent-browser", "LICENSE"));
const unpacked = join(cache, "unpacked-chrome");
rmSync(unpacked, { recursive: true, force: true });
execFileSync("ditto", ["-x", "-k", chrome, unpacked]);
const browserApp = join(bundle, "Unbiased Browser.app");
execFileSync("ditto", [join(unpacked, "chrome-mac-arm64", "Google Chrome for Testing.app"), browserApp]);
const privateId = browserPin.bundleId;
function rewriteIdentities(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) rewriteIdentities(join(dir, item.name));
    if (item.isFile() && item.name === "Info.plist") {
      const plist = join(dir, item.name);
      let id;
      try { id = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plist], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { continue; }
      if (id.startsWith("com.google.chrome.for.testing")) {
        execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :CFBundleIdentifier ${id.replace("com.google.chrome.for.testing", privateId)}`, plist]);
      }
    }
  }
}
rewriteIdentities(browserApp);
const plist = join(browserApp, "Contents", "Info.plist");
for (const key of ["CFBundleURLTypes", "CFBundleDocumentTypes", "UTExportedTypeDeclarations", "UTImportedTypeDeclarations"]) {
  try { execFileSync("/usr/libexec/PlistBuddy", ["-c", `Delete :${key}`, plist], { stdio: "ignore" }); } catch {}
}
execFileSync("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleDisplayName Unbiased Browser", plist]);
execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", browserApp], { stdio: "inherit" });
execFileSync("codesign", ["--verify", "--deep", "--strict", browserApp]);
execFileSync("clang", ["-Wall", "-Wextra", "-Werror", "-O2", "-mmacosx-version-min=13.0", join(__dirname, "browser-supervisor.c"), "-o", join(bundle, "browser-supervisor")], { stdio: "inherit" });
writeFileSync(join(bundle, "browser-no-direct-launch"), '#!/bin/sh\nprintf "%s\\n" "Unbiased Browser must be launched by its lifetime supervisor. Retry the browser tool." >&2\nexit 1\n', { mode: 0o755 });
writeFileSync(join(bundle, "browser.json"), JSON.stringify({ version: browserPin.version, minimumMacOS: browserPin.minimumMacOS, bundleId: privateId, executable: "Unbiased Browser.app/Contents/MacOS/Google Chrome for Testing" }, null, 2) + "\n");
rmSync(unpacked, { recursive: true, force: true });
console.log(`Browser bundle ready: ${bundle}`);
