import type {
  ChangedFile,
  PlannedCheck,
  ProjectGraph,
  RiskDimensions,
  RiskLevel,
  RiskSummary,
} from "./types.js";
import type { UserConfig } from "./config.js";
import { relative } from "node:path";
import { globToRegex } from "./glob.js";

const PUBLIC_API_HINTS = [/(^|\/)src\/index\.[jt]sx?$/, /(^|\/)src\/api\//, /(^|\/)src\/public\//];
const SCHEMA_HINTS = [/(^|\/)migrations\//i, /(^|\/)schema\./i, /(^|\/)prisma\/schema/, /(^|\/)\.sql$/i];
const AUTH_HINTS = [/(^|\/)auth\//i, /(^|\/)permissions?\//i, /(^|\/)rbac\//i, /(^|\/)session\//i];
const PAY_HINTS = [/(^|\/)payments?\//i, /(^|\/)billing\//i, /(^|\/)checkout\//i, /(^|\/)stripe\//i];
const UI_HINTS = [/\.(t|j)sx$/, /(^|\/)routes?\//i, /(^|\/)pages\//i, /(^|\/)views\//i, /\.svelte$/, /\.vue$/];
const DEP_HINTS = [/(^|\/)package\.json$/, /(^|\/)package-lock\.json$/, /(^|\/)pnpm-lock\.yaml$/, /(^|\/)yarn\.lock$/, /(^|\/)bun\.lockb$/];
const CI_HINTS = [/\.github\/workflows\//, /\.gitlab/, /\.circleci\//, /Dockerfile/i, /turbo\.json/, /nx\.json/];
const AGENT_HINTS = [
  /(^|\/)AGENTS\.md$/,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)\.cursor\//,
  /(^|\/)\.codex\//,
  /(^|\/)\.agents\//,
  /(^|\/)\.claude\//,
  /(^|\/)skills?\//i,
  /SKILL\.md$/,
];
const SECURITY_HINTS = [
  /\.env(\..*)?$/,
  /(^|\/)secrets?\//i,
  /(^|\/)credentials?\//i,
  /(^|\/)\.npmrc$/,
];

export function classifyRisk(args: {
  changedFiles: ChangedFile[];
  config: UserConfig;
}): RiskSummary {
  const dims: RiskDimensions = {
    publicApi: false,
    schemaOrMigration: false,
    authOrPermission: false,
    uiOrRoute: false,
    dependencyGraph: false,
    generated: false,
    agentInstruction: false,
    ciOrBuild: false,
    largeDeletion: false,
    securitySensitive: false,
  };
  const notes: string[] = [];

  const criticalPatterns = (args.config.risk?.critical ?? []).map(globToRegex);
  const generatedPatterns = (args.config.risk?.generated ?? []).map(globToRegex);

  let totalDeletions = 0;
  for (const f of args.changedFiles) {
    const p = f.path;
    if (PUBLIC_API_HINTS.some((r) => r.test(p))) dims.publicApi = true;
    if (SCHEMA_HINTS.some((r) => r.test(p))) dims.schemaOrMigration = true;
    if (AUTH_HINTS.some((r) => r.test(p))) dims.authOrPermission = true;
    if (PAY_HINTS.some((r) => r.test(p))) dims.authOrPermission = true;
    if (UI_HINTS.some((r) => r.test(p))) dims.uiOrRoute = true;
    if (DEP_HINTS.some((r) => r.test(p))) dims.dependencyGraph = true;
    if (CI_HINTS.some((r) => r.test(p))) dims.ciOrBuild = true;
    if (AGENT_HINTS.some((r) => r.test(p))) dims.agentInstruction = true;
    if (SECURITY_HINTS.some((r) => r.test(p))) dims.securitySensitive = true;
    if (generatedPatterns.some((r) => r.test(p))) dims.generated = true;
    if (criticalPatterns.some((r) => r.test(p))) {
      dims.securitySensitive = true;
      notes.push(`critical path matched: ${p}`);
    }
    totalDeletions += f.deletions ?? 0;
  }
  if (totalDeletions > 500) dims.largeDeletion = true;

  const level = rollup(dims, args.changedFiles.length);
  return { level, dimensions: dims, notes };
}

function rollup(d: RiskDimensions, fileCount: number): RiskLevel {
  if (d.securitySensitive || d.authOrPermission || d.schemaOrMigration) return "critical";
  if (d.publicApi || d.dependencyGraph || d.ciOrBuild || d.largeDeletion) return "high";
  if (d.uiOrRoute || d.agentInstruction || fileCount > 30) return "medium";
  if (fileCount === 0) return "low";
  return "low";
}

export function planChecks(args: {
  detected: ProjectGraph;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
  config: UserConfig;
}): PlannedCheck[] {
  const planned: PlannedCheck[] = [];
  const scripts = collectScripts(args.detected);
  const cmd = (key: string, fallback?: string): string | undefined => {
    const override = args.config.commands?.[key];
    if (override) return override;
    const script = scripts.get(key);
    if (script) return formatScript(args.detected.packageManager, key);
    return fallback;
  };

  const affected = mapChangedToPackages(args.changedFiles, args.detected);
  const touched = affected.length > 0;

  const typecheckCmd = cmd("typecheck") ?? cmd("type-check");
  if (typecheckCmd && touched) {
    planned.push({
      id: "validation/typecheck",
      command: typecheckCmd,
      required: args.risk.level !== "low",
      reason: "TS/JS sources changed",
    });
  }

  const lintCmd = cmd("lint");
  if (lintCmd && touched) {
    planned.push({
      id: "validation/lint",
      command: lintCmd,
      required: false,
      reason: "static analysis (advisory)",
    });
  }

  const testCmd = cmd("test");
  if (testCmd && args.risk.level !== "low") {
    planned.push({
      id: "validation/test",
      command: testCmd,
      required: ["high", "critical"].includes(args.risk.level),
      reason: "behavior or risky path changed",
    });
  }

  const buildCmd = cmd("build");
  if (buildCmd && (args.risk.dimensions.publicApi || args.risk.dimensions.ciOrBuild)) {
    planned.push({
      id: "validation/build",
      command: buildCmd,
      required: args.risk.dimensions.ciOrBuild,
      reason: "public API or build config changed",
    });
  }

  if (args.risk.dimensions.uiOrRoute) {
    const e2eCmd = cmd("test:e2e") ?? cmd("e2e") ?? cmd("test:browser");
    planned.push({
      id: "validation/browser-qa",
      command: e2eCmd ?? "<no browser test script configured>",
      required: false,
      reason: "UI or route changed — browser proof recommended",
    });
  }

  if (args.risk.dimensions.schemaOrMigration) {
    const migCmd = cmd("db:migrate:check") ?? cmd("migrate:validate");
    planned.push({
      id: "validation/migration",
      command: migCmd ?? "<no migration validation script configured>",
      required: migCmd !== undefined,
      reason: "schema/migration changed",
    });
  }

  return planned;
}

function collectScripts(graph: ProjectGraph): Map<string, string> {
  const out = new Map<string, string>();
  for (const pkg of graph.packages) {
    for (const [k, v] of Object.entries(pkg.scripts ?? {})) {
      if (!out.has(k)) out.set(k, v);
    }
  }
  return out;
}

function formatScript(pm: ProjectGraph["packageManager"], script: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm ${script}`;
    case "yarn":
      return `yarn ${script}`;
    case "bun":
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

function mapChangedToPackages(files: ChangedFile[], graph: ProjectGraph): string[] {
  const out = new Set<string>();
  const dirs = graph.packages
    .filter((p) => !p.workspaceRoot)
    .map((p) => ({ name: p.name, dir: relative(graph.root, p.dir).replace(/\\/g, "/") }));
  for (const f of files) {
    for (const d of dirs) {
      if (f.path === d.dir || f.path.startsWith(`${d.dir}/`)) {
        out.add(d.name);
      }
    }
  }
  return [...out];
}

