import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { AgentId, Diagnostic } from "../../types.js";

export interface ParseResult<T> {
  data?: T;
  diagnostics: Diagnostic[];
  exists: boolean;
  raw?: string;
}

export async function parseJsonFile<T = unknown>(
  path: string,
  agent: AgentId,
  ruleId: string,
): Promise<ParseResult<T>> {
  if (!existsSync(path)) return { exists: false, diagnostics: [] };
  const raw = await readFile(path, "utf8").catch(() => undefined);
  if (raw === undefined) return { exists: false, diagnostics: [] };
  try {
    return { data: JSON.parse(raw) as T, diagnostics: [], exists: true, raw };
  } catch (err) {
    return {
      exists: true,
      raw,
      diagnostics: [
        {
          id: ruleId,
          severity: "error",
          title: "Config JSON does not parse",
          message: `${path}: ${err instanceof Error ? err.message : String(err)}`,
          file: path,
          agent,
          category: "config",
          evidence: [{ kind: "file", path }],
          confidence: "high",
          fixHint: { kind: "doc", url: "https://jsonlint.com" },
        },
      ],
    };
  }
}

export async function parseYamlFile<T = unknown>(
  path: string,
  agent: AgentId,
  ruleId: string,
): Promise<ParseResult<T>> {
  if (!existsSync(path)) return { exists: false, diagnostics: [] };
  const raw = await readFile(path, "utf8").catch(() => undefined);
  if (raw === undefined) return { exists: false, diagnostics: [] };
  try {
    return { data: parseYaml(raw) as T, diagnostics: [], exists: true, raw };
  } catch (err) {
    return {
      exists: true,
      raw,
      diagnostics: [
        {
          id: ruleId,
          severity: "error",
          title: "Config YAML does not parse",
          message: `${path}: ${err instanceof Error ? err.message : String(err)}`,
          file: path,
          agent,
          category: "config",
          evidence: [{ kind: "file", path }],
          confidence: "high",
          fixHint: { kind: "doc", url: "https://yamllint.com" },
        },
      ],
    };
  }
}
