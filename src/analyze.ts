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
import { loadPlugins } from "./plugins/loader.js";
import { planPythonChecks } from "./adapters/python.js";
import { planGoChecks } from "./adapters/go.js";
import { planRustChecks } from "./adapters/rust.js";
import { planSecurityChecks } from "./integrations/security.js";
import { ingestEvidence } from "./evidence/transcript.js";
import { aiReview } from "./ai/review.js";
import type { AgentDoctorPlugin } from "./plugin-api.js";
import type { CliOptions, Diagnostic, PlannedCheck, Report } from "./types.js";

export async function analyze(opts: CliOptions): Promise<Report> {
  const config = await loadConfig(opts.cwd, opts.configPath);
  const profile = opts.profile;
  const detected = await detectProject(opts.cwd, config.skills?.paths);
  const base = opts.base ?? (await detectBase(opts.cwd, config.base));
  const changedFiles = await collectChanged(opts.cwd, opts.mode, base);

  const risk = classifyRisk({ changedFiles, config });

  const plugins = await loadPlugins(opts.cwd, config.plugins);

  const plannedChecks: PlannedCheck[] = [
    ...planChecks({ detected, changedFiles, risk, config }),
    ...planPythonChecks({ cwd: opts.cwd, changedFiles, risk }),
    ...planGoChecks({ cwd: opts.cwd, changedFiles, risk }),
    ...planRustChecks({ cwd: opts.cwd, changedFiles, risk }),
    ...(await planSecurityChecks({ cwd: opts.cwd, changedFiles, risk, config })),
    ...(await planFromPlugins(plugins, { cwd: opts.cwd, config, detected, changedFiles, risk })),
  ];

  const events = await ingestEvidence(opts.evidencePaths, opts.cwd);

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
      events,
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
        message: c.command?.startsWith("<")
          ? "No command configured. Tell agent-doctor how to run this check in agent-doctor.config.json -> commands."
          : "No command resolved.",
        evidence: [],
        confidence: "high",
      });
    }
  }

  for (const plugin of plugins) {
    for (const rule of plugin.rules ?? []) {
      try {
        const out = await rule.run({ cwd: opts.cwd, config, detected, changedFiles, risk, checks });
        diagnostics.push(...out);
      } catch (err) {
        diagnostics.push({
          id: "plugin/rule-error",
          severity: "warning",
          title: `Plugin rule ${rule.id} threw`,
          message: err instanceof Error ? err.message : String(err),
          evidence: [],
          confidence: "high",
        });
      }
    }
  }

  if (opts.aiReview && !opts.noNetwork) {
    diagnostics.push(...(await aiReview({ cwd: opts.cwd, changedFiles, diagnostics, config })));
  }

  const hasEvidenceForRisk = checks.some((c) => c.status === "passed" && c.required);
  const { score, label } = computeScore({
    diagnostics,
    checks,
    risk: risk.level,
    hasEvidenceForRisk,
  });

  const ok = diagnostics.every((d) => d.severity !== "error") &&
    checks.every((c) => !c.required || (c.status === "passed" || c.status === "skipped"));

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
      agentEvents: events.length,
      artifacts: 0,
    },
    checks,
    diagnostics,
  };
}

async function planFromPlugins(
  plugins: AgentDoctorPlugin[],
  ctx: Parameters<NonNullable<AgentDoctorPlugin["plan"]>>[0],
): Promise<PlannedCheck[]> {
  const out: PlannedCheck[] = [];
  for (const plugin of plugins) {
    if (!plugin.plan) continue;
    try {
      const planned = await plugin.plan(ctx);
      out.push(...planned);
    } catch (err) {
      process.stderr.write(
        `agent-doctor: plugin ${plugin.name} plan() threw: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  return out;
}
