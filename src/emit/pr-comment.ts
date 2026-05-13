import type { Diagnostic, Report } from "../types.js";

const STICKY_MARKER = "<!-- agent-doctor:sticky -->";

export function renderPrComment(report: Report, version: string): string {
  const out: string[] = [];
  out.push(STICKY_MARKER);
  out.push(`### agent-doctor &nbsp;·&nbsp; ${badge(report.score, report.label)}`);
  out.push("");
  out.push(
    `\`v${version}\` &nbsp;·&nbsp; mode \`${report.mode}\` &nbsp;·&nbsp; profile \`${report.profile}\` &nbsp;·&nbsp; risk \`${report.risk.level}\` &nbsp;·&nbsp; files \`${report.changedFiles.length}\``,
  );
  out.push("");

  const required = report.checks.filter((c) => c.required);
  const passed = required.filter((c) => c.status === "passed").length;
  const failed = required.filter((c) => c.status === "failed").length;
  const missing = required.filter((c) => c.status === "missing").length;

  if (required.length > 0) {
    out.push(`**Required checks:** ${passed} passed · ${failed} failed · ${missing} missing`);
    out.push("");
  }

  const grouped = group(report.diagnostics);
  if (grouped.error.length > 0) {
    out.push(`#### Errors (${grouped.error.length})`);
    out.push("");
    for (const d of grouped.error.slice(0, 10)) out.push(diagLine(d));
    if (grouped.error.length > 10) out.push(`<sub>+ ${grouped.error.length - 10} more</sub>`);
    out.push("");
  }
  if (grouped.warning.length > 0) {
    out.push(
      `<details><summary><b>Warnings (${grouped.warning.length})</b></summary>`,
    );
    out.push("");
    for (const d of grouped.warning) out.push(diagLine(d));
    out.push("");
    out.push("</details>");
  }
  if (grouped.info.length > 0) {
    out.push(
      `<details><summary>Info (${grouped.info.length})</summary>`,
    );
    out.push("");
    for (const d of grouped.info) out.push(diagLine(d));
    out.push("");
    out.push("</details>");
  }

  if (report.plannedChecks.length > 0) {
    out.push("");
    out.push(`<details><summary>Planned checks (${report.plannedChecks.length})</summary>`);
    out.push("");
    out.push("| Status | Check | Command |");
    out.push("|--------|-------|---------|");
    for (const c of report.plannedChecks) {
      const status = c.required ? "required" : "recommended";
      out.push(`| ${status} | \`${c.id}\` | \`${escape(c.command)}\` |`);
    }
    out.push("");
    out.push("</details>");
  }

  out.push("");
  out.push(
    `<sub>powered by <a href="https://github.com/rohitg00/agent-doctor">agent-doctor</a> · diff-aware quality gate for AI-assisted code</sub>`,
  );
  return out.join("\n");
}

function badge(score: number, label: string): string {
  const color = score >= 90 ? "brightgreen" : score >= 75 ? "green" : score >= 55 ? "yellow" : "red";
  const text = `${score}%2F100%20·%20${encodeURIComponent(label)}`;
  return `![score](https://img.shields.io/badge/agent--doctor-${text}-${color}?style=flat-square)`;
}

function diagLine(d: Diagnostic): string {
  const loc = d.file ? ` &nbsp;·&nbsp; \`${escape(d.file)}${d.line !== undefined ? `:${d.line}` : ""}\`` : "";
  return `- **${escape(d.id)}** — ${escape(d.title)}${loc}`;
}

function group(ds: Diagnostic[]): { error: Diagnostic[]; warning: Diagnostic[]; info: Diagnostic[] } {
  return {
    error: ds.filter((d) => d.severity === "error"),
    warning: ds.filter((d) => d.severity === "warning"),
    info: ds.filter((d) => d.severity === "info"),
  };
}

function escape(s: string): string {
  return s.replace(/[|`<>]/g, (c) => `\\${c}`);
}

export { STICKY_MARKER };
