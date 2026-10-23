import { execFile } from "node:child_process";
import type { ProjectRecord, SourceAttachment } from "./project-identity";
export type GitRunner = (cwd: string, args: string[]) => Promise<string>;
export const readGit: GitRunner = (cwd, args) =>
  new Promise((resolve, reject) =>
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout: 10_000, maxBuffer: 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    ),
  );
export type Preflight = {
  sourceId: string;
  repositoryId: string | null;
  checkoutId: string;
  path: string;
  branch?: string;
  commit?: string;
  remote?: string;
  upstream?: string;
  worktreeName?: string;
  blocker: string | null;
};
async function check(
  source: SourceAttachment,
  git: GitRunner,
): Promise<Preflight> {
  const base = {
    sourceId: source.id,
    repositoryId: source.repositoryId,
    checkoutId: source.checkoutId,
    path: source.path,
  };
  try {
    await git(source.path, ["rev-parse", "--show-toplevel"]);
    if (!source.repositoryId)
      return {
        ...base,
        blocker:
          "Git initialized after registration; refresh repository identity before handoff.",
      };
    const branch = await git(source.path, [
      "symbolic-ref",
      "--short",
      "HEAD",
    ]).catch(() => "");
    if (!branch)
      return {
        ...base,
        blocker: "Detached HEAD: choose and push an origin branch.",
      };
    const commit = await git(source.path, ["rev-parse", "HEAD"]);
    const upstream = await git(source.path, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]).catch(() => "");
    if (!upstream || !upstream.startsWith("origin/"))
      return {
        ...base,
        branch,
        commit,
        blocker:
          "Set an origin upstream, then commit and push before connecting.",
      };
    const remote = await git(source.path, ["remote", "get-url", "origin"]);
    // Reject embedded credentials and local remotes; do not return them to the renderer.
    let safeRemote: string;
    try {
      const u = new URL(remote);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        throw new Error();
      safeRemote = u.href;
    } catch {
      return {
        ...base,
        branch,
        commit,
        blocker:
          "Cloud v1 requires an HTTPS origin without embedded credentials; configure an approved credential reference separately.",
      };
    }
    const dirty = await git(source.path, [
      "status",
      "--porcelain",
      "--untracked-files=normal",
    ]);
    const ahead = await git(source.path, [
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...${upstream}`,
    ]);
    const [local, behind] = ahead.split(/\s+/).map(Number);
    const metadata = {
      ...base,
      branch,
      commit,
      remote: safeRemote,
      upstream,
      worktreeName: source.path.split("/").pop(),
    };
    if (dirty || local !== 0 || behind !== 0)
      return {
        ...metadata,
        blocker:
          "Commit and push this checkout to its origin branch, then refresh. Uncommitted files are never transferred.",
      };
    return { ...metadata, blocker: null };
  } catch {
    return {
      ...base,
      blocker:
        "Initialize Git, commit, and configure/push an origin upstream explicitly before connecting.",
    };
  }
}
export async function gitPreflight(
  project: ProjectRecord,
  git: GitRunner = readGit,
): Promise<Preflight[]> {
  return Promise.all(project.sources.map((s) => check(s, git)));
}

/** Non-secret metadata target for a future prepare endpoint. No credential or host path fields. */
export type HandoffIntent = {
  schemaVersion: 1;
  attemptId: string;
  localConversationId: string;
  projectId: string | null;
  owner: { organizationId: string; memberId: string };
  environments: {
    scope: import("./environment").SettingsScope;
    revision: number;
    digest: string;
  }[];
  repositories: {
    sourceId: string;
    repositoryId: string;
    checkoutId: string;
    branch: string;
    commit: string;
    remote: string;
    upstream: string;
    worktreeName?: string;
    access: "read" | "write";
  }[];
  unavailableCapabilities: (
    | "local_computer_control"
    | "local_browser_session"
  )[];
};
