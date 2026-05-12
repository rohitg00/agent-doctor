#!/usr/bin/env node
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze } from "./analyze.js";
import { renderJson, renderText } from "./report.js";
import type { CliOptions, Mode, Profile } from "./types.js";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { positional, flags };
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
  } catch {
    // ignore
  }
  return "0.0.0";
}

function printHelp(): void {
  process.stdout.write(`agent-doctor — diff-aware quality gate for AI-assisted code

Usage:
  agent-doctor [directory] [options]

Options:
  --diff [base]              scan files changed against a base ref
  --staged                   scan staged + unstaged + untracked
  --full                     scan the whole repo
  --profile <name>           local | ci | release | skill-library
  --run                      run discovered validations
  --plan-only                print the validation plan without running
  --json                     emit machine-readable JSON report
  --fail-on <level>          error | warning | none  (default: error)
  --config <path>            explicit config file path
  --evidence <path>          attach transcript/log/artifact (repeatable)
  --no-color                 disable ANSI colors
  --help                     show this help
  --version                  print version

Examples:
  agent-doctor --diff main --plan-only
  agent-doctor --diff main --run --fail-on error
  agent-doctor . --profile ci --json > report.json
`);
}

function isProfile(s: string): s is Profile {
  return s === "local" || s === "ci" || s === "release" || s === "skill-library";
}

function isMode(s: string): s is Mode {
  return s === "diff" || s === "staged" || s === "full";
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);

  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return 0;
  }
  if (flags.has("version") || flags.has("v")) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  const cwd = resolve(positional[0] ?? ".");

  let mode: Mode = "diff";
  let base: string | undefined;
  if (flags.has("diff")) {
    mode = "diff";
    const v = flags.get("diff");
    if (typeof v === "string") base = v;
  } else if (flags.has("staged")) {
    mode = "staged";
  } else if (flags.has("full")) {
    mode = "full";
  }

  const profileRaw = (flags.get("profile") as string | undefined) ?? "local";
  if (!isProfile(profileRaw)) {
    process.stderr.write(`unknown profile: ${profileRaw}\n`);
    return 2;
  }

  const failOnRaw = (flags.get("fail-on") as string | undefined) ?? "error";
  if (!["error", "warning", "none"].includes(failOnRaw)) {
    process.stderr.write(`unknown --fail-on: ${failOnRaw}\n`);
    return 2;
  }

  const opts: CliOptions = {
    cwd,
    mode,
    base,
    profile: profileRaw,
    run: flags.has("run"),
    planOnly: flags.has("plan-only"),
    json: flags.has("json"),
    annotations: flags.has("annotations"),
    failOn: failOnRaw as CliOptions["failOn"],
    evidencePaths: collectEvidence(flags),
    configPath: typeof flags.get("config") === "string" ? (flags.get("config") as string) : undefined,
  };

  void isMode; // imported for future mode normalization

  const report = await analyze(opts);

  if (opts.json) {
    process.stdout.write(`${renderJson(report)}\n`);
  } else {
    process.stdout.write(`${renderText(report, !flags.has("no-color"))}\n`);
  }

  return exitCode(report, opts.failOn);
}

function collectEvidence(flags: Map<string, string | boolean>): string[] {
  const v = flags.get("evidence");
  if (typeof v === "string") return [v];
  return [];
}

function exitCode(report: Awaited<ReturnType<typeof analyze>>, failOn: CliOptions["failOn"]): number {
  if (failOn === "none") return 0;
  const hasError =
    report.diagnostics.some((d) => d.severity === "error") ||
    report.checks.some((c) => c.required && c.status === "failed");
  if (hasError) return 1;
  if (failOn === "warning") {
    const hasWarn = report.diagnostics.some((d) => d.severity === "warning");
    if (hasWarn) return 1;
  }
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
