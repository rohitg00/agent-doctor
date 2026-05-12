import { spawn } from "node:child_process";
import type { PlannedCheck, CheckResult, Evidence } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const OUTPUT_LIMIT = 8 * 1024;

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
}

export async function runChecks(checks: PlannedCheck[], opts: RunOptions): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const c of checks) {
    if (c.command.startsWith("<")) {
      results.push({ id: c.id, command: c.command, status: "missing", required: c.required, diagnostics: [] });
      continue;
    }
    const start = Date.now();
    const exec = await runOne(c.command, { ...opts, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    const durationMs = Date.now() - start;
    const evidence: Evidence = {
      kind: "command",
      command: c.command,
      exitCode: exec.exitCode,
      durationMs,
      outputExcerpt: exec.output,
    };
    results.push({
      id: c.id,
      command: c.command,
      status: exec.exitCode === 0 ? "passed" : "failed",
      required: c.required,
      durationMs,
      diagnostics: exec.exitCode === 0
        ? []
        : [
            {
              id: "validation/required-check-failed",
              severity: c.required ? "error" : "warning",
              title: `${c.id} failed`,
              message: `Exit code ${exec.exitCode}. Excerpt:\n${exec.output.slice(0, 600)}`,
              evidence: [evidence],
              confidence: "high",
              nextActions: [{ label: "re-run locally", command: c.command }],
            },
          ],
    });
  }
  return results;
}

interface ExecResult {
  exitCode: number;
  output: string;
}

function runOne(command: string, opts: RunOptions): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: opts.cwd,
      shell: true,
      env: { ...process.env, CI: process.env["CI"] ?? "1", FORCE_COLOR: "0" },
    });
    let output = "";
    let truncated = false;
    const append = (chunk: Buffer): void => {
      if (output.length >= OUTPUT_LIMIT) {
        truncated = true;
        return;
      }
      output += chunk.toString("utf8");
      if (output.length > OUTPUT_LIMIT) {
        output = output.slice(0, OUTPUT_LIMIT);
        truncated = true;
      }
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? -1,
        output: truncated ? `${output}\n... (truncated)` : output,
      });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ exitCode: 127, output: `failed to spawn: ${command}` });
    });
  });
}
