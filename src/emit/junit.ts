import type { Diagnostic, Report } from "../types.js";

export function renderJunit(report: Report): string {
  const cases: string[] = [];
  for (const c of report.checks) {
    cases.push(checkCase(c));
  }
  for (const d of report.diagnostics) {
    cases.push(diagCase(d));
  }
  const failures = report.diagnostics.filter((d) => d.severity === "error").length +
    report.checks.filter((c) => c.required && c.status === "failed").length;
  const skipped = report.checks.filter((c) => c.status === "missing").length;
  const tests = cases.length;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="agent-doctor" tests="${tests}" failures="${failures}" skipped="${skipped}">`,
    `  <testsuite name="agent-doctor" tests="${tests}" failures="${failures}" skipped="${skipped}">`,
    ...cases.map((c) => `    ${c}`),
    `  </testsuite>`,
    `</testsuites>`,
    "",
  ].join("\n");
}

function checkCase(c: { id: string; command?: string; status: string; durationMs?: number; required: boolean }): string {
  const time = c.durationMs !== undefined ? ((c.durationMs / 1000).toFixed(3)) : "0";
  const cls = c.required ? "required" : "recommended";
  if (c.status === "passed") {
    return `<testcase classname="${cls}" name="${esc(c.id)}" time="${time}"/>`;
  }
  if (c.status === "failed") {
    return `<testcase classname="${cls}" name="${esc(c.id)}" time="${time}"><failure message="check failed">${esc(c.command ?? "")}</failure></testcase>`;
  }
  if (c.status === "missing") {
    return `<testcase classname="${cls}" name="${esc(c.id)}" time="${time}"><skipped message="no command resolved"/></testcase>`;
  }
  return `<testcase classname="${cls}" name="${esc(c.id)}" time="${time}"/>`;
}

function diagCase(d: Diagnostic): string {
  const cls = d.severity;
  if (d.severity === "error") {
    return `<testcase classname="${cls}" name="${esc(d.id)}"><failure message="${esc(d.title)}">${esc(d.message)}</failure></testcase>`;
  }
  if (d.severity === "warning") {
    return `<testcase classname="${cls}" name="${esc(d.id)}"><system-err>${esc(d.title)}: ${esc(d.message)}</system-err></testcase>`;
  }
  return `<testcase classname="${cls}" name="${esc(d.id)}"><system-out>${esc(d.title)}: ${esc(d.message)}</system-out></testcase>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
