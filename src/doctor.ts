import { homedir } from "node:os";
import { BUILTIN_ADAPTERS } from "./discovery.js";
import { loadSuppressor } from "./suppress.js";
import type { AgentAdapter, ValidateContext } from "./plugin-api.js";
import type {
  AgentId,
  AgentSummary,
  CliOptions,
  Diagnostic,
  Report,
  Tally,
} from "./types.js";

const PER_ADAPTER_TIMEOUT_MS = 1500;

export interface DiagnoseOptions extends CliOptions {
  adapters?: AgentAdapter[];
}

export async function diagnose(opts: DiagnoseOptions): Promise<Report> {
  const start = Date.now();
  const adapters = pickAdapters(opts);
  const ctx: ValidateContext = {
    cwd: opts.cwd,
    deep: opts.deep,
    network: opts.deep && !opts.noNetwork,
    home: homedir(),
  };

  const runs = await Promise.all(adapters.map((a) => runAdapter(a, ctx)));

  const allDiagnostics: Diagnostic[] = runs.flatMap((r) => r.diagnostics);
  const suppressor = loadSuppressor({ cwd: opts.cwd, extraIds: opts.ignore });
  const { kept, suppressed } = suppressor.apply(allDiagnostics);

  const summaries: AgentSummary[] = runs.map((r) => summarize(r));
  const tally = computeTally(summaries, kept, suppressed.length);
  const ok = computeOk(summaries, kept);

  return {
    ok,
    tally,
    agents: summaries,
    diagnostics: opts.showIgnored ? [...kept, ...suppressed] : kept,
    durationMs: Date.now() - start,
    deep: opts.deep,
    network: ctx.network,
  };
}

function pickAdapters(opts: DiagnoseOptions): AgentAdapter[] {
  const all = [...BUILTIN_ADAPTERS, ...(opts.adapters ?? [])];
  if (opts.agent) return all.filter((a) => a.id === opts.agent);
  return all;
}

interface AdapterRun {
  adapter: AgentAdapter;
  diagnostics: Diagnostic[];
  present: boolean;
  version?: string;
  timedOut: boolean;
}

async function runAdapter(adapter: AgentAdapter, ctx: ValidateContext): Promise<AdapterRun> {
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), PER_ADAPTER_TIMEOUT_MS),
  );
  const work = (async () => {
    const probe = await adapter.probe(ctx.cwd);
    if (!probe.present) {
      return { probe, diagnostics: [] as Diagnostic[] };
    }
    const diagnostics = await adapter.validate(probe, ctx);
    return { probe, diagnostics };
  })().catch((err) => ({
    probe: undefined,
    diagnostics: [
      {
        id: `${adapter.id}/internal/adapter-error`,
        severity: "warning" as const,
        title: `${adapter.id} adapter threw`,
        message: err instanceof Error ? err.message : String(err),
        agent: adapter.id,
        category: "config" as const,
        evidence: [],
        confidence: "high" as const,
      },
    ],
  }));

  const result = await Promise.race([work, timeoutPromise]);
  if ("timedOut" in result) {
    return {
      adapter,
      diagnostics: [
        {
          id: `${adapter.id}/internal/adapter-timeout`,
          severity: "warning",
          title: `${adapter.id} adapter timed out`,
          message: `Adapter did not complete within ${PER_ADAPTER_TIMEOUT_MS}ms.`,
          agent: adapter.id,
          category: "config",
          evidence: [],
          confidence: "high",
        },
      ],
      present: false,
      timedOut: true,
    };
  }

  return {
    adapter,
    diagnostics: result.diagnostics,
    present: result.probe?.present ?? false,
    version: result.probe?.version,
    timedOut: false,
  };
}

function summarize(run: AdapterRun): AgentSummary {
  if (!run.present) {
    return {
      id: run.adapter.id,
      present: false,
      status: "absent",
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
    };
  }
  const errors = run.diagnostics.filter((d) => d.severity === "error").length;
  const warnings = run.diagnostics.filter((d) => d.severity === "warning").length;
  const infos = run.diagnostics.filter((d) => d.severity === "info").length;
  const status =
    errors > 0
      ? "errors"
      : warnings > 0
        ? "warnings"
        : "healthy";
  const headline = errors > 0
    ? firstHeadline(run.diagnostics, "error")
    : warnings > 0
      ? firstHeadline(run.diagnostics, "warning")
      : undefined;
  return {
    id: run.adapter.id,
    present: true,
    version: run.version,
    status,
    errorCount: errors,
    warningCount: warnings,
    infoCount: infos,
    headline,
  };
}

function firstHeadline(diagnostics: Diagnostic[], severity: "error" | "warning"): string | undefined {
  const first = diagnostics.find((d) => d.severity === severity);
  return first?.title;
}

function computeTally(summaries: AgentSummary[], kept: Diagnostic[], suppressed: number): Tally {
  return {
    agentsDetected: summaries.filter((s) => s.present).length,
    agentsHealthy: summaries.filter((s) => s.status === "healthy").length,
    agentsWithWarnings: summaries.filter((s) => s.status === "warnings").length,
    agentsWithErrors: summaries.filter((s) => s.status === "errors").length,
    errors: kept.filter((d) => d.severity === "error").length,
    warnings: kept.filter((d) => d.severity === "warning").length,
    infos: kept.filter((d) => d.severity === "info").length,
    suppressed,
  };
}

function computeOk(summaries: AgentSummary[], kept: Diagnostic[]): boolean {
  if (kept.some((d) => d.severity === "error")) return false;
  if (summaries.some((s) => s.status === "errors")) return false;
  return true;
}

export type { AgentId };
