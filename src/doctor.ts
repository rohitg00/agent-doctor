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

const DEFAULT_ADAPTER_TIMEOUT_MS = 1500;
const DEEP_ADAPTER_TIMEOUT_MS = 8000;
const MAX_DIAGNOSTICS_PER_ID = 25;

export interface DiagnoseOptions extends CliOptions {
  adapters?: AgentAdapter[];
  onAdapter?: (summary: { id: string; status: string; durationMs: number }) => void;
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
  const timeoutMs = opts.deep ? DEEP_ADAPTER_TIMEOUT_MS : DEFAULT_ADAPTER_TIMEOUT_MS;

  const runs = await Promise.all(
    adapters.map(async (a) => {
      const t0 = Date.now();
      const r = await runAdapter(a, ctx, timeoutMs);
      if (opts.onAdapter) {
        opts.onAdapter({
          id: a.id,
          status: r.present ? (r.diagnostics.length > 0 ? "diagnostics" : "healthy") : r.timedOut ? "timed out" : "not installed",
          durationMs: Date.now() - t0,
        });
      }
      return r;
    }),
  );

  const allDiagnostics: Diagnostic[] = runs.flatMap((r) => capPerId(r.diagnostics));
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

async function runAdapter(
  adapter: AgentAdapter,
  ctx: ValidateContext,
  timeoutMs: number,
): Promise<AdapterRun> {
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
    setTimeout(() => resolve({ timedOut: true }), timeoutMs),
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
          message: `Adapter did not complete within ${timeoutMs}ms. Re-run with --deep or open an issue if this persists.`,
          agent: adapter.id,
          category: "config",
          evidence: [],
          confidence: "high",
        },
      ],
      present: true,
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

function capPerId(diagnostics: Diagnostic[]): Diagnostic[] {
  const counts = new Map<string, number>();
  const kept: Diagnostic[] = [];
  const overflow = new Map<string, number>();
  for (const d of diagnostics) {
    const c = counts.get(d.id) ?? 0;
    if (c < MAX_DIAGNOSTICS_PER_ID) {
      kept.push(d);
      counts.set(d.id, c + 1);
    } else {
      overflow.set(d.id, (overflow.get(d.id) ?? 0) + 1);
    }
  }
  for (const [id, n] of overflow) {
    const sample = diagnostics.find((d) => d.id === id);
    if (!sample) continue;
    kept.push({
      id: `${id}-truncated`,
      severity: "info",
      title: `+${n} more ${id} suppressed`,
      message: `Showing first ${MAX_DIAGNOSTICS_PER_ID} of ${MAX_DIAGNOSTICS_PER_ID + n}. Pipe --json to see all.`,
      agent: sample.agent,
      category: sample.category,
      evidence: [],
      confidence: "high",
    });
  }
  return kept;
}

function computeOk(summaries: AgentSummary[], kept: Diagnostic[]): boolean {
  if (kept.some((d) => d.severity === "error")) return false;
  if (summaries.some((s) => s.status === "errors")) return false;
  return true;
}

export type { AgentId };
