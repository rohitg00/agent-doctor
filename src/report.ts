import type { Diagnostic, Report } from "./types.js";

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

function paint(text: string, color: keyof typeof COLOR, useColor: boolean): string {
  if (!useColor) return text;
  return `${COLOR[color]}${text}${COLOR.reset}`;
}

export function renderText(report: Report, useColor = true): string {
  const lines: string[] = [];
  const headerColor =
    report.label === "Ready"
      ? "green"
      : report.label === "Needs review"
        ? "blue"
        : report.label === "Risky"
          ? "yellow"
          : "red";
  lines.push(
    paint(`Agent Doctor: ${report.score}/100 ${report.label}`, headerColor as keyof typeof COLOR, useColor),
  );
  lines.push("");
  lines.push(`Mode: ${report.mode}${report.profile !== "local" ? ` (profile: ${report.profile})` : ""}`);
  lines.push(`Changed files: ${report.changedFiles.length}`);

  const detected = [
    report.detected.packageManager !== "unknown" ? report.detected.packageManager : null,
    report.detected.packages.length > 1 ? `${report.detected.packages.length} packages` : null,
    report.detected.skills.length > 0 ? `${report.detected.skills.length} skills` : null,
    report.detected.agentInstructions.length > 0 ? "agent instructions" : null,
    report.detected.ciWorkflows.length > 0 ? "CI workflows" : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (detected) lines.push(`Detected: ${detected}`);

  lines.push(`Risk: ${report.risk.level}`);
  if (report.risk.notes.length > 0) {
    for (const note of report.risk.notes) lines.push(paint(`  - ${note}`, "gray", useColor));
  }

  if (report.plannedChecks.length > 0) {
    lines.push("");
    lines.push(paint("Planned checks", "bold", useColor));
    for (const c of report.plannedChecks) {
      const tag = c.required ? "[required]" : "[recommended]";
      lines.push(`  ${tag} ${c.id}: ${paint(c.command, "dim", useColor)}`);
      lines.push(paint(`      ${c.reason}`, "gray", useColor));
    }
  }

  if (report.checks.length > 0) {
    lines.push("");
    lines.push(paint("Check results", "bold", useColor));
    for (const c of report.checks) {
      const statusColor =
        c.status === "passed"
          ? "green"
          : c.status === "failed"
            ? "red"
            : c.status === "missing"
              ? "yellow"
              : "gray";
      const dur = c.durationMs !== undefined ? ` ${(c.durationMs / 1000).toFixed(1)}s` : "";
      lines.push(`  ${paint(c.status, statusColor as keyof typeof COLOR, useColor)} ${c.id}${dur}`);
    }
  }

  const grouped = groupBySeverity(report.diagnostics);
  if (grouped.error.length > 0) {
    lines.push("");
    lines.push(paint("Errors", "red", useColor));
    for (const d of grouped.error) lines.push(...renderDiagnostic(d, useColor));
  }
  if (grouped.warning.length > 0) {
    lines.push("");
    lines.push(paint("Warnings", "yellow", useColor));
    for (const d of grouped.warning) lines.push(...renderDiagnostic(d, useColor));
  }
  if (grouped.info.length > 0) {
    lines.push("");
    lines.push(paint("Info", "blue", useColor));
    for (const d of grouped.info) lines.push(...renderDiagnostic(d, useColor));
  }

  if (report.diagnostics.length === 0 && report.checks.length === 0 && report.plannedChecks.length === 0) {
    lines.push("");
    lines.push(paint("No diagnostics. No checks planned.", "gray", useColor));
  }

  return lines.join("\n");
}

function renderDiagnostic(d: Diagnostic, useColor: boolean): string[] {
  const out: string[] = [];
  out.push(`  ${paint(d.id, "bold", useColor)}`);
  out.push(`    ${d.title}`);
  if (d.message && d.message !== d.title) out.push(`    ${d.message}`);
  if (d.file) {
    const loc = d.line ? `${d.file}:${d.line}` : d.file;
    out.push(paint(`    at ${loc}`, "gray", useColor));
  }
  for (const next of d.nextActions ?? []) {
    out.push(paint(`    next: ${next.label}`, "gray", useColor));
    if (next.command) out.push(paint(`          $ ${next.command}`, "dim", useColor));
  }
  return out;
}

function groupBySeverity(ds: Diagnostic[]): { error: Diagnostic[]; warning: Diagnostic[]; info: Diagnostic[] } {
  return {
    error: ds.filter((d) => d.severity === "error"),
    warning: ds.filter((d) => d.severity === "warning"),
    info: ds.filter((d) => d.severity === "info"),
  };
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
