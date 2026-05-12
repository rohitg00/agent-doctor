import type { ChangedFile, Diagnostic } from "../types.js";
import type { UserConfig } from "../config.js";
import { globToRegex } from "../glob.js";

export function generatedFileEditRule(args: {
  changedFiles: ChangedFile[];
  config: UserConfig;
}): Diagnostic[] {
  const patterns = (args.config.risk?.generated ?? []).map(globToRegex);
  if (patterns.length === 0) return [];

  const generatedHit: ChangedFile[] = [];
  const sourceHit: ChangedFile[] = [];

  for (const f of args.changedFiles) {
    if (patterns.some((r) => r.test(f.path))) {
      generatedHit.push(f);
    } else {
      sourceHit.push(f);
    }
  }
  if (generatedHit.length === 0) return [];

  return generatedHit.map<Diagnostic>((f) => ({
    id: "risk/generated-file-edited",
    severity: "warning",
    title: "Generated file edited",
    message:
      sourceHit.length === 0
        ? `${f.path} matches a generated path but no source/template change was found in this diff.`
        : `${f.path} matches a generated path. Confirm a source or template change is the real intent.`,
    file: f.path,
    evidence: [{ kind: "diff", file: f.path, status: f.status }],
    confidence: "medium",
    nextActions: [{ label: "edit the source or template and re-render" }],
  }));
}

