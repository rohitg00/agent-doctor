import type { AgentId, AgentProbe, Diagnostic } from "./types.js";

export interface ValidateContext {
  cwd: string;
  deep: boolean;
  network: boolean;
  home: string;
}

export interface AgentAdapter {
  id: AgentId;
  apiVersion?: string;
  probe(cwd: string): Promise<AgentProbe>;
  validate(probe: AgentProbe, ctx: ValidateContext): Promise<Diagnostic[]>;
}

export interface AgentDoctorPlugin {
  name: string;
  apiVersion?: string;
  agents?: AgentAdapter[];
}

export type PluginFactory = () => AgentDoctorPlugin | Promise<AgentDoctorPlugin>;

export const SUPPORTED_PLUGIN_API = "1.x";
