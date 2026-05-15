import { findExtension } from "./shared/vscode-ext.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "roo" as const;
const EXT_ID = "rooveterinaryai.roo-cline";

export const rooAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(): Promise<AgentProbe> {
    const ext = await findExtension(EXT_ID);
    if (!ext) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      version: ext.version,
      configPaths: ext.path ? [ext.path] : [],
      source: "vscode-ext",
    };
  },

  async validate(_probe: AgentProbe, _ctx: ValidateContext): Promise<Diagnostic[]> {
    return [];
  },
};
