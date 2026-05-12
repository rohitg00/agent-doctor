import { describe, it, before, after } from "node:test";
import { strictEqual, ok } from "node:assert";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planPythonChecks } from "../src/adapters/python.ts";
import { planGoChecks } from "../src/adapters/go.ts";
import { planRustChecks } from "../src/adapters/rust.ts";
import type { RiskSummary } from "../src/types.ts";

const riskMed: RiskSummary = { level: "medium", dimensions: blank(), notes: [] };
const riskLow: RiskSummary = { level: "low", dimensions: blank(), notes: [] };

describe("planPythonChecks()", () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ad-py-"));
    await writeFile(join(dir, "pyproject.toml"), `[tool.ruff]\n[tool.mypy]\n[project]\nname="x"\ndependencies=["pytest","ruff","mypy"]\n`);
  });
  after(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns empty when no .py touched", () => {
    const out = planPythonChecks({ cwd: dir, changedFiles: [{ path: "README.md", status: "modified" }], risk: riskMed });
    strictEqual(out.length, 0);
  });

  it("plans ruff / mypy / pytest when .py touched", () => {
    const out = planPythonChecks({
      cwd: dir,
      changedFiles: [{ path: "app/foo.py", status: "modified" }],
      risk: riskMed,
    });
    const ids = out.map((c) => c.id);
    ok(ids.includes("validation/python/lint"));
    ok(ids.includes("validation/python/typecheck"));
    ok(ids.includes("validation/python/test"));
  });
});

describe("planGoChecks()", () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ad-go-"));
    await writeFile(join(dir, "go.mod"), "module x\n");
  });
  after(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns empty when no .go touched", () => {
    const out = planGoChecks({ cwd: dir, changedFiles: [{ path: "README.md", status: "modified" }], risk: riskMed });
    strictEqual(out.length, 0);
  });

  it("plans go vet + test when .go touched", () => {
    const out = planGoChecks({
      cwd: dir,
      changedFiles: [{ path: "main.go", status: "modified" }],
      risk: riskMed,
    });
    ok(out.some((c) => c.id === "validation/go/vet"));
    ok(out.some((c) => c.id === "validation/go/test"));
  });
});

describe("planRustChecks()", () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ad-rs-"));
    await writeFile(join(dir, "Cargo.toml"), `[workspace]\nmembers=["a"]\n`);
    await mkdir(join(dir, "a"));
  });
  after(async () => { await rm(dir, { recursive: true, force: true }); });

  it("uses --workspace flag when [workspace] table present", () => {
    const out = planRustChecks({
      cwd: dir,
      changedFiles: [{ path: "a/src/lib.rs", status: "modified" }],
      risk: riskMed,
    });
    const check = out.find((c) => c.id === "validation/rust/check");
    ok(check?.command.includes("--workspace"));
  });

  it("does nothing for low risk if no .rs touched", () => {
    const out = planRustChecks({
      cwd: dir,
      changedFiles: [{ path: "README.md", status: "modified" }],
      risk: riskLow,
    });
    strictEqual(out.length, 0);
  });
});

function blank() {
  return {
    publicApi: false,
    schemaOrMigration: false,
    authOrPermission: false,
    uiOrRoute: false,
    dependencyGraph: false,
    generated: false,
    agentInstruction: false,
    ciOrBuild: false,
    largeDeletion: false,
    securitySensitive: false,
  };
}
