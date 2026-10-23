import { useState } from "react";

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
