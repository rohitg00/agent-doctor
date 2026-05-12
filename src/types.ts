export type Severity = "error" | "warning" | "info";

export type Confidence = "high" | "medium" | "low";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type Profile = "local" | "ci" | "release" | "skill-library";

export type Mode = "diff" | "staged" | "full";

export type Evidence =
  | { kind: "file"; path: string; line?: number; hash?: string }
  | { kind: "diff"; file: string; status: string; insertions?: number; deletions?: number }
  | { kind: "command"; command: string; exitCode: number; durationMs: number; outputExcerpt?: string }
  | { kind: "ci"; provider: string; runUrl?: string; status: string }
  | { kind: "agent-event"; source: string; event: string; timestamp?: string; detail?: unknown }
  | { kind: "artifact"; path: string; artifactType: "screenshot" | "trace" | "coverage" | "snapshot" | "log" };

export interface NextAction {
  label: string;
  command?: string;
}

export interface SuggestedFix {
  description: string;
  patch?: string;
}

export interface Diagnostic {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  file?: string;
  line?: number;
  evidence: Evidence[];
  confidence: Confidence;
  nextActions?: NextAction[];
  fix?: SuggestedFix;
}

export interface CheckResult {
  id: string;
  command?: string;
  status: "passed" | "failed" | "skipped" | "missing";
  required: boolean;
  durationMs?: number;
  diagnostics: Diagnostic[];
}

export interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";
  oldPath?: string;
  insertions?: number;
  deletions?: number;
}

export interface PackageNode {
  name: string;
  dir: string;
  manifest: string;
  scripts: Record<string, string>;
  workspaceRoot: boolean;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

export interface SkillDefinition {
  path: string;
  name?: string;
  description?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  bytes: number;
}

export interface AgentInstructionFile {
  path: string;
  bytes: number;
}

export interface CiWorkflow {
  path: string;
  bytes: number;
}

export interface ProjectGraph {
  root: string;
  packageManager: PackageManager;
  packages: PackageNode[];
  agentInstructions: AgentInstructionFile[];
  skills: SkillDefinition[];
  ciWorkflows: CiWorkflow[];
  hasLockfile: boolean;
  lockfileName?: string;
}

export interface RiskDimensions {
  publicApi: boolean;
  schemaOrMigration: boolean;
  authOrPermission: boolean;
  uiOrRoute: boolean;
  dependencyGraph: boolean;
  generated: boolean;
  agentInstruction: boolean;
  ciOrBuild: boolean;
  largeDeletion: boolean;
  securitySensitive: boolean;
}

export interface RiskSummary {
  level: RiskLevel;
  dimensions: RiskDimensions;
  notes: string[];
}

export interface PlannedCheck {
  id: string;
  command: string;
  required: boolean;
  reason: string;
  cwd?: string;
}

export interface EvidenceSummary {
  diffFiles: number;
  commandRuns: number;
  ciLogs: number;
  agentEvents: number;
  artifacts: number;
}

export interface Report {
  ok: boolean;
  score: number;
  label: "Ready" | "Needs review" | "Risky" | "Blocked";
  profile: Profile;
  mode: Mode;
  detected: ProjectGraph;
  risk: RiskSummary;
  changedFiles: ChangedFile[];
  plannedChecks: PlannedCheck[];
  evidence: EvidenceSummary;
  checks: CheckResult[];
  diagnostics: Diagnostic[];
}

export interface CliOptions {
  cwd: string;
  mode: Mode;
  base?: string;
  profile: Profile;
  run: boolean;
  planOnly: boolean;
  json: boolean;
  annotations: boolean;
  failOn: "error" | "warning" | "none";
  evidencePaths: string[];
  configPath?: string;
  explain?: string;
  aiReview?: boolean;
  noNetwork?: boolean;
}
