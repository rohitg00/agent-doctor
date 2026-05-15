import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const pexec = promisify(execFile);

const WELL_KNOWN_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  join(homedir(), ".local", "bin"),
  join(homedir(), ".bun", "bin"),
  join(homedir(), ".cargo", "bin"),
  join(homedir(), ".npm-global", "bin"),
  join(homedir(), "Library", "pnpm"),
  join(homedir(), ".volta", "bin"),
];

export interface BinaryProbe {
  found: boolean;
  path?: string;
  onPath: boolean;
}

export function findBinary(name: string): BinaryProbe {
  const onPath = whichSync(name);
  if (onPath) return { found: true, path: onPath, onPath: true };
  for (const dir of WELL_KNOWN_BIN_DIRS) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) {
      return { found: true, path: candidate, onPath: false };
    }
  }
  return { found: false, onPath: false };
}

function whichSync(name: string): string | undefined {
  const paths = (process.env["PATH"] ?? "").split(":");
  for (const p of paths) {
    if (!p) continue;
    const candidate = join(p, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function binaryVersion(
  binaryPath: string,
  arg = "--version",
  timeoutMs = 250,
): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await pexec(binaryPath, [arg], { timeout: timeoutMs });
    const out = (stdout + stderr).trim();
    return out.split("\n")[0]?.trim();
  } catch {
    return undefined;
  }
}

export function homePath(...parts: string[]): string {
  return join(homedir(), ...parts);
}

export function fileExists(...parts: string[]): boolean {
  return existsSync(parts.length === 1 && parts[0] ? parts[0] : join(...parts));
}
