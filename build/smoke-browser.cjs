// Component conformance tests are owned by the pinned browser repository.
const { prepare } = require("./prepare-browser.cjs");
const { execFileSync } = require("node:child_process");
const { resolve, join } = require("node:path");
const source = prepare(true);
execFileSync(process.execPath, [join(source, "scripts", "smoke-browser.cjs"),
  resolve(process.argv[2] ?? "build/browser-bundle"),
  resolve(process.argv[3] ?? "build/browser-runtime/main.js")], { cwd: source, stdio: "inherit" });
