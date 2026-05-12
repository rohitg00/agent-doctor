import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { lockfileMismatchRule } from "../src/rules/lockfile.ts";
import type { ProjectGraph } from "../src/types.ts";

const detected: ProjectGraph = {
  root: "/x",
  packageManager: "pnpm",
  packages: [],
  agentInstructions: [],
  skills: [],
  ciWorkflows: [],
  hasLockfile: true,
  lockfileName: "pnpm-lock.yaml",
};

describe("lockfileMismatchRule()", () => {
  it("fires when package.json changes but the lockfile does not", () => {
    const out = lockfileMismatchRule({
      changedFiles: [{ path: "package.json", status: "modified" }],
      detected,
    });
    strictEqual(out.length, 1);
    strictEqual(out[0]!.id, "deps/manifest-lockfile-mismatch");
  });

  it("does not fire when both moved together", () => {
    const out = lockfileMismatchRule({
      changedFiles: [
        { path: "package.json", status: "modified" },
        { path: "pnpm-lock.yaml", status: "modified" },
      ],
      detected,
    });
    strictEqual(out.length, 0);
  });

  it("does not fire when there is no lockfile at all", () => {
    const out = lockfileMismatchRule({
      changedFiles: [{ path: "package.json", status: "modified" }],
      detected: { ...detected, hasLockfile: false, lockfileName: undefined },
    });
    strictEqual(out.length, 0);
  });
});
