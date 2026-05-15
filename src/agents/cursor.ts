import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseJsonFile } from "./shared/config-parse.js";
import { validateMcpServers, type McpServerConfig } from "./shared/mcp.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "cursor" as const;
const CURSOR_HOME = homePath(".cursor");
const MCP_FILE = join(CURSOR_HOME, "mcp.json");

export const cursorAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(cwd: string): Promise<AgentProbe> {
    const bin = findBinary("cursor");
    const cursorrules = resolve(cwd, ".cursorrules");
    const rulesDir = resolve(cwd, ".cursor", "rules");
    const configPaths: string[] = [];
    if (existsSync(MCP_FILE)) configPaths.push(MCP_FILE);
    if (existsSync(cursorrules)) configPaths.push(cursorrules);
    if (existsSync(rulesDir)) configPaths.push(rulesDir);

    const present = bin.found || existsSync(CURSOR_HOME) || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };

    return {
      id: AGENT_ID,
      present: true,
      binary: "cursor",
      binaryPath: bin.path,
      configPaths,
      source: bin.found ? "binary" : "config-only",
    };
  },

  async validate(probe: AgentProbe, ctx: ValidateContext): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];

    if (ctx.deep && probe.binaryPath) {
      probe.version = await binaryVersion(probe.binaryPath, "--version", 750);
    }

    out.push(...(await mcpChecks()));
    out.push(...(await rulesChecks(ctx.cwd)));

    return out;
  },
};

async function mcpChecks(): Promise<Diagnostic[]> {
  const parsed = await parseJsonFile<{ mcpServers?: Record<string, McpServerConfig> }>(
    MCP_FILE,
    AGENT_ID,
    `${AGENT_ID}/config/mcp-invalid-json`,
  );
  const out = [...parsed.diagnostics];
  const servers = parsed.data?.mcpServers;
  if (servers && Object.keys(servers).length > 0) {
    out.push(...validateMcpServers({ agent: AGENT_ID, configPath: MCP_FILE, servers }));
  }
  return out;
}

async function rulesChecks(cwd: string): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  const cursorrules = resolve(cwd, ".cursorrules");
  const rulesDir = resolve(cwd, ".cursor", "rules");
  const hasFlat = existsSync(cursorrules);
  const hasMdc = existsSync(rulesDir);

  if (hasFlat && hasMdc) {
    out.push({
      id: `${AGENT_ID}/config/cursorrules-conflict-with-mdc`,
      severity: "warning",
      title: ".cursorrules and .cursor/rules/*.mdc both exist",
      message: "Cursor reads both, in opaque precedence. Migrate to .mdc files only.",
      file: cursorrules,
      agent: AGENT_ID,
      category: "config",
      evidence: [{ kind: "file", path: cursorrules }, { kind: "file", path: rulesDir }],
      confidence: "high",
      fixHint: { kind: "doc", url: "https://docs.cursor.com/context/rules" },
    });
  }

  if (hasMdc) {
    const entries = await readdir(rulesDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".mdc")) continue;
      const path = join(rulesDir, e.name);
      const raw = (await readFile(path, "utf8").catch(() => "")).replace(/\r\n/g, "\n");
      if (!raw.startsWith("---")) {
        out.push({
          id: `${AGENT_ID}/config/mdc-frontmatter-missing`,
          severity: "warning",
          title: ".mdc file is missing frontmatter",
          message: `${path} does not start with --- block. Cursor cannot route the rule.`,
          file: path,
          agent: AGENT_ID,
          category: "rules",
          evidence: [{ kind: "file", path }],
          confidence: "high",
          fixHint: { kind: "file-edit", path, insert: "---\ndescription: \nglobs: \nalwaysApply: false\n---\n" },
        });
        continue;
      }
      const fmEnd = raw.indexOf("\n---", 3);
      if (fmEnd === -1) {
        out.push({
          id: `${AGENT_ID}/config/mdc-frontmatter-invalid`,
          severity: "warning",
          title: ".mdc frontmatter not closed",
          message: `${path} opens with --- but does not close. Cursor will treat the whole file as YAML.`,
          file: path,
          agent: AGENT_ID,
          category: "rules",
          evidence: [{ kind: "file", path }],
          confidence: "high",
          fixHint: { kind: "file-edit", path },
        });
      }
      const size = statSync(path).size;
      if (size > 32 * 1024) {
        out.push({
          id: `${AGENT_ID}/rules/file-too-large`,
          severity: "warning",
          title: ".mdc rule file is large",
          message: `${path} is ${size} bytes. Cursor truncates large rules; split into focused rules per concern.`,
          file: path,
          agent: AGENT_ID,
          category: "rules",
          evidence: [{ kind: "file", path }],
          confidence: "medium",
        });
      }
    }
  }
  return out;
}
