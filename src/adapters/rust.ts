import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, PlannedCheck, RiskSummary } from "../types.js";

interface Ctx {
  cwd: string;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
}

export function planRustChecks(ctx: Ctx): PlannedCheck[] {
  if (!existsSync(join(ctx.cwd, "Cargo.toml"))) return [];
  const touched = ctx.changedFiles.some(
    (f) => f.path.endsWith(".rs") || f.path === "Cargo.toml" || f.path === "Cargo.lock",
  );
  if (!touched) return [];

  const out: PlannedCheck[] = [];
  const workspaceRoot = isWorkspace(ctx.cwd);
  out.push({
    id: "validation/rust/check",
    command: workspaceRoot ? "cargo check --workspace" : "cargo check",
    required: ctx.risk.level !== "low",
    reason: "cargo check",
  });
  out.push({
    id: "validation/rust/clippy",
    command: workspaceRoot
      ? "cargo clippy --workspace --all-targets --all-features -- -D warnings"
      : "cargo clippy --all-targets --all-features -- -D warnings",
    required: ["high", "critical"].includes(ctx.risk.level),
    reason: "clippy with -D warnings",
  });
  out.push({
    id: "validation/rust/test",
    command: workspaceRoot ? "cargo test --workspace" : "cargo test",
    required: ["high", "critical"].includes(ctx.risk.level),
    reason: "cargo test",
  });
  out.push({
    id: "validation/rust/fmt",
    command: "cargo fmt --check",
    required: false,
    reason: "rustfmt check (advisory)",
  });
  return out;
}

function isWorkspace(cwd: string): boolean {
  try {
    const raw = readFileSync(join(cwd, "Cargo.toml"), "utf8");
    return /^\s*\[workspace\]/m.test(raw);
  } catch {
    return false;
  }
}
