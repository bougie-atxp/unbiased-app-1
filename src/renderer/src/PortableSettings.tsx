import { useState } from "react";
import type {
  EnvironmentManifest,
  Owner,
  SettingsScope,
} from "../../main/environment";
export type PortableAPI = {
  target(): Promise<{
    owner: Owner;
    conversationId: string | null;
    projectId: string | null;
    projectResolution: string;
    projects: { id: string; name: string }[];
  }>;
  read(scope: SettingsScope): Promise<EnvironmentManifest | null>;
  resolve(scope: SettingsScope): Promise<EnvironmentManifest | null>;
  install(p: {
    scope: SettingsScope;
    path: string;
    name: string;
    expectedRevision: number;
  }): Promise<{ note: string }>;
  write(p: {
    manifest: EnvironmentManifest;
    expectedRevision: number;
  }): Promise<unknown>;
  choose(): Promise<{ path: string | null }>;
  assignProject(
    thread: string,
    projectId: string | null,
  ): Promise<{ ok: boolean }>;
};
export function PortableSettings({ api }: { api: PortableAPI }) {
  const [target, setTarget] = useState<Awaited<
    ReturnType<PortableAPI["target"]>
  > | null>(null);
  const [scope, setScope] = useState<SettingsScope>({ kind: "global" });
  const [manifest, setManifest] = useState<EnvironmentManifest | null>(null);
  const [inherited, setInherited] = useState<EnvironmentManifest | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  async function load(next: SettingsScope) {
    setBusy(true);
    try {
      setScope(next);
      setManifest(await api.read(next));
      setInherited(await api.resolve(next));
      setMessage("");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function open() {
    setBusy(true);
    try {
      const t = await api.target();
      setTarget(t);
      setManifest(await api.read({ kind: "global" }));
      setInherited(await api.resolve({ kind: "global" }));
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        marginTop: 16,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <strong>Portable account settings</strong>
      <p>
        These settings belong to your organization and user. Existing folder
        skills stay in their original scope. Saved skills await engine support
        before they can run.
      </p>
      {!target ? (
        <button disabled={busy} onClick={() => void open()}>
          Open scoped settings
        </button>
      ) : (
        <>
          {target.conversationId && (
            <p>
              <label>
                Conversation project ({target.projectResolution}){" "}
                <select
                  value={target.projectId ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    void (async () => {
                      setBusy(true);
                      try {
                        await api.assignProject(
                          target.conversationId!,
                          e.target.value || null,
                        );
                        setTarget(await api.target());
                        await load({ kind: "global" });
                      } catch (error) {
                        setMessage(String(error));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  <option value="">Regular conversation</option>
                  {target.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>{" "}
              Changing this association does not change the conversation's
              working directory or access.
            </p>
          )}
          <label>
            Apply to{" "}
            <select
              disabled={busy}
              value={scope.kind}
              onChange={(e) =>
                void load(
                  e.target.value === "project"
                    ? { kind: "project", projectId: target.projectId! }
                    : e.target.value === "conversation"
                      ? {
                          kind: "conversation",
                          projectId: target.projectId,
                          conversationId: target.conversationId!,
                        }
                      : { kind: "global" },
                )
              }
            >
              <option value="global">This organization and user</option>
              <option value="project" disabled={!target.projectId}>
                This project, across its repositories
              </option>
              <option value="conversation" disabled={!target.conversationId}>
                This conversation and its side chats
              </option>
            </select>
          </label>
          <p>
            Revision {manifest?.revision ?? 0}. Installing saves immediately.
            Skills are unavailable for execution until isolated engine
            activation is supported.
          </p>
          {(inherited?.skills ?? [])
            .filter((s) => !manifest?.skills.some((own) => own.id === s.id))
            .map((s) => (
              <p key={s.id}>
                {s.name} · inherited from {s.origin.kind} ·{" "}
                {s.enabled ? "saved, activation unavailable" : "disabled"}{" "}
                <button
                  disabled={busy || !s.enabled}
                  onClick={() =>
                    void (async () => {
                      setBusy(true);
                      try {
                        const base: EnvironmentManifest = manifest ?? {
                          schemaVersion: 1,
                          owner: target.owner,
                          scope,
                          revision: 0,
                          skills: [],
                          connectors: [],
                          repositories: [],
                        };
                        await api.write({
                          manifest: {
                            ...base,
                            revision: base.revision + 1,
                            skills: [
                              ...base.skills,
                              { ...s, origin: scope, enabled: false },
                            ],
                          },
                          expectedRevision: base.revision,
                        });
                        await load(scope);
                      } catch (error) {
                        setMessage(String(error));
                      } finally {
                        setBusy(false);
                      }
                    })()
                  }
                >
                  Disable in this scope
                </button>
              </p>
            ))}
          {(manifest?.skills ?? []).map((skill) => (
            <div key={skill.id} style={{ marginBottom: 8 }}>
              {skill.name} · {skill.origin.kind} ·{" "}
              {skill.enabled ? "saved, activation unavailable" : "disabled"}{" "}
              <button
                disabled={busy || !skill.enabled}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      await api.write({
                        manifest: {
                          ...manifest!,
                          revision: manifest!.revision + 1,
                          skills: manifest!.skills.map((s) =>
                            s.id === skill.id ? { ...s, enabled: false } : s,
                          ),
                        },
                        expectedRevision: manifest!.revision,
                      });
                      await load(scope);
                    } catch (e) {
                      setMessage(String(e));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                Disable
              </button>
            </div>
          ))}
          <label>
            Skill name{" "}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>{" "}
          <button
            disabled={busy || !name.trim()}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  const picked = await api.choose();
                  if (!picked.path) return;
                  const result = await api.install({
                    scope,
                    path: picked.path,
                    name: name.trim(),
                    expectedRevision: manifest?.revision ?? 0,
                  });
                  await load(scope);
                  setMessage(result.note);
                } catch (e) {
                  setMessage(String(e));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Choose reviewed SKILL.md and save
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export type CloudAPI = {
  status(): Promise<{ eligible: boolean; available: boolean; reason: string }>;
  preflight(): Promise<{
    repositories: { path: string; blocker: string | null }[];
    reason: string;
  }>;
};
export function CloudReadiness({ api }: { api: CloudAPI }) {
  const [status, setStatus] = useState<Awaited<
    ReturnType<CloudAPI["status"]>
  > | null>(null);
  const [message, setMessage] = useState("");
  return (
    <section style={{ margin: "16px 0", fontSize: 13 }}>
      <button
        onClick={() =>
          void api
            .status()
            .then(setStatus)
            .catch((e) => setMessage(String(e)))
        }
      >
        Cloud connection status
      </button>
      {status && (
        <>
          <p>{status.reason}</p>
          {status.eligible && (
            <>
              <button disabled={!status.available}>Continue in cloud</button>{" "}
              <button
                onClick={() =>
                  void api
                    .preflight()
                    .then((r) =>
                      setMessage(
                        r.repositories
                          .map(
                            (repo) =>
                              `${repo.path}: ${repo.blocker ?? "Local Git checks passed; server must verify origin commit availability"}`,
                          )
                          .join("\n") +
                          "\n" +
                          r.reason,
                      ),
                    )
                    .catch((e) => setMessage(String(e)))
                }
              >
                Check every project repository
              </button>
            </>
          )}
        </>
      )}
      {message && (
        <p role="status" style={{ whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      )}
    </section>
  );
}
