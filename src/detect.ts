import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  AgentInstructionFile,
  CiWorkflow,
  PackageManager,
  PackageNode,
  ProjectGraph,
  SkillDefinition,
} from "./types.js";

const SKILL_ROOTS = [
  ".codex/skills",
  ".agents/skills",
  ".claude/skills",
  ".cursor/rules",
  "skills",
];

const AGENT_INSTRUCTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  "GEMINI.md",
  ".windsurfrules",
];

const CI_DIRS = [".github/workflows", ".gitlab", ".circleci"];

export async function detectProject(cwd: string, skillPaths?: string[]): Promise<ProjectGraph> {
  const packageManager = detectPackageManager(cwd);
  const lockfile = detectLockfile(cwd);
  const packages = await detectPackages(cwd);
  const skills = await detectSkills(cwd, skillPaths ?? SKILL_ROOTS);
  const agentInstructions = await detectAgentInstructions(cwd);
  const ciWorkflows = await detectCiWorkflows(cwd);

  return {
    root: cwd,
    packageManager,
    packages,
    skills,
    agentInstructions,
    ciWorkflows,
    hasLockfile: lockfile !== undefined,
    lockfileName: lockfile,
  };
}

function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  if (existsSync(join(cwd, "package.json"))) return "npm";
  return "unknown";
}

function detectLockfile(cwd: string): string | undefined {
  for (const name of ["pnpm-lock.yaml", "yarn.lock", "bun.lockb", "package-lock.json"]) {
    if (existsSync(join(cwd, name))) return name;
  }
  return undefined;
}

async function detectPackages(cwd: string): Promise<PackageNode[]> {
  const rootManifest = join(cwd, "package.json");
  if (!existsSync(rootManifest)) return [];

  const rootPkg = JSON.parse(await readFile(rootManifest, "utf8")) as Record<string, unknown>;
  const out: PackageNode[] = [
    {
      name: (rootPkg["name"] as string) ?? "(root)",
      dir: cwd,
      manifest: rootManifest,
      scripts: (rootPkg["scripts"] as Record<string, string>) ?? {},
      workspaceRoot: true,
    },
  ];

  const workspaces = extractWorkspaces(rootPkg);
  if (workspaces.length > 0) {
    const pnpmWs = join(cwd, "pnpm-workspace.yaml");
    if (existsSync(pnpmWs)) {
      try {
        const ws = parseYaml(await readFile(pnpmWs, "utf8")) as { packages?: string[] };
        for (const pat of ws.packages ?? []) workspaces.push(pat);
      } catch {}
    }

    for (const pat of workspaces) {
      const matched = await expandGlob(cwd, pat);
      for (const dir of matched) {
        const manifest = join(dir, "package.json");
        if (!existsSync(manifest)) continue;
        try {
          const pkg = JSON.parse(await readFile(manifest, "utf8")) as Record<string, unknown>;
          out.push({
            name: (pkg["name"] as string) ?? relative(cwd, dir),
            dir,
            manifest,
            scripts: (pkg["scripts"] as Record<string, string>) ?? {},
            workspaceRoot: false,
          });
        } catch {}
      }
    }
  }
  return out;
}

function extractWorkspaces(pkg: Record<string, unknown>): string[] {
  const ws = pkg["workspaces"];
  if (Array.isArray(ws)) return ws.filter((x): x is string => typeof x === "string");
  if (ws && typeof ws === "object") {
    const packages = (ws as Record<string, unknown>)["packages"];
    if (Array.isArray(packages)) return packages.filter((x): x is string => typeof x === "string");
  }
  return [];
}

async function expandGlob(root: string, pattern: string): Promise<string[]> {
  const clean = pattern.replace(/\/$/, "");
  if (!clean.includes("*")) {
    const abs = join(root, clean);
    return existsSync(abs) ? [abs] : [];
  }
  const segments = clean.split("/");
  let candidates: string[] = [root];
  for (const seg of segments) {
    const next: string[] = [];
    for (const dir of candidates) {
      if (!existsSync(dir)) continue;
      if (seg === "**") {
        for (const descendant of await walkDirs(dir)) next.push(descendant);
        continue;
      }
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      if (seg === "*") {
        for (const e of entries) if (e.isDirectory()) next.push(join(dir, e.name));
      } else {
        const target = join(dir, seg);
        if (existsSync(target)) next.push(target);
      }
    }
    candidates = next;
  }
  return candidates;
}

async function walkDirs(root: string): Promise<string[]> {
  const out: string[] = [root];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === ".git") continue;
      const child = join(dir, e.name);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

async function detectSkills(cwd: string, roots: string[]): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = [];
  for (const root of roots) {
    const abs = join(cwd, root);
    if (!existsSync(abs)) continue;
    await walkSkills(abs, skills);
  }
  return skills;
}

async function walkSkills(dir: string, out: SkillDefinition[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walkSkills(p, out);
      continue;
    }
    const name = e.name.toLowerCase();
    if (
      name === "skill.md" ||
      name.endsWith(".skill.md") ||
      (p.includes(`${sep}.cursor${sep}rules${sep}`) && name.endsWith(".mdc"))
    ) {
      out.push(await readSkill(p));
    }
  }
}

async function readSkill(path: string): Promise<SkillDefinition> {
  const raw = await readFile(path, "utf8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = frontmatter ? safeYaml(frontmatter) : {};
  const st = await stat(path);
  return {
    path,
    name: typeof fm["name"] === "string" ? (fm["name"] as string) : undefined,
    description: typeof fm["description"] === "string" ? (fm["description"] as string) : undefined,
    frontmatter: fm,
    body,
    bytes: st.size,
  };
}

function splitFrontmatter(raw: string): { frontmatter?: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) return { body: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { body: normalized };
  const fm = normalized.slice(3, end).replace(/^\n/, "");
  const body = normalized.slice(end + 4).replace(/^\n/, "");
  return { frontmatter: fm, body };
}

function safeYaml(input: string): Record<string, unknown> {
  try {
    const parsed = parseYaml(input);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { __parse_error__: true };
  }
}

async function detectAgentInstructions(cwd: string): Promise<AgentInstructionFile[]> {
  const out: AgentInstructionFile[] = [];
  for (const name of AGENT_INSTRUCTION_FILES) {
    const p = join(cwd, name);
    if (existsSync(p)) {
      const s = await stat(p).catch(() => undefined);
      out.push({ path: p, bytes: s?.size ?? 0 });
    }
  }
  return out;
}

async function detectCiWorkflows(cwd: string): Promise<CiWorkflow[]> {
  const out: CiWorkflow[] = [];
  for (const dir of CI_DIRS) {
    const abs = join(cwd, dir);
    if (!existsSync(abs)) continue;
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isFile()) continue;
      const p = join(abs, e.name);
      const s = await stat(p).catch(() => undefined);
      out.push({ path: p, bytes: s?.size ?? 0 });
    }
  }
  return out;
}
