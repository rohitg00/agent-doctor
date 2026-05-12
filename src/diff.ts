import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, Mode } from "./types.js";

const pexecFile = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await pexecFile("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  if (!existsSync(join(cwd, ".git"))) {
    try {
      await git(["rev-parse", "--is-inside-work-tree"], cwd);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

export async function detectBase(cwd: string, hint?: string): Promise<string | undefined> {
  const candidates = hint ? [hint] : ["origin/main", "main", "origin/master", "master"];
  for (const c of candidates) {
    try {
      await git(["rev-parse", "--verify", c], cwd);
      return c;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function collectChanged(cwd: string, mode: Mode, base?: string): Promise<ChangedFile[]> {
  if (!(await isGitRepo(cwd))) return [];

  if (mode === "diff") {
    const ref = base ?? (await detectBase(cwd));
    if (!ref) {
      return collectChanged(cwd, "staged", undefined);
    }
    const out = await git(
      ["diff", "--name-status", "-M50%", `${ref}...HEAD`],
      cwd,
    ).catch((err: unknown) => {
      process.stderr.write(
        `agent-doctor: git diff against ${ref} failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return "";
    });
    const wt = await collectChanged(cwd, "staged", undefined);
    const fromRef = parseNameStatus(out);
    return dedupe([...fromRef, ...wt]);
  }

  if (mode === "staged") {
    const staged = await git(["diff", "--name-status", "--cached", "-M50%"], cwd).catch(() => "");
    const unstaged = await git(["diff", "--name-status", "-M50%"], cwd).catch(() => "");
    const untracked = await git(["ls-files", "--others", "--exclude-standard"], cwd).catch(() => "");
    const u: ChangedFile[] = untracked
      .split("\n")
      .filter(Boolean)
      .map((p) => ({ path: p, status: "untracked" }));
    return dedupe([...parseNameStatus(staged), ...parseNameStatus(unstaged), ...u]);
  }

  const tracked = await git(["ls-files"], cwd).catch(() => "");
  return tracked
    .split("\n")
    .filter(Boolean)
    .map((p) => ({ path: p, status: "modified" as const }));
}

function parseNameStatus(raw: string): ChangedFile[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map<ChangedFile | null>((line) => {
      const parts = line.split(/\t/);
      const code = parts[0] ?? "";
      if (code.startsWith("R") && parts.length >= 3) {
        return { path: parts[2]!, oldPath: parts[1], status: "renamed" };
      }
      if (code.startsWith("C") && parts.length >= 3) {
        return { path: parts[2]!, oldPath: parts[1], status: "copied" };
      }
      const path = parts[1];
      if (!path) return null;
      if (code.startsWith("A")) return { path, status: "added" };
      if (code.startsWith("D")) return { path, status: "deleted" };
      if (code.startsWith("M")) return { path, status: "modified" };
      return { path, status: "modified" };
    })
    .filter((x): x is ChangedFile => x !== null);
}

function dedupe(files: ChangedFile[]): ChangedFile[] {
  const seen = new Map<string, ChangedFile>();
  for (const f of files) {
    seen.set(f.path, f);
  }
  return [...seen.values()];
}
