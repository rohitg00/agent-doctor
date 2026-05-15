import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentId, Diagnostic } from "../../types.js";

const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/,
  /\bsudo\b/,
  /\bcurl\s+[^|]*\|\s*(sh|bash|zsh)/,
  /\bwget\s+[^|]*\|\s*(sh|bash|zsh)/,
  /\bgit\s+push\s+--force\b/,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /:\(\)\{\s*:\|:&\s*\};:/,
];
const APPROVAL_HINTS = /(confirm|approve|ask the user|require approval|only when explicitly|review before)/i;
const REFERENCE_PATTERN = /(?:`([^`\s]+\/[^`\s]+)`|\(([^)]+\.(?:md|ts|tsx|js|jsx|py|rs|go|json|ya?ml|sh|mjs|cjs))\))/g;

export interface SkillRecord {
  path: string;
  body: string;
  bytes: number;
  frontmatter: Record<string, unknown>;
  name?: string;
  description?: string;
}

export interface SkillsAuditArgs {
  agent: AgentId;
  cwd: string;
  skills: SkillRecord[];
  maxInlineBytes?: number;
}

const DEFAULT_MAX_BYTES = 160_000;

export function auditSkills(args: SkillsAuditArgs): Diagnostic[] {
  const out: Diagnostic[] = [];
  const max = args.maxInlineBytes ?? DEFAULT_MAX_BYTES;
  const names = new Set<string>();
  for (const skill of args.skills) {
    out.push(...frontmatterChecks(skill, args.agent));
    out.push(...sizeCheck(skill, args.agent, max));
    out.push(...referenceCheck(skill, args.cwd, args.agent));
    out.push(...destructiveCheck(skill, args.agent));
    const lower = (skill.name ?? "").toLowerCase();
    if (lower !== "") {
      if (names.has(lower)) {
        out.push({
          id: `${args.agent}/skills/duplicate-name`,
          severity: "warning",
          title: `Duplicate skill name "${skill.name}"`,
          message: `Two skills declare the same name; the agent will pick one non-deterministically.`,
          file: skill.path,
          agent: args.agent,
          category: "skills",
          evidence: [{ kind: "file", path: skill.path }],
          confidence: "high",
          fixHint: { kind: "file-edit", path: skill.path, keyPath: "name" },
        });
      }
      names.add(lower);
    }
  }
  return out;
}

function frontmatterChecks(skill: SkillRecord, agent: AgentId): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (skill.frontmatter["__parse_error__"]) {
    out.push({
      id: `${agent}/skills/frontmatter-invalid`,
      severity: "error",
      title: "Skill frontmatter does not parse",
      message: "YAML frontmatter is malformed.",
      file: skill.path,
      agent,
      category: "skills",
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
      fixHint: { kind: "doc", url: "https://yamllint.com" },
    });
    return out;
  }
  if (!skill.name && typeof skill.frontmatter["name"] !== "string") {
    out.push({
      id: `${agent}/skills/frontmatter-name-missing`,
      severity: "warning",
      title: "Skill is missing a name",
      message: "Skill frontmatter has no `name` field. The agent cannot reliably trigger this skill.",
      file: skill.path,
      agent,
      category: "skills",
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
      fixHint: { kind: "file-edit", path: skill.path, keyPath: "name", value: "<short-kebab-name>" },
    });
  }
  const rawDesc = skill.description ?? skill.frontmatter["description"];
  if (typeof rawDesc !== "string" || rawDesc.length === 0) {
    out.push({
      id: `${agent}/skills/frontmatter-description-missing`,
      severity: "warning",
      title: "Skill is missing a description",
      message:
        "Without trigger language in the description, the agent cannot choose this skill.",
      file: skill.path,
      agent,
      category: "skills",
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
      fixHint: { kind: "file-edit", path: skill.path, keyPath: "description" },
    });
  } else if (rawDesc.length < 20) {
    out.push({
      id: `${agent}/skills/trigger-too-broad`,
      severity: "info",
      title: "Skill description is very short",
      message: "Description lacks usable trigger language. Hard to match against real user prompts.",
      file: skill.path,
      agent,
      category: "skills",
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "low",
    });
  }
  return out;
}

function sizeCheck(skill: SkillRecord, agent: AgentId, maxBytes: number): Diagnostic[] {
  if (skill.bytes <= maxBytes) return [];
  return [
    {
      id: `${agent}/skills/skill-too-large`,
      severity: "warning",
      title: "Skill exceeds inline byte budget",
      message: `${skill.path} is ${skill.bytes} bytes (limit ${maxBytes}). Consider progressive disclosure: keep the trigger surface small and link to deeper docs.`,
      file: skill.path,
      agent,
      category: "skills",
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
      fixHint: { kind: "doc", url: "https://docs.anthropic.com/claude-code/skills#progressive-disclosure" },
    },
  ];
}

function referenceCheck(skill: SkillRecord, cwd: string, agent: AgentId): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const skillDir = dirname(skill.path);
  for (const match of skill.body.matchAll(REFERENCE_PATTERN)) {
    const ref = (match[1] ?? match[2] ?? "").trim();
    if (!ref || seen.has(ref)) continue;
    if (/^https?:\/\//.test(ref) || /^[a-z]+:/.test(ref)) continue;
    if (ref.includes(" ") || ref.length > 200) continue;
    seen.add(ref);
    const target = isAbsolute(ref) ? ref : resolve(skillDir, ref);
    const cwdTarget = isAbsolute(ref) ? ref : resolve(cwd, ref);
    if (!existsSync(target) && !existsSync(cwdTarget)) {
      out.push({
        id: `${agent}/skills/reference-broken`,
        severity: "warning",
        title: "Skill references a missing file",
        message: `${relative(cwd, skill.path)} references \`${ref}\` but no such file exists.`,
        file: skill.path,
        agent,
        category: "skills",
        evidence: [{ kind: "file", path: skill.path }],
        confidence: "medium",
        fixHint: { kind: "file-edit", path: skill.path },
      });
    }
  }
  return out;
}

function destructiveCheck(skill: SkillRecord, agent: AgentId): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = skill.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const pattern of DANGEROUS_PATTERNS) {
      if (!pattern.test(line)) continue;
      const context = lines.slice(Math.max(0, i - 5), i + 5).join(" ");
      if (APPROVAL_HINTS.test(context)) continue;
      out.push({
        id: `${agent}/skills/destructive-command-unguarded`,
        severity: "warning",
        title: "Destructive command without approval language",
        message: `Line ${i + 1}: \`${line.trim().slice(0, 120)}\` runs a destructive operation with no nearby approval/confirmation guidance.`,
        file: skill.path,
        line: i + 1,
        agent,
        category: "skills",
        evidence: [{ kind: "file", path: skill.path, line: i + 1 }],
        confidence: "low",
        fixHint: { kind: "file-edit", path: skill.path },
      });
    }
  }
  return out;
}

export async function discoverSkills(roots: string[]): Promise<SkillRecord[]> {
  const out: SkillRecord[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    await walkSkills(root, out);
  }
  return out;
}

async function walkSkills(dir: string, out: SkillRecord[], depth = 0): Promise<void> {
  if (depth > 6) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walkSkills(p, out, depth + 1);
      continue;
    }
    const name = e.name.toLowerCase();
    const isSkill =
      name === "skill.md" ||
      name.endsWith(".skill.md") ||
      (p.includes(`${sep}.cursor${sep}rules${sep}`) && name.endsWith(".mdc"));
    if (!isSkill) continue;
    try {
      out.push(await readSkill(p));
    } catch {
      // skip unreadable
    }
  }
}

async function readSkill(path: string): Promise<SkillRecord> {
  const raw = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = frontmatter ? safeYaml(frontmatter) : {};
  const st = statSync(path);
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
  if (!raw.startsWith("---")) return { body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { body: raw };
  const fm = raw.slice(3, end).replace(/^\n/, "");
  const body = raw.slice(end + 4).replace(/^\n/, "");
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
