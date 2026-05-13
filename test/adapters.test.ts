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

describe("adapter edge cases", () => {
  it("planPythonChecks returns empty when no project markers exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-py-empty-"));
    try {
      const out = planPythonChecks({
        cwd: dir,
        changedFiles: [{ path: "app/foo.py", status: "modified" }],
        risk: riskMed,
      });
      strictEqual(out.length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("planGoChecks returns empty when no go.mod / go.work", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-go-empty-"));
    try {
      const out = planGoChecks({
        cwd: dir,
        changedFiles: [{ path: "main.go", status: "modified" }],
        risk: riskMed,
      });
      strictEqual(out.length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("planGoChecks fires on go.work workspaces", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-go-work-"));
    try {
      await writeFile(join(dir, "go.work"), "go 1.22\nuse ./a\n");
      const out = planGoChecks({
        cwd: dir,
        changedFiles: [{ path: "go.work.sum", status: "modified" }],
        risk: riskMed,
      });
      ok(out.some((c) => c.id === "validation/go/vet"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("planGoChecks adds golangci-lint when config present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-go-lint-"));
    try {
      await writeFile(join(dir, "go.mod"), "module x\n");
      await writeFile(join(dir, ".golangci.yml"), "linters: { enable: [govet] }\n");
      const out = planGoChecks({
        cwd: dir,
        changedFiles: [{ path: "main.go", status: "modified" }],
        risk: riskMed,
      });
      ok(out.some((c) => c.id === "validation/go/lint"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("planRustChecks returns empty without Cargo.toml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-rs-empty-"));
    try {
      const out = planRustChecks({
        cwd: dir,
        changedFiles: [{ path: "src/lib.rs", status: "modified" }],
        risk: riskMed,
      });
      strictEqual(out.length, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("Python adapter requires pytest at risk=high", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-py-risk-"));
    try {
      await writeFile(
        join(dir, "pyproject.toml"),
        `[project]\nname="x"\ndependencies=["pytest","ruff","mypy"]\n`,
      );
      const high = { level: "high", dimensions: blank(), notes: [] } as const;
      const out = planPythonChecks({
        cwd: dir,
        changedFiles: [{ path: "x.py", status: "modified" }],
        risk: high,
      });
      const test = out.find((c) => c.id === "validation/python/test");
      strictEqual(test?.required, true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("Python adapter picks uv runner when uv.lock present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-py-uv-"));
    try {
      await writeFile(join(dir, "pyproject.toml"), `[project]\ndependencies=["pytest"]\n`);
      await writeFile(join(dir, "uv.lock"), "");
      const out = planPythonChecks({
        cwd: dir,
        changedFiles: [{ path: "x.py", status: "modified" }],
        risk: riskMed,
      });
      const test = out.find((c) => c.id === "validation/python/test");
      ok(test?.command.startsWith("uv run "));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("Python adapter prefers mypy over pyright when both declared", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-py-both-"));
    try {
      await writeFile(
        join(dir, "pyproject.toml"),
        `[project]\ndependencies=["mypy","pyright","pytest"]\n`,
      );
      const out = planPythonChecks({
        cwd: dir,
        changedFiles: [{ path: "x.py", status: "modified" }],
        risk: riskMed,
      });
      const typecheck = out.find((c) => c.id === "validation/python/typecheck");
      ok(typecheck?.command.includes("mypy"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("Python requirements.txt parser handles extras and comments", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ad-py-req-"));
    try {
      await writeFile(
        join(dir, "requirements.txt"),
        `# tooling\n` +
        `pytest==7.0\n` +
        `mypy[reports]==1.0  # type checker\n` +
        `-e git+https://example.com/repo#egg=other\n` +
        `Ruff>=0.1\n`,
      );
      const out = planPythonChecks({
        cwd: dir,
        changedFiles: [{ path: "x.py", status: "modified" }],
        risk: riskMed,
      });
      const ids = out.map((c) => c.id);
      ok(ids.includes("validation/python/lint"));
      ok(ids.includes("validation/python/typecheck"));
      ok(ids.includes("validation/python/test"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
