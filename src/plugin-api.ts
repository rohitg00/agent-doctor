import type {
  ChangedFile,
  CheckResult,
  Diagnostic,
  PlannedCheck,
  ProjectGraph,
  RiskSummary,
  Severity,
} from "./types.js";
import type { UserConfig } from "./config.js";

export interface DetectContext {
  cwd: string;
  config: UserConfig;
}

export interface DetectedCapability {
  language?: string;
  packageManager?: string;
  testRunners?: string[];
  scripts?: Record<string, string>;
}

export interface PlanContext {
  cwd: string;
  config: UserConfig;
  detected: ProjectGraph;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
}

export interface RuleContext {
  cwd: string;
  config: UserConfig;
  detected: ProjectGraph;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
  checks: CheckResult[];
}

export interface Rule {
  id: string;
  defaultSeverity: Severity;
  run(ctx: RuleContext): Promise<Diagnostic[]> | Diagnostic[];
}

export interface AgentDoctorPlugin {
  name: string;
  apiVersion?: string;
  detect?(ctx: DetectContext): Promise<DetectedCapability[]> | DetectedCapability[];
  plan?(ctx: PlanContext): Promise<PlannedCheck[]> | PlannedCheck[];
  rules?: Rule[];
}

export type PluginFactory = () => AgentDoctorPlugin | Promise<AgentDoctorPlugin>;

export const SUPPORTED_PLUGIN_API = "0.x";
