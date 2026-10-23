import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/** Reject symlink components, including ancestors of a not-yet-created leaf. */
export function noSymlinks(path: string): void {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute
    .slice(current.length)
    .split(/[\\/]/)
    .filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink())
        throw new Error(`Unsafe symlink: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
export function readJson<T>(file: string, fallback: T): T {
  noSymlinks(file);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}
export function atomicJson(file: string, value: unknown): void {
  noSymlinks(file);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}
/** Exclusive lock + reload + atomic replace prevents stale writers, including other processes. */
export function locked<T>(file: string, action: () => T): T {
  noSymlinks(file);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  let fd: number;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch {
    throw new Error("STORE_BUSY: another settings writer is active; retry");
  }
  try {
    return action();
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
}
