#!/usr/bin/env node
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { analyze } from "./analyze.js";
import { renderJson, renderText } from "./report.js";
import { renderSarif } from "./emit/sarif.js";
import { renderAnnotations } from "./emit/annotations.js";
import { renderPrComment } from "./emit/pr-comment.js";
import { renderJunit } from "./emit/junit.js";
import type { CliOptions, Mode, Profile, Report } from "./types.js";

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
  evidence: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  const evidence: string[] = [];
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
    if (key === "evidence" && typeof value === "string") {
      evidence.push(value);
      continue;
    }
    flags.set(key, value);
  }
  return { positional, flags, evidence };
}

function wantsValue(key: string): boolean {
  return [
    "diff",
    "profile",
    "fail-on",
    "config",
    "evidence",
    "sarif",
    "pr-comment",
    "junit",
    "out",
    "width",
  ].includes(key);
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
  process.stdout.write(`agent-doctor — diff-aware quality gate for AI-assisted code

Usage:
  agent-doctor [directory] [options]

Scope:
  --diff [base]              scan files changed against a base ref
  --staged                   scan staged + unstaged + untracked
  --full                     scan the whole repo

Execution:
  --profile <name>           local | ci | release | skill-library
  --run                      run discovered validations
  --plan-only                print the validation plan without running
  --ai-review                enable opt-in LLM review (needs ANTHROPIC_API_KEY)
  --no-network               disable any outbound network call
  --fail-on <level>          error | warning | none  (default: error)
  --config <path>            explicit config file path
  --evidence <path>          attach transcript/log/artifact (repeatable)

Output:
  --json                     emit machine-readable JSON report
  --sarif [path]             emit SARIF 2.1.0 (path or stdout)
  --annotations              emit GitHub Actions workflow commands on stderr
  --pr-comment [path]        emit a sticky PR comment markdown body
  --junit [path]             emit JUnit-style XML
  --no-color                 disable ANSI colors
  --no-unicode               use ASCII glyphs only
  --width <cols>             override terminal width

  --help                     show this help
  --version                  print version

Examples:
  agent-doctor --diff main --plan-only
  agent-doctor --diff main --run --fail-on error
  agent-doctor . --profile ci --sarif report.sarif --annotations
`);
}

function isProfile(s: string): s is Profile {
  return s === "local" || s === "ci" || s === "release" || s === "skill-library";
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags, evidence } = parseArgs(argv);

  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return 0;
  }
  const version = readVersion();
  if (flags.has("version") || flags.has("v")) {
    process.stdout.write(`${version}\n`);
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

  const configFlag = flags.get("config");
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
    evidencePaths: evidence,
    configPath: typeof configFlag === "string" ? configFlag : undefined,
    aiReview: flags.has("ai-review"),
    noNetwork: flags.has("no-network"),
  };

  const report = await analyze(opts);

  await emit(report, flags, version);

  return exitCode(report, opts.failOn);
}

async function emit(report: Report, flags: Map<string, string | boolean>, version: string): Promise<void> {
  if (flags.has("json")) {
    process.stdout.write(`${renderJson(report)}\n`);
  } else {
    const color = !flags.has("no-color") && process.stdout.isTTY === true;
    const unicode = !flags.has("no-unicode");
    const widthRaw = flags.get("width");
    const width = typeof widthRaw === "string" ? Number.parseInt(widthRaw, 10) || 100 : process.stdout.columns ?? 100;
    process.stdout.write(`${renderText(report, { color, unicode, width, version })}\n`);
  }

  if (flags.has("sarif")) {
    const out = renderSarif(report, version);
    await writeOrEcho(flags.get("sarif"), out);
  }
  if (flags.has("annotations")) {
    process.stderr.write(renderAnnotations(report));
  }
  if (flags.has("pr-comment")) {
    const out = renderPrComment(report, version);
    await writeOrEcho(flags.get("pr-comment"), out);
  }
  if (flags.has("junit")) {
    const out = renderJunit(report);
    await writeOrEcho(flags.get("junit"), out);
  }
}

async function writeOrEcho(target: string | boolean | undefined, content: string): Promise<void> {
  if (typeof target === "string") {
    await writeFile(target, content, "utf8");
    return;
  }
  process.stdout.write(`${content}\n`);
}

function exitCode(report: Report, failOn: CliOptions["failOn"]): number {
  if (failOn === "none") return 0;
  const hasError =
    report.diagnostics.some((d) => d.severity === "error") ||
    report.checks.some((c) => c.required && c.status === "failed");
  if (hasError) return 1;
  if (failOn === "warning") {
    if (report.diagnostics.some((d) => d.severity === "warning")) return 1;
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
