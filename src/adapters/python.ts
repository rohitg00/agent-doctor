import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChangedFile, PlannedCheck, RiskSummary } from "../types.js";

interface Ctx {
  cwd: string;
  changedFiles: ChangedFile[];
  risk: RiskSummary;
}

export function planPythonChecks(ctx: Ctx): PlannedCheck[] {
  if (!detectPython(ctx.cwd)) return [];
  const out: PlannedCheck[] = [];
  const touched = ctx.changedFiles.some((f) => f.path.endsWith(".py"));
  if (!touched) return [];

  const runner = pickRunner(ctx.cwd);

  if (hasTool(ctx.cwd, "ruff")) {
    out.push({
      id: "validation/python/lint",
      command: `${runner} ruff check`,
      required: false,
      reason: "ruff lint (advisory)",
    });
  }
  if (hasTool(ctx.cwd, "mypy")) {
    out.push({
      id: "validation/python/typecheck",
      command: `${runner} mypy .`,
      required: ctx.risk.level !== "low",
      reason: "mypy typecheck",
    });
  } else if (hasTool(ctx.cwd, "pyright")) {
    out.push({
      id: "validation/python/typecheck",
      command: `${runner} pyright`,
      required: ctx.risk.level !== "low",
      reason: "pyright typecheck",
    });
  }
  if (hasTool(ctx.cwd, "pytest")) {
    out.push({
      id: "validation/python/test",
      command: `${runner} pytest -q`,
      required: ["high", "critical"].includes(ctx.risk.level),
      reason: "pytest",
    });
  }
  return out;
}

function detectPython(cwd: string): boolean {
  return (
    existsSync(join(cwd, "pyproject.toml")) ||
    existsSync(join(cwd, "setup.py")) ||
    existsSync(join(cwd, "setup.cfg")) ||
    existsSync(join(cwd, "requirements.txt")) ||
    existsSync(join(cwd, "Pipfile"))
  );
}

function pickRunner(cwd: string): string {
  if (existsSync(join(cwd, "uv.lock"))) return "uv run";
  if (existsSync(join(cwd, "poetry.lock"))) return "poetry run";
  if (existsSync(join(cwd, "Pipfile.lock"))) return "pipenv run";
  return "python -m";
}

function hasTool(cwd: string, tool: string): boolean {
  const pyproject = join(cwd, "pyproject.toml");
  if (existsSync(pyproject)) {
    const raw = readFileSync(pyproject, "utf8");
    if (raw.includes(`"${tool}"`) || raw.includes(`'${tool}'`) || raw.toLowerCase().includes(`\n[tool.${tool}`)) {
      return true;
    }
  }
  const reqs = join(cwd, "requirements.txt");
  if (existsSync(reqs)) {
    const raw = readFileSync(reqs, "utf8").toLowerCase();
    if (raw.split("\n").some((line) => line.trim().split(/[=<>~!]/)[0]?.trim() === tool)) {
      return true;
    }
  }
  return false;
}
