import type { CheckResult, Diagnostic, Report } from "./types.js";
import {
  banner,
  compose,
  glyphs,
  paint,
  progressBar,
  rule,
  sectionHeader,
  stripAnsi,
  type ThemeOptions,
  type Tone,
} from "./theme.js";

export interface RenderOptions {
  color: boolean;
  unicode: boolean;
  width: number;
  version: string;
}

export function renderText(report: Report, opts: RenderOptions): string {
  const theme: ThemeOptions = { color: opts.color, unicode: opts.unicode };
  const g = glyphs(theme);
  const lines: string[] = [];

  lines.push(banner(opts.version, theme));
  lines.push("");
  lines.push(scoreCard(report, opts));
  lines.push("");
  lines.push(rule(Math.min(opts.width, 78), theme));

  lines.push(...summary(report, theme));

  if (report.plannedChecks.length > 0) {
    lines.push(sectionHeader(`planned (${report.plannedChecks.length})`, theme));
    for (const c of report.plannedChecks) {
      const tag = c.required
        ? paint("required", "lime", theme)
        : paint("recommended", "moss", theme);
      lines.push(`  ${g.arrow} ${tag}  ${paint(c.id, "bold", theme)}`);
      lines.push(`    ${paint(g.branchM, "charcoal", theme)} ${paint(c.command, "mint", theme)}`);
      lines.push(`    ${paint(g.branchL, "charcoal", theme)} ${paint(c.reason, "fog", theme)}`);
    }
  }

  if (report.checks.length > 0) {
    lines.push(sectionHeader(`results (${report.checks.length})`, theme));
    for (const c of report.checks) {
      lines.push(`  ${checkBadge(c, theme)}  ${paint(c.id, "bold", theme)}${duration(c, theme)}`);
      if (c.command) {
        lines.push(`    ${paint(g.branchL, "charcoal", theme)} ${paint(c.command, "fog", theme)}`);
      }
    }
  }

  const grouped = groupBySeverity(report.diagnostics);
  if (grouped.error.length > 0) {
    lines.push(sectionHeader(`errors (${grouped.error.length})`, theme));
    for (const d of grouped.error) lines.push(...renderDiagnostic(d, theme));
  }
  if (grouped.warning.length > 0) {
    lines.push(sectionHeader(`warnings (${grouped.warning.length})`, theme));
    for (const d of grouped.warning) lines.push(...renderDiagnostic(d, theme));
  }
  if (grouped.info.length > 0) {
    lines.push(sectionHeader(`info (${grouped.info.length})`, theme));
    for (const d of grouped.info) lines.push(...renderDiagnostic(d, theme));
  }

  if (report.diagnostics.length === 0 && report.checks.length === 0 && report.plannedChecks.length === 0) {
    lines.push("");
    lines.push(paint("  no diagnostics. nothing to plan.", "fog", theme));
  }

  return lines.join("\n");
}

function scoreCard(report: Report, opts: RenderOptions): string {
  const theme: ThemeOptions = { color: opts.color, unicode: opts.unicode };
  const tone: Tone =
    report.label === "Ready"
      ? "lime"
      : report.label === "Needs review"
        ? "ember"
        : report.label === "Risky"
          ? "amber"
          : "rust";
  const score = `${report.score}/100`;
  const bar = progressBar(report.score, 28, theme);
  const label = compose(report.label, ["bold", tone], theme);
  return `  ${bar}  ${paint(score, "bold", theme)}  ${label}`;
}

function summary(report: Report, theme: ThemeOptions): string[] {
  const lines: string[] = [];
  const meta = [
    `mode ${report.mode}`,
    `profile ${report.profile}`,
    `risk ${report.risk.level}`,
    `files ${report.changedFiles.length}`,
  ].join(`  ${paint("·", "charcoal", theme)}  `);
  lines.push("");
  lines.push(`  ${paint(meta, "fog", theme)}`);

  const detectedParts: string[] = [];
  if (report.detected.packageManager !== "unknown") detectedParts.push(report.detected.packageManager);
  if (report.detected.packages.length > 1) detectedParts.push(`${report.detected.packages.length} packages`);
  if (report.detected.skills.length > 0) detectedParts.push(`${report.detected.skills.length} skills`);
  if (report.detected.agentInstructions.length > 0) detectedParts.push("agent instructions");
  if (report.detected.ciWorkflows.length > 0) detectedParts.push(`${report.detected.ciWorkflows.length} ci workflows`);
  if (detectedParts.length > 0) {
    lines.push(`  ${paint(`detected ${detectedParts.join(", ")}`, "moss", theme)}`);
  }

  if (report.risk.notes.length > 0) {
    for (const note of report.risk.notes.slice(0, 3)) {
      lines.push(`  ${paint(`! ${note}`, "amber", theme)}`);
    }
    if (report.risk.notes.length > 3) {
      lines.push(`  ${paint(`+ ${report.risk.notes.length - 3} more`, "charcoal", theme)}`);
    }
  }
  return lines;
}

function checkBadge(c: CheckResult, theme: ThemeOptions): string {
  const g = glyphs(theme);
  switch (c.status) {
    case "passed":
      return paint(g.check, "lime", theme);
    case "failed":
      return paint(g.cross, "rust", theme);
    case "missing":
      return paint(g.warn, "amber", theme);
    default:
      return paint(g.bullet, "charcoal", theme);
  }
}

function duration(c: CheckResult, theme: ThemeOptions): string {
  if (c.durationMs === undefined) return "";
  return `  ${paint(`${(c.durationMs / 1000).toFixed(1)}s`, "charcoal", theme)}`;
}

function renderDiagnostic(d: Diagnostic, theme: ThemeOptions): string[] {
  const g = glyphs(theme);
  const sevGlyph =
    d.severity === "error" ? paint(g.cross, "rust", theme)
      : d.severity === "warning" ? paint(g.warn, "amber", theme)
        : paint(g.info, "moss", theme);
  const out: string[] = [];
  out.push(`  ${sevGlyph} ${compose(d.id, ["bold", "ember"], theme)}`);
  out.push(`    ${paint(g.branchM, "charcoal", theme)} ${d.title}`);
  if (d.message && d.message !== d.title) {
    const msgLines = d.message.split("\n");
    for (const line of msgLines) {
      out.push(`    ${paint(g.branchM, "charcoal", theme)} ${paint(line, "fog", theme)}`);
    }
  }
  if (d.file) {
    const loc = d.line !== undefined ? `${d.file}:${d.line}` : d.file;
    out.push(`    ${paint(g.branchM, "charcoal", theme)} ${paint(`at ${loc}`, "moss", theme)}`);
  }
  for (const next of d.nextActions ?? []) {
    out.push(`    ${paint(g.branchL, "charcoal", theme)} ${paint("next:", "mint", theme)} ${next.label}`);
    if (next.command) {
      out.push(`         ${paint(g.arrow, "ember", theme)} ${paint(next.command, "fog", theme)}`);
    }
  }
  out.push("");
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

export { stripAnsi };
