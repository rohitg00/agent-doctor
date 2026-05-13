import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { classifyRisk } from "../src/planner.ts";

describe("classifyRisk()", () => {
  it("returns low for docs-only changes", () => {
    const r = classifyRisk({
      changedFiles: [
        { path: "README.md", status: "modified" },
        { path: "docs/api.md", status: "modified" },
      ],
      config: {},
    });
    strictEqual(r.level, "low");
  });

  it("returns critical for auth changes", () => {
    const r = classifyRisk({
      changedFiles: [{ path: "src/auth/session.ts", status: "modified" }],
      config: {},
    });
    strictEqual(r.level, "critical");
    strictEqual(r.dimensions.authOrPermission, true);
  });

  it("returns critical for migrations", () => {
    const r = classifyRisk({
      changedFiles: [{ path: "db/migrations/0042_users.sql", status: "added" }],
      config: {},
    });
    strictEqual(r.level, "critical");
  });

  it("returns high for dependency-graph changes", () => {
    const r = classifyRisk({
      changedFiles: [{ path: "package.json", status: "modified" }],
      config: {},
    });
    strictEqual(r.level, "high");
    strictEqual(r.dimensions.dependencyGraph, true);
  });

  it("flags generated paths via config globs", () => {
    const r = classifyRisk({
      changedFiles: [{ path: "src/__generated__/schema.ts", status: "modified" }],
      config: { risk: { generated: ["**/__generated__/**"] } },
    });
    strictEqual(r.dimensions.generated, true);
  });

  it("flags critical config paths as security-sensitive", () => {
    const r = classifyRisk({
      changedFiles: [{ path: "infra/secrets/keys.ts", status: "modified" }],
      config: { risk: { critical: ["infra/secrets/**"] } },
    });
    strictEqual(r.level, "critical");
    deepStrictEqual(r.notes, ["critical path matched: infra/secrets/keys.ts"]);
  });
});
