import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { AgentId, Diagnostic } from "../../types.js";

export interface ValidateHooksArgs {
  agent: AgentId;
  hookPaths: string[];
}

export async function validateHookScripts(args: ValidateHooksArgs): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  for (const path of args.hookPaths) {
    if (!existsSync(path)) {
      out.push({
        id: `${args.agent}/hooks/script-missing`,
        severity: "error",
        title: `Hook script missing`,
        message: `Hook references ${path} but the file does not exist.`,
        file: path,
        agent: args.agent,
        category: "hooks",
        evidence: [{ kind: "file", path }],
        confidence: "high",
        fixHint: { kind: "doc", url: "https://docs.anthropic.com/claude-code/hooks" },
      });
      continue;
    }
    const st = statSync(path);
    if (!(st.mode & 0o111)) {
      out.push({
        id: `${args.agent}/hooks/script-not-executable`,
        severity: "warning",
        title: `Hook script not executable`,
        message: `${path} is missing executable permissions. The agent will reject the hook silently.`,
        file: path,
        agent: args.agent,
        category: "hooks",
        evidence: [{ kind: "file", path }],
        confidence: "high",
        fixHint: { kind: "command", run: `chmod +x ${path}` },
      });
    }
    const head = await readFile(path, "utf8").catch(() => "");
    if (head.length > 0 && !head.startsWith("#!") && /\.(sh|bash|zsh|py|js|mjs|ts)$/.test(path)) {
      out.push({
        id: `${args.agent}/hooks/shebang-missing`,
        severity: "warning",
        title: `Hook script missing shebang`,
        message: `${path} has no #! line. Some shells will refuse to execute it.`,
        file: path,
        agent: args.agent,
        category: "hooks",
        evidence: [{ kind: "file", path }],
        confidence: "medium",
        fixHint: {
          kind: "file-edit",
          path,
          insert: "#!/usr/bin/env bash\n",
        },
      });
    }
  }
  return out;
}
