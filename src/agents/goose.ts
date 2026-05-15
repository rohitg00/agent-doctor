import { existsSync } from "node:fs";
import { join } from "node:path";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseYamlFile } from "./shared/config-parse.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "goose" as const;
const CONFIG_HOME = homePath(".config", "goose");
const CONFIG = join(CONFIG_HOME, "config.yaml");

interface GooseConfig {
  GOOSE_PROVIDER?: string;
  GOOSE_MODEL?: string;
  extensions?: unknown[];
}

export const gooseAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(): Promise<AgentProbe> {
    const bin = findBinary("goose");
    const configPaths = existsSync(CONFIG) ? [CONFIG] : [];
    const present = bin.found || existsSync(CONFIG_HOME) || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      binary: "goose",
      binaryPath: bin.path,
      configPaths,
      source: bin.found ? "binary" : "config-only",
    };
  },

  async validate(probe: AgentProbe, ctx: ValidateContext): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];
    if (ctx.deep && probe.binaryPath) {
      probe.version = await binaryVersion(probe.binaryPath, "--version", 750);
    }
    if (existsSync(CONFIG)) {
      const parsed = await parseYamlFile<GooseConfig>(
        CONFIG,
        AGENT_ID,
        `${AGENT_ID}/config/yaml-parse-error`,
      );
      out.push(...parsed.diagnostics);
      const data = parsed.data ?? {};
      if (!data.GOOSE_PROVIDER) {
        out.push({
          id: `${AGENT_ID}/config/profile-missing`,
          severity: "warning",
          title: "GOOSE_PROVIDER not configured",
          message: `${CONFIG} has no GOOSE_PROVIDER. Goose will refuse to start.`,
          file: CONFIG,
          agent: AGENT_ID,
          category: "config",
          evidence: [{ kind: "config", path: CONFIG, key: "GOOSE_PROVIDER" }],
          confidence: "high",
          fixHint: { kind: "file-edit", path: CONFIG, keyPath: "GOOSE_PROVIDER", value: "anthropic" },
        });
      }
    }
    return out;
  },
};
