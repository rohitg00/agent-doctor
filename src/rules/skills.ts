import { existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { Diagnostic, SkillDefinition } from "../types.js";
import type { UserConfig } from "../config.js";

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

export function auditSkills(args: {
  skills: SkillDefinition[];
  cwd: string;
  config: UserConfig;
}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const maxBytes = args.config.skills?.maxInlineBytes ?? 160_000;

  for (const skill of args.skills) {
    out.push(...frontmatterDiagnostics(skill));
    out.push(...sizeDiagnostics(skill, maxBytes));
    out.push(...referenceDiagnostics(skill, args.cwd));
    out.push(...destructiveCommandDiagnostics(skill));
  }
  return out;
}

function frontmatterDiagnostics(skill: SkillDefinition): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (skill.frontmatter["__parse_error__"]) {
    out.push({
      id: "agent/skill-frontmatter-invalid",
      severity: "error",
      title: "Skill frontmatter does not parse",
      message: "YAML frontmatter is malformed.",
      file: skill.path,
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
    });
    return out;
  }
  if (!skill.name && !skill.frontmatter["name"]) {
    out.push({
      id: "agent/skill-frontmatter-invalid",
      severity: "warning",
      title: "Skill is missing a name",
      message: "Skill frontmatter has no `name` field. Agents cannot reliably trigger this skill.",
      file: skill.path,
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
    });
  }
  if (!skill.description && !skill.frontmatter["description"]) {
    out.push({
      id: "agent/skill-frontmatter-invalid",
      severity: "warning",
      title: "Skill is missing a description",
      message:
        "Skill frontmatter has no `description`. Without trigger language, the agent cannot choose this skill.",
      file: skill.path,
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
    });
  } else {
    const desc = (skill.description ?? (skill.frontmatter["description"] as string)) ?? "";
    if (desc.length < 20) {
      out.push({
        id: "agent/skill-trigger-too-broad",
        severity: "info",
        title: "Skill description is very short",
        message: "Description lacks usable trigger language. Hard to match against real user prompts.",
        file: skill.path,
        evidence: [{ kind: "file", path: skill.path }],
        confidence: "low",
      });
    }
  }
  return out;
}

function sizeDiagnostics(skill: SkillDefinition, maxBytes: number): Diagnostic[] {
  if (skill.bytes <= maxBytes) return [];
  return [
    {
      id: "agent/skill-too-large",
      severity: "warning",
      title: "Skill exceeds inline byte budget",
      message: `${skill.path} is ${skill.bytes} bytes (limit ${maxBytes}). Consider progressive disclosure: keep the trigger surface small and link to deeper docs.`,
      file: skill.path,
      evidence: [{ kind: "file", path: skill.path }],
      confidence: "high",
    },
  ];
}

function referenceDiagnostics(skill: SkillDefinition, cwd: string): Diagnostic[] {
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
        id: "agent/skill-reference-broken",
        severity: "warning",
        title: "Skill references a missing file",
        message: `${relative(cwd, skill.path)} references \`${ref}\` but no such file exists.`,
        file: skill.path,
        evidence: [{ kind: "file", path: skill.path }],
        confidence: "medium",
      });
    }
  }
  return out;
}

function destructiveCommandDiagnostics(skill: SkillDefinition): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = skill.body.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const pattern of DANGEROUS_PATTERNS) {
      if (!pattern.test(line)) continue;
      const context = lines.slice(Math.max(0, i - 5), i + 5).join(" ");
      if (APPROVAL_HINTS.test(context)) continue;
      out.push({
        id: "agent/destructive-command-unguarded",
        severity: "warning",
        title: "Destructive command without approval language",
        message: `Line ${i + 1}: \`${line.trim().slice(0, 120)}\` runs a destructive operation. No nearby approval/confirmation guidance was detected.`,
        file: skill.path,
        line: i + 1,
        evidence: [{ kind: "file", path: skill.path, line: i + 1 }],
        confidence: "low",
        nextActions: [
          { label: "explicitly require confirmation in the skill, or gate behind --yes" },
        ],
      });
    }
  }
  return out;
}

export function applicableSkillsForChanges(args: {
  skills: SkillDefinition[];
  changedPaths: string[];
  cwd: string;
}): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const skill of args.skills) {
    const desc = (skill.description ?? (skill.frontmatter["description"] as string)) ?? "";
    if (!desc) continue;
    const tokens = desc.toLowerCase().split(/[^a-z0-9_/.+-]/).filter((t) => t.length > 3);
    const match = args.changedPaths.find((p) => tokens.some((t) => p.toLowerCase().includes(t)));
    if (match) {
      out.push({
        id: "agent/skill-applicable-no-proof",
        severity: "info",
        title: "Skill appears applicable to this diff",
        message: `Skill ${relative(args.cwd, skill.path)} description mentions terms that overlap with ${match}. No transcript evidence was supplied — informational only.`,
        file: skill.path,
        evidence: [{ kind: "file", path: skill.path }],
        confidence: "low",
      });
    }
  }
  return out;
}

