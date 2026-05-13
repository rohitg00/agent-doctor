import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, PlannedCheck, RiskSummary } from "../types.js";

interface Ctx {
  cwd: string;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
}

export function planGoChecks(ctx: Ctx): PlannedCheck[] {
  if (!existsSync(join(ctx.cwd, "go.mod")) && !existsSync(join(ctx.cwd, "go.work"))) return [];
  const touched = ctx.changedFiles.some((f) =>
    f.path.endsWith(".go") ||
    f.path === "go.mod" ||
    f.path === "go.sum" ||
    f.path === "go.work" ||
    f.path === "go.work.sum",
  );
  if (!touched) return [];

  const out: PlannedCheck[] = [];
  out.push({
    id: "validation/go/vet",
    command: "go vet ./...",
    required: ctx.risk.level !== "low",
    reason: "go vet",
  });
  out.push({
    id: "validation/go/test",
    command: "go test ./...",
    required: ["high", "critical"].includes(ctx.risk.level),
    reason: "go test",
  });
  if (existsSync(join(ctx.cwd, ".golangci.yml")) || existsSync(join(ctx.cwd, ".golangci.yaml"))) {
    out.push({
      id: "validation/go/lint",
      command: "golangci-lint run",
      required: false,
      reason: "golangci-lint (advisory)",
    });
  }
  return out;
}
