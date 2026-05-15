export type Severity = "error" | "warning" | "info";

export type Confidence = "high" | "medium" | "low";

export type AgentId =
  | "claude-code"
  | "cursor"
  | "codex"
  | "windsurf"
  | "aider"
  | "cline"
  | "goose"
  | "continue"
  | "opencode"
  | "roo"
  | string;

export type DiagnosticCategory =
  | "install"
  | "auth"
  | "config"
  | "mcp"
  | "skills"
  | "rules"
  | "hooks"
  | "permissions"
  | "version"
  | "network";

export type FixHint =
  | { kind: "command"; run: string; cwd?: string; sudo?: boolean }
  | {
      kind: "file-edit";
      path: string;
      insert?: string;
      replace?: { from: string; to: string };
      keyPath?: string;
      value?: unknown;
    }
  | { kind: "env-set"; name: string; example?: string; shell?: "bash" | "zsh" | "fish" }
  | { kind: "reinstall"; instruction: string }
  | { kind: "doc"; url: string; anchor?: string };

export type Evidence =
  | { kind: "file"; path: string; line?: number; hash?: string }
  | { kind: "command"; command: string; exitCode: number; durationMs: number; outputExcerpt?: string }
  | { kind: "env"; name: string; present: boolean }
  | { kind: "config"; path: string; key?: string; value?: unknown };

export interface NextAction {
  label: string;
  command?: string;
}

export interface Diagnostic {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  file?: string;
  line?: number;
  agent?: AgentId;
  category?: DiagnosticCategory;
  evidence: Evidence[];
  confidence: Confidence;
  fixHint?: FixHint;
  nextActions?: NextAction[];
  fatal?: boolean;
  since?: string;
}

export interface AgentProbe {
  id: AgentId;
  present: boolean;
  binary?: string;
  binaryPath?: string;
  version?: string;
  configPaths: string[];
  source: "binary" | "vscode-ext" | "config-only" | "absent";
  notes?: string[];
}

export interface AgentSummary {
  id: AgentId;
  present: boolean;
  version?: string;
  status: "healthy" | "warnings" | "errors" | "absent" | "skipped";
  errorCount: number;
  warningCount: number;
  infoCount: number;
  headline?: string;
}

export interface Tally {
  agentsDetected: number;
  agentsHealthy: number;
  agentsWithWarnings: number;
  agentsWithErrors: number;
  errors: number;
  warnings: number;
  infos: number;
  suppressed: number;
}

export interface Report {
  ok: boolean;
  tally: Tally;
  agents: AgentSummary[];
  diagnostics: Diagnostic[];
  durationMs: number;
  deep: boolean;
  network: boolean;
}

export interface CliOptions {
  cwd: string;
  agent?: AgentId;
  list: boolean;
  deep: boolean;
  noNetwork: boolean;
  ci: boolean;
  json: boolean;
  sarif?: string | true;
  junit?: string | true;
  annotations: boolean;
  failOn: "error" | "warning" | "none";
  ignore: string[];
  showIgnored: boolean;
  explain?: string;
  width?: number;
  color: boolean;
  unicode: boolean;
}
