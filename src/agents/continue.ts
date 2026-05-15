import { existsSync } from "node:fs";
import { join } from "node:path";
import { homePath } from "./shared/probe.js";
import { findExtension } from "./shared/vscode-ext.js";
import { parseYamlFile, parseJsonFile } from "./shared/config-parse.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "continue" as const;
const EXT_ID = "continue.continue";
const CONFIG_DIR = homePath(".continue");
const CONFIG_YAML = join(CONFIG_DIR, "config.yaml");
const LEGACY_JSON = join(CONFIG_DIR, "config.json");

export const continueAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(): Promise<AgentProbe> {
    const ext = await findExtension(EXT_ID);
    const configPaths = [CONFIG_YAML, LEGACY_JSON].filter((p) => existsSync(p));
    const present = !!ext || existsSync(CONFIG_DIR) || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      version: ext?.version,
      configPaths,
      source: ext ? "vscode-ext" : "config-only",
    };
  },

  async validate(_probe: AgentProbe, _ctx: ValidateContext): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];

    if (existsSync(CONFIG_YAML)) {
      const parsed = await parseYamlFile(CONFIG_YAML, AGENT_ID, `${AGENT_ID}/config/yaml-parse-error`);
      out.push(...parsed.diagnostics);
    } else if (existsSync(LEGACY_JSON)) {
      const parsed = await parseJsonFile(LEGACY_JSON, AGENT_ID, `${AGENT_ID}/config/json-parse-error`);
      out.push(...parsed.diagnostics);
      out.push({
        id: `${AGENT_ID}/config/legacy-json-detected`,
        severity: "warning",
        title: "Continue legacy config.json detected",
        message: `Continue migrated to config.yaml. Convert ${LEGACY_JSON} to YAML to keep newer model providers working.`,
        file: LEGACY_JSON,
        agent: AGENT_ID,
        category: "config",
        evidence: [{ kind: "file", path: LEGACY_JSON }],
        confidence: "medium",
        fixHint: { kind: "doc", url: "https://docs.continue.dev/customize/config" },
      });
    }

    return out;
  },
};
