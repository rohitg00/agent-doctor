import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { score } from "../src/score.ts";

describe("score()", () => {
  it("returns 100 / Ready when nothing fired", () => {
    const r = score({ diagnostics: [], checks: [], risk: "low", hasEvidenceForRisk: true });
    strictEqual(r.score, 100);
    strictEqual(r.label, "Ready");
  });

  it("subtracts per unique error rule (not per diagnostic)", () => {
    const r = score({
      diagnostics: [
        d("agent/skill-reference-broken", "error"),
        d("agent/skill-reference-broken", "error"),
        d("agent/skill-frontmatter-invalid", "error"),
      ],
      checks: [],
      risk: "low",
      hasEvidenceForRisk: true,
    });
    strictEqual(r.score, 92);
  });

  it("penalizes failed required checks more than warnings", () => {
    const r = score({
      diagnostics: [d("tests/no-related-test-change", "warning")],
      checks: [
        { id: "validation/typecheck", required: true, status: "failed", diagnostics: [] },
      ],
      risk: "high",
      hasEvidenceForRisk: false,
    });
    strictEqual(r.score, 91);
    strictEqual(r.label, "Ready");
  });

  it("blocks at <55 with stacked failures", () => {
    const r = score({
      diagnostics: [
        d("a/x", "error"),
        d("b/y", "error"),
        d("c/z", "error"),
        d("d/w", "error"),
      ],
      checks: [
        { id: "1", required: true, status: "failed", diagnostics: [] },
        { id: "2", required: true, status: "failed", diagnostics: [] },
        { id: "3", required: true, status: "missing", diagnostics: [] },
      ],
      risk: "critical",
      hasEvidenceForRisk: false,
    });
    strictEqual(r.score, 100 - 16 - 16 - 5 - 10);
    strictEqual(r.label, "Blocked");
  });

  it("clamps at 0", () => {
    const r = score({
      diagnostics: Array.from({ length: 50 }, (_, i) => d(`rule/${i}`, "error")),
      checks: [],
      risk: "low",
      hasEvidenceForRisk: true,
    });
    strictEqual(r.score, 0);
    strictEqual(r.label, "Blocked");
  });
});

function d(id: string, severity: "error" | "warning" | "info") {
  return {
    id,
    severity,
    title: id,
    message: id,
    evidence: [],
    confidence: "high" as const,
  };
}
