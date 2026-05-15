import { existsSync } from "node:fs";
import { join } from "node:path";
import { homePath } from "./shared/probe.js";
import { findExtension } from "./shared/vscode-ext.js";
import { parseJsonFile } from "./shared/config-parse.js";
import { auditSkills, discoverSkills } from "./shared/skills.js";
import { validateMcpServers, type McpServerConfig } from "./shared/mcp.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "cline" as const;
const EXT_ID = "saoudrizwan.claude-dev";
const DATA_DIR = homePath(".cline", "data");
const SKILLS_DIR = join(DATA_DIR, "skills");
const MCP_FILE = join(DATA_DIR, "cline_mcp_settings.json");

export const clineAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(): Promise<AgentProbe> {
    const ext = await findExtension(EXT_ID);
    const configPaths = [DATA_DIR, MCP_FILE].filter((p) => existsSync(p));
    const present = !!ext || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      version: ext?.version,
      configPaths,
      source: ext ? "vscode-ext" : "config-only",
    };
  },

  async validate(_probe: AgentProbe, ctx: ValidateContext): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];

    if (existsSync(MCP_FILE)) {
      const parsed = await parseJsonFile<{ mcpServers?: Record<string, McpServerConfig> }>(
        MCP_FILE,
        AGENT_ID,
        `${AGENT_ID}/config/mcp-invalid-json`,
      );
      out.push(...parsed.diagnostics);
      const servers = parsed.data?.mcpServers;
      if (servers && Object.keys(servers).length > 0) {
        out.push(...validateMcpServers({ agent: AGENT_ID, configPath: MCP_FILE, servers }));
      }
    }

    if (existsSync(SKILLS_DIR)) {
      const skills = await discoverSkills([SKILLS_DIR]);
      out.push(...auditSkills({ agent: AGENT_ID, cwd: ctx.cwd, skills }));
    }

    return out;
  },
};
