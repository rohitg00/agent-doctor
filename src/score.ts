import type { CheckResult, Diagnostic, Report, RiskLevel } from "./types.js";

export function score(args: {
  diagnostics: Diagnostic[];
  checks: CheckResult[];
  risk: RiskLevel;
  hasEvidenceForRisk: boolean;
}): { score: number; label: Report["label"] } {
  const uniqueErrorRules = unique(args.diagnostics.filter((d) => d.severity === "error").map((d) => d.id));
  const uniqueWarningRules = unique(args.diagnostics.filter((d) => d.severity === "warning").map((d) => d.id));
  const failedRequired = args.checks.filter((c) => c.required && c.status === "failed").length;
  const missingRequired = args.checks.filter((c) => c.required && c.status === "missing").length;
  const criticalUnproven = args.risk === "critical" && !args.hasEvidenceForRisk ? 1 : 0;

  let s = 100;
  s -= uniqueErrorRules * 4;
  s -= uniqueWarningRules * 1;
  s -= failedRequired * 8;
  s -= missingRequired * 5;
  s -= criticalUnproven * 10;
  s = Math.max(s, 0);
  return { score: s, label: labelFor(s) };
}

function labelFor(s: number): Report["label"] {
  if (s >= 90) return "Ready";
  if (s >= 75) return "Needs review";
  if (s >= 55) return "Risky";
  return "Blocked";
}

function unique(ids: string[]): number {
  return new Set(ids).size;
}
