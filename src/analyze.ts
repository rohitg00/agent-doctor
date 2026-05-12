import { collectChanged, detectBase } from "./diff.js";
import { detectProject } from "./detect.js";
import { classifyRisk, planChecks } from "./planner.js";
import { runChecks } from "./runner.js";
import { lockfileMismatchRule } from "./rules/lockfile.js";
import { noRelatedTestRule } from "./rules/related-test.js";
import { generatedFileEditRule } from "./rules/generated-file.js";
import { auditSkills, applicableSkillsForChanges } from "./rules/skills.js";
import { score as computeScore } from "./score.js";
import { loadConfig } from "./config.js";
import type { CliOptions, Diagnostic, Report } from "./types.js";

export async function analyze(opts: CliOptions): Promise<Report> {
  const config = await loadConfig(opts.cwd, opts.configPath);
  const profile = opts.profile;
  const detected = await detectProject(opts.cwd, config.skills?.paths);
  const base = opts.base ?? (await detectBase(opts.cwd, config.base));
  const changedFiles = await collectChanged(opts.cwd, opts.mode, base);

  const risk = classifyRisk({ changedFiles, config });
  const plannedChecks = planChecks({ detected, changedFiles, risk, config });

  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...lockfileMismatchRule({ changedFiles, detected }));
  diagnostics.push(...noRelatedTestRule({ changedFiles }));
  diagnostics.push(...generatedFileEditRule({ changedFiles, config }));
  diagnostics.push(...auditSkills({ skills: detected.skills, cwd: opts.cwd, config }));
  diagnostics.push(
    ...applicableSkillsForChanges({
      skills: detected.skills,
      changedPaths: changedFiles.map((f) => f.path),
      cwd: opts.cwd,
    }),
  );

  const checks = opts.run && !opts.planOnly
    ? await runChecks(plannedChecks, { cwd: opts.cwd })
    : [];

  for (const c of checks) {
    diagnostics.push(...c.diagnostics);
    if (c.required && c.status === "missing") {
      diagnostics.push({
        id: "validation/required-check-missing",
        severity: "warning",
        title: `Required check missing: ${c.id}`,
        message:
          c.command && c.command.startsWith("<")
            ? `No command configured. Tell agent-doctor how to run this check in agent-doctor.config.json -> commands.`
            : `No command resolved.`,
        evidence: [],
        confidence: "high",
      });
    }
  }

  const hasEvidenceForRisk = checks.some((c) => c.status === "passed" && c.required);
  const { score, label } = computeScore({
    diagnostics,
    checks,
    risk: risk.level,
    hasEvidenceForRisk,
  });

  const ok = diagnostics.every((d) => d.severity !== "error") &&
    checks.every((c) => c.status !== "failed" || !c.required);

  return {
    ok,
    score,
    label,
    profile,
    mode: opts.mode,
    detected,
    risk,
    changedFiles,
    plannedChecks,
    evidence: {
      diffFiles: changedFiles.length,
      commandRuns: checks.length,
      ciLogs: 0,
      agentEvents: 0,
      artifacts: 0,
    },
    checks,
    diagnostics,
  };
}
