import { readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { ChangedFile, Diagnostic } from "../types.js";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_HINTS = /(\.test\.|\.spec\.|__tests__\/|\/test\/|\/tests\/)/;
const NON_CODE = /(\.md$|\.json$|\.ya?ml$|\.lock$|\/types?\.ts$)/;
const TEST_ROOTS = ["test", "tests", "__tests__", "src", "lib", "packages", "apps"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".turbo"]);

export interface NoRelatedTestArgs {
  changedFiles: ChangedFile[];
  cwd?: string;
}

export function noRelatedTestRule(args: NoRelatedTestArgs): Diagnostic[] {
  const out: Diagnostic[] = [];
  const tests = args.changedFiles.filter((f) => TEST_HINTS.test(f.path) && f.status !== "deleted");
  const testStems = new Set(tests.map((f) => stem(f.path)));
  const diffTestTokens = unionTokens(tests.map((f) => stemBasename(f.path)));
  const onDiskTokens = args.cwd ? collectOnDiskTestTokens(args.cwd) : new Set<string>();

  for (const f of args.changedFiles) {
    if (TEST_HINTS.test(f.path)) continue;
    if (!SOURCE_EXT.test(f.path)) continue;
    if (NON_CODE.test(f.path)) continue;
    if (f.status === "deleted") continue;

    const s = stem(f.path);
    const sourceTokens = tokenize(stemBasename(f.path));

    let matched = false;
    for (const t of testStems) {
      if (t === s || t.startsWith(`${s}.`) || s.startsWith(`${t}.`) || t.endsWith(`/${s.split("/").pop()}`)) {
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (sourceTokens.some((tok) => diffTestTokens.has(tok))) continue;
    if (sourceTokens.some((tok) => onDiskTokens.has(tok))) continue;

    out.push({
      id: "tests/no-related-test-change",
      severity: "warning",
      title: "No related test change",
      message: `${f.path} changed, but no related test, snapshot, or scenario was found in the diff or on disk.`,
      file: f.path,
      evidence: [{ kind: "diff", file: f.path, status: f.status }],
      confidence: "medium",
      nextActions: [{ label: "add or update a test for this change" }],
    });
  }
  return out;
}

function stem(path: string): string {
  return path
    .replace(/\.(test|spec)\./, ".")
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "")
    .replace(/\/__tests__\//, "/")
    .replace(/\/(test|tests)\//, "/");
}

function stemBasename(path: string): string {
  return basename(path)
    .replace(/\.(test|spec)\./, ".")
    .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, "");
}

function collectOnDiskTestTokens(cwd: string): Set<string> {
  const basenames = new Set<string>();
  for (const root of TEST_ROOTS) {
    walk(join(cwd, root), basenames, 0);
  }
  return unionTokens([...basenames]);
}

function walk(dir: string, out: Set<string>, depth: number): void {
  if (depth > 8) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out, depth + 1);
      continue;
    }
    if (!e.isFile()) {
      try {
        if (!statSync(full).isFile()) continue;
      } catch {
        continue;
      }
    }
    if (TEST_HINTS.test(full) || /\.(test|spec)\./.test(e.name)) {
      out.add(stemBasename(e.name));
    }
  }
}

const STOPWORDS = new Set(["test", "spec", "index", "main", "lib", "src", "utils", "util", "helpers", "helper"]);

function tokenize(stem: string): string[] {
  return stem
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function unionTokens(basenames: string[]): Set<string> {
  const out = new Set<string>();
  for (const b of basenames) {
    for (const tok of tokenize(b)) out.add(tok);
  }
  return out;
}
