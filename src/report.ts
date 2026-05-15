import type { AgentId, AgentSummary, Diagnostic, Report } from "./types.js";
import {
  banner,
  glyphs,
  paint,
  rule,
  sectionHeader,
  stripAnsi,
  type ThemeOptions,
  type Tone,
} from "./theme.js";
import { renderFixHint } from "./agents/shared/fixhint.js";

export interface RenderOptions {
  color: boolean;
  unicode: boolean;
  width: number;
  version: string;
  agentFocus?: AgentId;
}

export function renderText(report: Report, opts: RenderOptions): string {
  const theme: ThemeOptions = { color: opts.color, unicode: opts.unicode };
  const lines: string[] = [];
  lines.push(banner(opts.version, theme));
  lines.push("");
  lines.push(rule(Math.min(opts.width, 78), theme));
  lines.push("");

  if (opts.agentFocus) {
    lines.push(...renderAgentDeepDive(report, opts.agentFocus, theme));
  } else {
    lines.push(...renderOverview(report, theme));
  }

  lines.push("");
  lines.push(rule(Math.min(opts.width, 78), theme));
  lines.push(...renderFooter(report, theme));
  return lines.join("\n");
}

function renderOverview(report: Report, theme: ThemeOptions): string[] {
  const lines: string[] = [];
  const visible = report.agents.filter((a) => a.present || a.status === "absent");
  if (visible.length === 0) {
    lines.push("  no AI coding agents detected on this machine.");
    return lines;
  }

  for (const agent of visible) {
    lines.push(`  ${agentLine(agent, theme)}`);
  }
  return lines;
}

function agentLine(agent: AgentSummary, theme: ThemeOptions): string {
  const g = glyphs(theme);
  const status = statusGlyph(agent.status, theme);
  const name = paint(agent.id.padEnd(15), "bold", theme);
  const versionStr = (agent.version ?? "").slice(0, 11);
  const version = paint(versionStr.padEnd(12), "fog", theme);
  let tail: string;
  switch (agent.status) {
    case "healthy":
      tail = paint("healthy", "mint", theme);
      break;
    case "warnings":
      tail = paint(`${agent.warningCount} warning${agent.warningCount === 1 ? "" : "s"}`, "amber", theme) +
        (agent.headline ? `  ${paint(`(${agent.headline})`, "fog", theme)}` : "");
      break;
    case "errors":
      tail = paint(`${agent.errorCount} error${agent.errorCount === 1 ? "" : "s"}`, "rust", theme) +
        (agent.headline ? `  ${paint(`(${agent.headline})`, "fog", theme)}` : "");
      break;
    case "absent":
      tail = paint("not installed", "charcoal", theme);
      break;
    case "skipped":
      tail = paint("skipped", "charcoal", theme);
      break;
    default:
      tail = "";
  }
  void g;
  return `${status}  ${name}${version}${tail}`;
}

function renderAgentDeepDive(report: Report, focus: AgentId, theme: ThemeOptions): string[] {
  const lines: string[] = [];
  const summary = report.agents.find((a) => a.id === focus);
  if (!summary || !summary.present) {
    lines.push(`  ${paint(focus, "bold", theme)} ${paint("not installed", "charcoal", theme)}`);
    return lines;
  }

  const diags = report.diagnostics.filter((d) => d.agent === focus);
  const byCategory = groupByCategory(diags);
  for (const [category, items] of byCategory) {
    lines.push(sectionHeader(category, theme));
    for (const d of items) {
      lines.push(...renderDiagnosticLine(d, theme));
    }
    lines.push("");
  }
  if (byCategory.size === 0) {
    lines.push(`  ${paint(`${summary.id}`, "bold", theme)} ${paint("looks healthy", "mint", theme)}`);
  }
  return lines;
}

function groupByCategory(diagnostics: Diagnostic[]): Map<string, Diagnostic[]> {
  const out = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const cat = d.category ?? "other";
    if (!out.has(cat)) out.set(cat, []);
    out.get(cat)!.push(d);
  }
  return out;
}

function renderDiagnosticLine(d: Diagnostic, theme: ThemeOptions): string[] {
  const g = glyphs(theme);
  const status = statusGlyph(
    d.severity === "error" ? "errors" : d.severity === "warning" ? "warnings" : "healthy",
    theme,
  );
  const out: string[] = [];
  out.push(`  ${status}  ${paint(d.id, "bold", theme)}`);
  out.push(`      ${paint(g.branchM, "charcoal", theme)} ${d.title}`);
  if (d.message && d.message !== d.title) {
    for (const line of d.message.split("\n")) {
      out.push(`      ${paint(g.branchM, "charcoal", theme)} ${paint(line, "fog", theme)}`);
    }
  }
  if (d.file) {
    const loc = d.line !== undefined ? `${d.file}:${d.line}` : d.file;
    out.push(`      ${paint(g.branchM, "charcoal", theme)} ${paint(`at ${loc}`, "moss", theme)}`);
  }
  const fix = renderFixHint(d.fixHint);
  for (const f of fix) {
    out.push(`      ${paint(g.branchL, "charcoal", theme)} ${paint("fix:", "mint", theme)} ${paint(f, "fog", theme)}`);
  }
  return out;
}

function statusGlyph(status: AgentSummary["status"] | "ok", theme: ThemeOptions): string {
  const g = glyphs(theme);
  switch (status) {
    case "healthy":
      return paint(`[${g.check}]`, "mint", theme);
    case "warnings":
      return paint(`[${g.warn}]`, "amber", theme);
    case "errors":
      return paint(`[${g.cross}]`, "rust", theme);
    case "absent":
      return paint(`[${g.info}]`, "charcoal", theme);
    case "skipped":
    default:
      return paint(`[${g.info}]`, "charcoal", theme);
  }
}

function renderFooter(report: Report, theme: ThemeOptions): string[] {
  const lines: string[] = [];
  const t = report.tally;
  const seconds = (report.durationMs / 1000).toFixed(1);
  const tone: Tone = t.errors > 0 ? "rust" : t.warnings > 0 ? "amber" : "mint";

  const parts = [
    `${t.agentsDetected} detected`,
    `${t.agentsHealthy} healthy`,
    `${t.agentsWithWarnings} with warnings`,
    `${t.agentsWithErrors} with errors`,
  ];
  lines.push("");
  lines.push(`  ${paint(parts.join("  ·  "), tone, theme)}  ${paint(`(${seconds}s)`, "charcoal", theme)}`);

  if (t.suppressed > 0) {
    lines.push(`  ${paint(`${t.suppressed} diagnostics suppressed (use --show-ignored to see)`, "charcoal", theme)}`);
  }

  if (!report.deep) {
    lines.push(`  ${paint("→ agent-doctor --deep    run live probes (binary --version, MCP pings)", "fog", theme)}`);
  }
  return lines;
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}

export { stripAnsi };
