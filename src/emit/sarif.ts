import type { Diagnostic, Report } from "../types.js";

export function renderSarif(report: Report, version: string): string {
  const ruleIds = unique(report.diagnostics.map((d) => d.id));
  const rules = ruleIds.map((id) => {
    const sample = report.diagnostics.find((d) => d.id === id);
    return {
      id,
      name: id,
      shortDescription: { text: id },
      helpUri: `https://github.com/rohitg00/agent-doctor/blob/main/docs/CHECKS.md#${anchor(id)}`,
      defaultConfiguration: { level: sarifLevel(sample?.severity ?? "info") },
    };
  });

  const results = report.diagnostics.map((d) => ({
    ruleId: d.id,
    level: sarifLevel(d.severity),
    message: { text: d.message || d.title },
    locations: d.file
      ? [
          {
            physicalLocation: {
              artifactLocation: { uri: d.file.replace(/^\/+/, "") },
              region: d.line !== undefined ? { startLine: d.line } : undefined,
            },
          },
        ]
      : undefined,
    properties: {
      confidence: d.confidence,
      agent: d.agent,
      category: d.category,
    },
  }));

  const sarif = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "agent-doctor",
            version,
            informationUri: "https://github.com/rohitg00/agent-doctor",
            rules,
          },
        },
        results,
        properties: {
          ok: report.ok,
          tally: report.tally,
          deep: report.deep,
          network: report.network,
        },
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

function sarifLevel(severity: Diagnostic["severity"]): "error" | "warning" | "note" {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    default:
      return "note";
  }
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function anchor(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
