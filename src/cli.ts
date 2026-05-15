#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diagnose } from "./doctor.js";
import { renderJson, renderText } from "./report.js";
import { renderSarif } from "./emit/sarif.js";
import { renderAnnotations } from "./emit/annotations.js";
import { renderJunit } from "./emit/junit.js";
import type { CliOptions, Report } from "./types.js";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
  ignore: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  const ignore: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    let key: string;
    let value: string | boolean;
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && wantsValue(key)) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }
    if (key === "ignore" && typeof value === "string") {
      ignore.push(value);
      continue;
    }
    flags.set(key, value);
  }
  return { positional, flags, ignore };
}

function wantsValue(key: string): boolean {
  return ["agent", "explain", "ignore", "sarif", "junit", "fail-on", "width"].includes(key);
}

function readVersion(): string {
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    for (const candidate of [resolve(here, "../package.json"), resolve(here, "../../package.json")]) {
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      }
    }
  } catch {}
  return "0.0.0";
}

function printHelp(): void {
  process.stdout.write(`agent-doctor — self-diagnostic for AI coding agents

Usage:
  agent-doctor [options]

Scope:
  --agent <id>           focus on one agent: claude-code | cursor | codex |
                         aider | windsurf | cline | goose | continue |
                         opencode | roo
  --list                 list detected agents and versions, no checks

Probes:
  --deep                 enable slow checks (binary --version, MCP pings)
  --no-network           hard-disable outbound sockets

Output:
  --json                 machine-readable JSON
  --sarif [path]         SARIF 2.1.0 (path or stdout)
  --junit [path]         JUnit XML (path or stdout)
  --annotations          GitHub Actions workflow commands on stderr
  --no-color             disable ANSI colors
  --no-unicode           ASCII glyphs only
  --width <cols>         override terminal width

Suppression:
  --ignore <id>          silence a diagnostic id (repeatable)
  --show-ignored         render suppressed diagnostics as info

Modes:
  --ci                   implies --no-color --no-unicode --json --fail-on warning
  --fail-on <level>      error (default) | warning | none
  --explain <id>         long-form explanation of one diagnostic id

  --help                 this help
  --version              print version

Examples:
  agent-doctor
  agent-doctor --agent claude-code
  agent-doctor --deep --json > report.json
  agent-doctor --ci || cat report.json
`);
}

const VALID_AGENTS = new Set([
  "claude-code", "cursor", "codex", "aider", "windsurf",
  "cline", "goose", "continue", "opencode", "roo",
]);

export async function main(argv: string[]): Promise<number> {
  const { flags, ignore } = parseArgs(argv);

  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return 0;
  }
  const version = readVersion();
  if (flags.has("version") || flags.has("v")) {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  const ci = flags.has("ci");
  const json = flags.has("json") || ci;
  const color = !flags.has("no-color") && !ci && (process.stdout.isTTY === true);
  const unicode = !flags.has("no-unicode") && !ci;

  const widthRaw = flags.get("width");
  const width = typeof widthRaw === "string"
    ? Number.parseInt(widthRaw, 10) || 100
    : process.stdout.columns ?? 100;

  const failOnRaw = ci ? "warning" : ((flags.get("fail-on") as string | undefined) ?? "error");
  if (!["error", "warning", "none"].includes(failOnRaw)) {
    process.stderr.write(`unknown --fail-on: ${failOnRaw}\n`);
    return 2;
  }

  const agentRaw = flags.get("agent");
  if (typeof agentRaw === "string" && !VALID_AGENTS.has(agentRaw)) {
    process.stderr.write(`unknown --agent: ${agentRaw}\nvalid: ${[...VALID_AGENTS].join(", ")}\n`);
    return 2;
  }

  const opts: CliOptions = {
    cwd: process.cwd(),
    agent: typeof agentRaw === "string" ? agentRaw : undefined,
    list: flags.has("list"),
    deep: flags.has("deep"),
    noNetwork: flags.has("no-network"),
    ci,
    json,
    sarif: flags.has("sarif") ? (typeof flags.get("sarif") === "string" ? (flags.get("sarif") as string) : true) : undefined,
    junit: flags.has("junit") ? (typeof flags.get("junit") === "string" ? (flags.get("junit") as string) : true) : undefined,
    annotations: flags.has("annotations"),
    failOn: failOnRaw as CliOptions["failOn"],
    ignore,
    showIgnored: flags.has("show-ignored"),
    explain: typeof flags.get("explain") === "string" ? (flags.get("explain") as string) : undefined,
    width,
    color,
    unicode,
  };

  if (opts.explain) {
    process.stdout.write(`agent-doctor: --explain is not yet implemented. See docs/CHECKS.md for ${opts.explain}.\n`);
    return 0;
  }

  const report = await diagnose(opts);

  await emit(report, opts, version);

  return exitCode(report, opts);
}

async function emit(report: Report, opts: CliOptions, version: string): Promise<void> {
  if (opts.json) {
    process.stdout.write(`${renderJson(report)}\n`);
  } else {
    process.stdout.write(
      `${renderText(report, {
        color: opts.color,
        unicode: opts.unicode,
        width: opts.width ?? 100,
        version,
        agentFocus: opts.agent,
      })}\n`,
    );
  }
  if (opts.sarif !== undefined) {
    const out = renderSarif(report as never, version);
    if (typeof opts.sarif === "string") await writeFile(opts.sarif, out, "utf8");
    else process.stdout.write(`${out}\n`);
  }
  if (opts.junit !== undefined) {
    const out = renderJunit(report as never);
    if (typeof opts.junit === "string") await writeFile(opts.junit, out, "utf8");
    else process.stdout.write(`${out}\n`);
  }
  if (opts.annotations) {
    process.stderr.write(renderAnnotations(report as never));
  }
}

function exitCode(report: Report, opts: CliOptions): number {
  if (opts.failOn === "none") return 0;
  const hasError = report.diagnostics.some((d) => d.severity === "error");
  if (hasError) return report.diagnostics.some((d) => d.fatal === true) ? 2 : 1;
  if (opts.failOn === "warning" && report.diagnostics.some((d) => d.severity === "warning")) return 1;
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    process.stderr.write(`agent-doctor: ${msg}\n`);
    process.exit(2);
  },
);
