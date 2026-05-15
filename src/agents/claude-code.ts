import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseJsonFile } from "./shared/config-parse.js";
import { checkEnvKey } from "./shared/env-keys.js";
import { validateMcpServers, type McpServerConfig } from "./shared/mcp.js";
import { validateHookScripts } from "./shared/hooks.js";
import { auditSkills, discoverSkills } from "./shared/skills.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "claude-code" as const;
const SETTINGS = homePath(".claude", "settings.json");
const SETTINGS_LOCAL = homePath(".claude", "settings.local.json");
const CLAUDEMD = homePath(".claude", "CLAUDE.md");
const SKILLS_DIR = homePath(".claude", "skills");
const HOOKS_DIR = homePath(".claude", "hooks");
const MCP_FILE = homePath(".claude", "mcp.json");

interface Settings {
  model?: string;
  permissions?: { allow?: string[]; deny?: string[] };
  hooks?: Record<string, unknown>;
  mcpServers?: Record<string, McpServerConfig>;
}

export const claudeCodeAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(): Promise<AgentProbe> {
    const bin = findBinary("claude");
    const configPaths = [SETTINGS, SETTINGS_LOCAL, CLAUDEMD, MCP_FILE].filter((p) => existsSync(p));
    const present = bin.found || configPaths.length > 0;
    if (!present) {
      return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    }
    return {
      id: AGENT_ID,
      present: true,
      binary: "claude",
      binaryPath: bin.path,
      configPaths,
      source: bin.found ? "binary" : "config-only",
      notes: bin.found && !bin.onPath ? [`binary at ${bin.path} not on PATH`] : undefined,
    };
  },

  async validate(probe: AgentProbe, ctx: ValidateContext): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];

    out.push(...installChecks(probe));

    if (ctx.deep && probe.binaryPath) {
      const version = await binaryVersion(probe.binaryPath, "--version", 750);
      if (version) {
        const cleaned = version.replace(/^claude\s+/i, "").trim();
        probe.version = cleaned.split(/\s+/)[0];
      }
    }

    out.push(
      ...checkEnvKey({
        envName: "ANTHROPIC_API_KEY",
        agent: AGENT_ID,
        ruleId: `${AGENT_ID}/auth/anthropic-key-missing`,
        prefix: /^(sk-ant-|oauth-)/,
        exampleValue: "sk-ant-XXXX",
      }),
    );

    out.push(...(await configChecks()));
    out.push(...(await mcpChecks()));
    out.push(...(await skillsChecks(ctx.cwd)));
    out.push(...(await hooksChecks()));

    return out;
  },
};

function installChecks(probe: AgentProbe): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!probe.binaryPath) {
    out.push({
      id: `${AGENT_ID}/install/binary-missing`,
      severity: "warning",
      title: "claude binary not found",
      message: "Claude Code config detected but no `claude` binary on PATH or in well-known dirs.",
      agent: AGENT_ID,
      category: "install",
      evidence: [],
      confidence: "high",
      fixHint: { kind: "reinstall", instruction: "npm install -g @anthropic-ai/claude-code" },
    });
    return out;
  }
  if (probe.notes?.some((n) => n.includes("not on PATH"))) {
    out.push({
      id: `${AGENT_ID}/install/path-shadowed`,
      severity: "warning",
      title: "claude binary not on PATH",
      message: `Found binary at ${probe.binaryPath} but it is not on PATH. Subshells may not find it.`,
      agent: AGENT_ID,
      category: "install",
      evidence: [],
      confidence: "high",
      fixHint: {
        kind: "env-set",
        name: "PATH",
        example: `$PATH:${probe.binaryPath.replace(/\/[^/]+$/, "")}`,
      },
    });
  }
  return out;
}

async function configChecks(): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const settings = await parseJsonFile<Settings>(
    SETTINGS,
    AGENT_ID,
    `${AGENT_ID}/config/settings-invalid-json`,
  );
  out.push(...settings.diagnostics);

  const local = await parseJsonFile<Settings>(
    SETTINGS_LOCAL,
    AGENT_ID,
    `${AGENT_ID}/config/settings-local-invalid-json`,
  );
  out.push(...local.diagnostics);

  if (settings.exists && local.exists && local.data && settings.data) {
    const localKeys = Object.keys(local.data ?? {});
    if (localKeys.length > 0) {
      out.push({
        id: `${AGENT_ID}/config/settings-local-shadows-global`,
        severity: "info",
        title: "settings.local.json overrides settings.json",
        message: `Keys overridden locally: ${localKeys.join(", ")}.`,
        file: SETTINGS_LOCAL,
        agent: AGENT_ID,
        category: "config",
        evidence: [{ kind: "config", path: SETTINGS_LOCAL }],
        confidence: "high",
      });
    }
  }

  if (existsSync(CLAUDEMD)) {
    const size = statSync(CLAUDEMD).size;
    if (size > 24 * 1024) {
      out.push({
        id: `${AGENT_ID}/config/claudemd-too-large`,
        severity: "warning",
        title: "CLAUDE.md is large",
        message: `${CLAUDEMD} is ${size} bytes; the file is loaded into every session and burns context. Consider splitting via @-include.`,
        file: CLAUDEMD,
        agent: AGENT_ID,
        category: "config",
        evidence: [{ kind: "file", path: CLAUDEMD }],
        confidence: "medium",
        fixHint: { kind: "doc", url: "https://docs.anthropic.com/claude-code/memory" },
      });
    }
  }

  const data = settings.data ?? {};
  if (typeof data.model === "string") {
    if (/claude-3-(opus|sonnet|haiku)/.test(data.model)) {
      out.push({
        id: `${AGENT_ID}/config/model-deprecated`,
        severity: "warning",
        title: "configured model is deprecated",
        message: `\`${data.model}\` is from the Claude 3 family. Use claude-opus-4-7, claude-sonnet-4-6, or claude-haiku-4-5 instead.`,
        file: SETTINGS,
        agent: AGENT_ID,
        category: "config",
        evidence: [{ kind: "config", path: SETTINGS, key: "model", value: data.model }],
        confidence: "high",
        fixHint: {
          kind: "file-edit",
          path: SETTINGS,
          keyPath: "model",
          value: "claude-opus-4-7",
        },
      });
    }
  }

  if (data.permissions?.allow?.some((p) => /rm\s+-rf|DROP\s+TABLE|sudo/i.test(p))) {
    out.push({
      id: `${AGENT_ID}/permissions/destructive-allowed`,
      severity: "warning",
      title: "destructive command in allowlist",
      message: `permissions.allow includes a rule that matches an obviously destructive command.`,
      file: SETTINGS,
      agent: AGENT_ID,
      category: "permissions",
      evidence: [{ kind: "config", path: SETTINGS, key: "permissions.allow" }],
      confidence: "low",
      fixHint: { kind: "file-edit", path: SETTINGS, keyPath: "permissions.allow" },
    });
  }

  return out;
}

async function mcpChecks(): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const inSettings = await parseJsonFile<Settings>(
    SETTINGS,
    AGENT_ID,
    `${AGENT_ID}/config/settings-invalid-json`,
  );
  const standalone = await parseJsonFile<{ mcpServers?: Record<string, McpServerConfig> }>(
    MCP_FILE,
    AGENT_ID,
    `${AGENT_ID}/config/mcp-invalid-json`,
  );

  const settingsServers = inSettings.data?.mcpServers ?? {};
  const fileServers = standalone.data?.mcpServers ?? {};
  const merged = { ...fileServers, ...settingsServers };
  if (Object.keys(merged).length === 0) return out;

  const source = inSettings.exists && Object.keys(settingsServers).length > 0 ? SETTINGS : MCP_FILE;
  out.push(...validateMcpServers({ agent: AGENT_ID, configPath: source, servers: merged }));
  return out;
}

async function skillsChecks(cwd: string): Promise<Diagnostic[]> {
  if (!existsSync(SKILLS_DIR)) return [];
  const skills = await discoverSkills([SKILLS_DIR]);
  return auditSkills({ agent: AGENT_ID, cwd, skills });
}

async function hooksChecks(): Promise<Diagnostic[]> {
  if (!existsSync(HOOKS_DIR)) return [];
  const entries = await readdir(HOOKS_DIR, { withFileTypes: true }).catch(() => []);
  const scripts = entries
    .filter((e) => e.isFile())
    .map((e) => join(HOOKS_DIR, e.name))
    .filter((p) => /\.(sh|bash|zsh|py|js|mjs|ts)$/.test(p));
  return validateHookScripts({ agent: AGENT_ID, hookPaths: scripts });
}
