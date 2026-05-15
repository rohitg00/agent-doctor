import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseJsonFile } from "./shared/config-parse.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "opencode" as const;
const HOME_CONFIG = homePath(".config", "opencode", "opencode.json");

interface OpenCodeConfig {
  $schema?: string;
  schemaVersion?: string;
  provider?: unknown;
}

export const opencodeAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(cwd: string): Promise<AgentProbe> {
    const bin = findBinary("opencode");
    const project = resolve(cwd, "opencode.json");
    const configPaths = [HOME_CONFIG, project].filter((p) => existsSync(p));
    const present = bin.found || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      binary: "opencode",
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

    for (const path of probe.configPaths) {
      const parsed = await parseJsonFile<OpenCodeConfig>(
        path,
        AGENT_ID,
        `${AGENT_ID}/config/json-parse-error`,
      );
      out.push(...parsed.diagnostics);
    }

    const project = resolve(ctx.cwd, "opencode.json");
    if (existsSync(project) && existsSync(HOME_CONFIG)) {
      out.push({
        id: `${AGENT_ID}/config/precedence-shadow`,
        severity: "info",
        title: "opencode.json in project shadows global config",
        message: `${project} overrides ${HOME_CONFIG}. OpenCode resolves config in 8 layers; double-check which one wins.`,
        file: project,
        agent: AGENT_ID,
        category: "config",
        evidence: [{ kind: "file", path: project }],
        confidence: "low",
        fixHint: { kind: "doc", url: "https://opencode.ai/docs/config" },
      });
    }

    return out;
  },
};
