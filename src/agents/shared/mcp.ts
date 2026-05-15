import type { AgentId, Diagnostic } from "../../types.js";
import { findBinary } from "./probe.js";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type?: string;
}

export interface ValidateMcpArgs {
  agent: AgentId;
  configPath: string;
  servers: Record<string, McpServerConfig>;
  deep?: boolean;
}

export function validateMcpServers(args: ValidateMcpArgs): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const [name, server] of Object.entries(args.servers)) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) {
      out.push({
        id: `${args.agent}/mcp/duplicate-server-name`,
        severity: "warning",
        title: `Duplicate MCP server "${name}"`,
        message: `Server name "${name}" appears more than once (case-insensitive). Later entries override earlier ones.`,
        file: args.configPath,
        agent: args.agent,
        category: "mcp",
        evidence: [{ kind: "config", path: args.configPath, key: name }],
        confidence: "high",
        fixHint: { kind: "file-edit", path: args.configPath, keyPath: `mcpServers.${name}` },
      });
    }
    seen.add(lower);

    if (server.command) {
      const probe = findBinary(server.command);
      if (!probe.found) {
        out.push({
          id: `${args.agent}/mcp/server-binary-missing`,
          severity: "error",
          title: `MCP server "${name}" command not found`,
          message: `"${server.command}" is not on PATH or in any well-known install dir. The server will not start.`,
          file: args.configPath,
          agent: args.agent,
          category: "mcp",
          evidence: [{ kind: "config", path: args.configPath, key: name }],
          confidence: "high",
          fixHint: { kind: "reinstall", instruction: `install ${server.command} or fix the path in ${args.configPath}` },
        });
      } else if (!probe.onPath && probe.path) {
        out.push({
          id: `${args.agent}/mcp/server-binary-not-on-path`,
          severity: "warning",
          title: `MCP server "${name}" binary not on PATH`,
          message: `Found "${server.command}" at ${probe.path} but it is not on PATH inside the agent's process. The server may fail to launch.`,
          file: args.configPath,
          agent: args.agent,
          category: "mcp",
          evidence: [{ kind: "config", path: args.configPath, key: name }],
          confidence: "medium",
          fixHint: { kind: "file-edit", path: args.configPath, keyPath: `mcpServers.${name}.command`, value: probe.path },
        });
      }
    }
  }
  return out;
}
