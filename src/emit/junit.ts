import type { Diagnostic, Report } from "../types.js";

export function renderJunit(report: Report): string {
  const cases = report.diagnostics.map(diagCase);
  const failures = report.diagnostics.filter((d) => d.severity === "error").length;
  const tests = cases.length;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="agent-doctor" tests="${tests}" failures="${failures}">`,
    `  <testsuite name="agent-doctor" tests="${tests}" failures="${failures}">`,
    ...cases.map((c) => `    ${c}`),
    `  </testsuite>`,
    `</testsuites>`,
    "",
  ].join("\n");
}

function diagCase(d: Diagnostic): string {
  const cls = d.agent ?? d.severity;
  if (d.severity === "error") {
    return `<testcase classname="${esc(cls)}" name="${esc(d.id)}"><failure message="${esc(d.title)}">${esc(d.message)}</failure></testcase>`;
  }
  if (d.severity === "warning") {
    return `<testcase classname="${esc(cls)}" name="${esc(d.id)}"><system-err>${esc(d.title)}: ${esc(d.message)}</system-err></testcase>`;
  }
  return `<testcase classname="${esc(cls)}" name="${esc(d.id)}"><system-out>${esc(d.title)}: ${esc(d.message)}</system-out></testcase>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
