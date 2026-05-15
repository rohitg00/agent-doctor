import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseYamlFile } from "./shared/config-parse.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "windsurf" as const;
const HOME_DIR = homePath(".codeium", "windsurf");
const CONFIG = join(HOME_DIR, "config.yaml");

export const windsurfAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(cwd: string): Promise<AgentProbe> {
    const bin = findBinary("windsurf");
    const projectRules = resolve(cwd, ".windsurfrules");
    const configPaths: string[] = [];
    if (existsSync(CONFIG)) configPaths.push(CONFIG);
    if (existsSync(projectRules)) configPaths.push(projectRules);
    const present = bin.found || existsSync(HOME_DIR) || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      binary: "windsurf",
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
      const parsed = await parseYamlFile(CONFIG, AGENT_ID, `${AGENT_ID}/config/yaml-parse-error`);
      out.push(...parsed.diagnostics);
    }

    return out;
  },
};
