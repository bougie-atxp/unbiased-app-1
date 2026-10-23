import { join } from "node:path";

export function agentBrowserCandidates(resourcesPath: string, packaged: boolean, home: string, pathEnv: string): string[] {
  return [
    ...(packaged ? [join(resourcesPath, "browser", "agent-browser")] : []),
    ...pathEnv.split(":").filter(Boolean).map((dir) => join(dir, "agent-browser")),
    "/opt/homebrew/bin/agent-browser",
    "/usr/local/bin/agent-browser",
    join(home, ".local", "bin", "agent-browser"),
    join(home, ".npm-global", "bin", "agent-browser"),
    join(home, ".cargo", "bin", "agent-browser"),
  ];
}

export function automationBrowserPaths(resourcesPath: string, packaged: boolean, appPath: string) {
  const root = packaged ? join(resourcesPath, "browser") : join(appPath, "build", "browser-bundle");
  return {
    root,
    executable: join(root, "Unbiased Browser.app", "Contents", "MacOS", "Google Chrome for Testing"),
    supervisor: join(root, "browser-supervisor"),
    denyDirectLaunch: join(root, "browser-no-direct-launch"),
  };
}
