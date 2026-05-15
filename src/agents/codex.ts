import { existsSync } from "node:fs";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseJsonFile } from "./shared/config-parse.js";
import { checkEnvKey } from "./shared/env-keys.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "codex" as const;
const CODEX_HOME = homePath(".codex");
const CONFIG = homePath(".codex", "config.json");
const SKILLS_DIR = homePath(".codex", "skills");

export const codexAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(): Promise<AgentProbe> {
    const bin = findBinary("codex");
    const configPaths = [CONFIG, SKILLS_DIR].filter((p) => existsSync(p));
    const present = bin.found || existsSync(CODEX_HOME) || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      binary: "codex",
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

    out.push(
      ...checkEnvKey({
        envName: "OPENAI_API_KEY",
        agent: AGENT_ID,
        ruleId: `${AGENT_ID}/auth/openai-key-missing`,
        prefix: /^sk-/,
        exampleValue: "sk-XXXX",
      }),
    );

    const config = await parseJsonFile<Record<string, unknown>>(
      CONFIG,
      AGENT_ID,
      `${AGENT_ID}/config/config-invalid-json`,
    );
    out.push(...config.diagnostics);

    return out;
  },
};
