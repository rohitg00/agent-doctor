import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { renderSarif } from "../src/emit/sarif.ts";
import { renderAnnotations } from "../src/emit/annotations.ts";
import { renderPrComment, STICKY_MARKER } from "../src/emit/pr-comment.ts";
import { renderJunit } from "../src/emit/junit.ts";
import type { Report } from "../src/types.ts";

const sampleReport: Report = {
  ok: false,
  score: 78,
  label: "Needs review",
  profile: "ci",
  mode: "diff",
  detected: {
    root: "/x",
    packageManager: "pnpm",
    packages: [],
    agentInstructions: [],
    skills: [],
    ciWorkflows: [],
    hasLockfile: true,
    lockfileName: "pnpm-lock.yaml",
  },
  risk: { level: "high", dimensions: blankDimensions(), notes: [] },
  changedFiles: [{ path: "src/auth.ts", status: "modified" }],
  plannedChecks: [
    { id: "validation/typecheck", command: "pnpm typecheck", required: true, reason: "TS sources" },
  ],
  evidence: { diffFiles: 1, commandRuns: 1, ciLogs: 0, agentEvents: 0, artifacts: 0 },
  checks: [
    { id: "validation/typecheck", command: "pnpm typecheck", status: "failed", required: true, durationMs: 1500, diagnostics: [] },
  ],
  diagnostics: [
    {
      id: "agent/skill-reference-broken",
      severity: "error",
      title: "Skill references a missing file",
      message: "Reference does not exist",
      file: ".codex/skills/imagegen/SKILL.md",
      line: 12,
      evidence: [],
      confidence: "high",
    },
    {
      id: "tests/no-related-test-change",
      severity: "warning",
      title: "No related test change",
      message: "src/auth.ts changed",
      evidence: [],
      confidence: "medium",
    },
  ],
};

describe("renderSarif()", () => {
  it("emits a SARIF 2.1.0 envelope", () => {
    const out = JSON.parse(renderSarif(sampleReport, "1.2.3")) as Record<string, unknown>;
    strictEqual(out["version"], "2.1.0");
    const runs = out["runs"] as Array<Record<string, unknown>>;
    strictEqual(runs.length, 1);
    const driver = (runs[0]!["tool"] as { driver: { name: string; version: string; rules: Array<{ id: string }> } }).driver;
    strictEqual(driver.name, "agent-doctor");
    strictEqual(driver.version, "1.2.3");
    ok(driver.rules.some((r) => r.id === "agent/skill-reference-broken"));
  });

  it("maps severity to SARIF level", () => {
    const out = JSON.parse(renderSarif(sampleReport, "1.0.0")) as { runs: Array<{ results: Array<{ ruleId: string; level: string }> }> };
    const results = out.runs[0]!.results;
    const err = results.find((r) => r.ruleId === "agent/skill-reference-broken");
    const warn = results.find((r) => r.ruleId === "tests/no-related-test-change");
    strictEqual(err?.level, "error");
    strictEqual(warn?.level, "warning");
  });
});

describe("renderAnnotations()", () => {
  it("emits ::error / ::warning lines per diagnostic", () => {
    const out = renderAnnotations(sampleReport);
    ok(out.includes("::error title=agent/skill-reference-broken"));
    ok(out.includes("file=.codex/skills/imagegen/SKILL.md,line=12"));
    ok(out.includes("::warning title=tests/no-related-test-change"));
    ok(out.includes("::error title=validation/typecheck"));
  });

  it("escapes special chars", () => {
    const r: Report = { ...sampleReport, diagnostics: [{ ...sampleReport.diagnostics[0]!, message: "line\nbreak,comma:colon%pct" }] };
    const out = renderAnnotations(r);
    ok(out.includes("%0A"));
    ok(out.includes("%2C"));
    ok(out.includes("%3A"));
    ok(out.includes("%25"));
  });
});

describe("renderPrComment()", () => {
  it("includes the sticky marker so CI can upsert", () => {
    const out = renderPrComment(sampleReport, "1.0.0");
    ok(out.startsWith(STICKY_MARKER));
  });

  it("shows score and risk", () => {
    const out = renderPrComment(sampleReport, "1.0.0");
    ok(out.includes("78%2F100"));
    ok(out.includes("risk `high`"));
  });

  it("collapses warnings into details and keeps errors inline", () => {
    const out = renderPrComment(sampleReport, "1.0.0");
    ok(out.includes("#### Errors (1)"));
    ok(out.includes("<details><summary><b>Warnings (1)</b></summary>"));
  });
});

describe("renderJunit()", () => {
  it("emits a junit XML structure with proper counts", () => {
    const out = renderJunit(sampleReport);
    ok(out.startsWith(`<?xml`));
    ok(out.includes(`<testsuites name="agent-doctor"`));
    ok(out.includes(`failures="2"`));
    ok(out.includes(`<failure message="check failed">pnpm typecheck</failure>`));
  });
});

function blankDimensions() {
  return {
    publicApi: false,
    schemaOrMigration: false,
    authOrPermission: true,
    uiOrRoute: false,
    dependencyGraph: false,
    generated: false,
    agentInstruction: false,
    ciOrBuild: false,
    largeDeletion: false,
    securitySensitive: false,
  };
}

void deepStrictEqual;
