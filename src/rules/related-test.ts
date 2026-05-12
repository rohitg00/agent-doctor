import type { ChangedFile, Diagnostic } from "../types.js";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST_HINTS = /(\.test\.|\.spec\.|__tests__\/|\/test\/|\/tests\/)/;
const NON_CODE = /(\.md$|\.json$|\.ya?ml$|\.lock$|\/types?\.ts$)/;

export function noRelatedTestRule(args: { changedFiles: ChangedFile[] }): Diagnostic[] {
  const out: Diagnostic[] = [];
  const tests = args.changedFiles.filter((f) => TEST_HINTS.test(f.path) && f.status !== "deleted");
  const testStems = new Set(tests.map((f) => stem(f.path)));

  for (const f of args.changedFiles) {
    if (TEST_HINTS.test(f.path)) continue;
    if (!SOURCE_EXT.test(f.path)) continue;
    if (NON_CODE.test(f.path)) continue;
    if (f.status === "deleted") continue;

    const s = stem(f.path);
    let matched = false;
    for (const t of testStems) {
      if (t === s || t.startsWith(`${s}.`) || s.startsWith(`${t}.`) || t.endsWith(`/${s.split("/").pop()}`)) {
        matched = true;
        break;
      }
    }
    if (matched) continue;

    out.push({
      id: "tests/no-related-test-change",
      severity: "warning",
      title: "No related test change",
      message: `${f.path} changed, but no related test, snapshot, or scenario changed.`,
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
