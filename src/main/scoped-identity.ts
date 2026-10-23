import { keyFingerprint } from "./cloud-binding";
import { identifier, type Owner } from "./environment";

/** Session-local identity cache. Relay must still authorize every remote operation. */
export class ScopedIdentity {
  private accepted: { fingerprint: string; owner: Owner } | null = null;
  private generation = 0;
  private pending = new Map<string, Promise<Owner>>();
  owner(key: string): Owner | null {
    return this.accepted?.fingerprint === keyFingerprint(key)
      ? this.accepted.owner
      : null;
  }
  remember(key: string, owner: Owner): void {
    identifier(owner.organizationId);
    identifier(owner.memberId);
    this.accepted = { fingerprint: keyFingerprint(key), owner: { ...owner } };
  }
  clear(): void {
    this.generation++;
    this.accepted = null;
    this.pending.clear();
  }
  async verify(
    key: string,
    currentKey: () => string,
    lookup: () => Promise<Owner>,
  ): Promise<Owner> {
    const known = this.owner(key);
    if (known) return known;
    const fingerprint = keyFingerprint(key);
    const generation = this.generation;
    let operation = this.pending.get(fingerprint);
    if (!operation) {
      operation = lookup().then((owner) => {
        if (generation !== this.generation || currentKey() !== key)
          throw new Error(
            "Account changed during identity verification; retry",
          );
        this.remember(key, owner);
        return owner;
      });
      this.pending.set(fingerprint, operation);
    }
    try {
      return await operation;
    } finally {
      if (this.pending.get(fingerprint) === operation)
        this.pending.delete(fingerprint);
    }
  }
}
