import type { Diagnostic, Report } from "../types.js";

export function renderAnnotations(report: Report): string {
  const out: string[] = [];
  for (const d of report.diagnostics) {
    out.push(line(d));
  }
  for (const c of report.checks) {
    if (c.status === "failed" && c.required) {
      out.push(
        `::error title=${escape(c.id)}::Required check ${escape(c.id)} failed (exit non-zero)`,
      );
    }
  }
  return out.length === 0 ? "" : `${out.join("\n")}\n`;
}

function line(d: Diagnostic): string {
  const cmd = d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "notice";
  const parts = [`title=${escape(d.id)}`];
  if (d.file) parts.push(`file=${escape(d.file)}`);
  if (d.line !== undefined) parts.push(`line=${d.line}`);
  return `::${cmd} ${parts.join(",")}::${escape(d.message)}`;
}

function escape(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
}
