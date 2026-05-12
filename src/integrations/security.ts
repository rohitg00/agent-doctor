import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChangedFile, PlannedCheck, RiskSummary } from "../types.js";
import type { UserConfig } from "../config.js";

const pexec = promisify(execFile);

interface Ctx {
  cwd: string;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
  config: UserConfig;
}

export async function planSecurityChecks(ctx: Ctx): Promise<PlannedCheck[]> {
  const out: PlannedCheck[] = [];
  const wantSemgrep = ctx.config.integrations?.semgrep !== false;
  const wantGitleaks = ctx.config.integrations?.gitleaks !== false;
  const wantOsv = ctx.config.integrations?.osv !== false;

  if (wantSemgrep && (await onPath("semgrep"))) {
    out.push({
      id: "validation/security/semgrep",
      command: "semgrep --error --quiet --config=auto",
      required: false,
      reason: "semgrep (advisory)",
    });
  }

  if (wantGitleaks && (await onPath("gitleaks"))) {
    out.push({
      id: "validation/security/gitleaks",
      command: "gitleaks detect --no-banner --redact --exit-code 1",
      required: ctx.risk.dimensions.securitySensitive,
      reason: ctx.risk.dimensions.securitySensitive ? "secrets scan (sensitive path touched)" : "secrets scan (advisory)",
    });
  }

  const depTouched = ctx.changedFiles.some((f) =>
    /(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|requirements\.txt|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|Cargo\.lock)$/.test(f.path),
  );
  if (wantOsv && depTouched && (await onPath("osv-scanner"))) {
    out.push({
      id: "validation/security/osv",
      command: "osv-scanner --recursive .",
      required: ctx.risk.dimensions.securitySensitive,
      reason: "OSV-Scanner against changed manifests/lockfiles",
    });
  }
  return out;
}

async function onPath(bin: string): Promise<boolean> {
  try {
    await pexec(process.platform === "win32" ? "where" : "which", [bin]);
    return true;
  } catch {
    return false;
  }
}
