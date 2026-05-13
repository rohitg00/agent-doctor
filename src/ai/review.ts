import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangedFile, Diagnostic } from "../types.js";
import type { UserConfig } from "../config.js";

interface Ctx {
  cwd: string;
  changedFiles: ChangedFile[];
  diagnostics: Diagnostic[];
  config: UserConfig;
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_FILES = 6;
const DEFAULT_MAX_BYTES = 24_000;

export async function aiReview(ctx: Ctx): Promise<Diagnostic[]> {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    return [
      {
        id: "ai/review-skipped",
        severity: "info",
        title: "AI review skipped",
        message: "--ai-review was requested but ANTHROPIC_API_KEY is not set.",
        evidence: [],
        confidence: "high",
      },
    ];
  }

  const model = ctx.config.ai?.model ?? DEFAULT_MODEL;
  const maxFiles = ctx.config.ai?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = ctx.config.ai?.maxBytesPerFile ?? DEFAULT_MAX_BYTES;

  const slice = ctx.changedFiles
    .filter((f) => f.status !== "deleted")
    .slice(0, maxFiles);
  const corpus: Array<{ path: string; content: string }> = [];
  for (const f of slice) {
    try {
      const raw = await readFile(join(ctx.cwd, f.path), "utf8");
      corpus.push({ path: f.path, content: raw.slice(0, maxBytes) });
    } catch {}
  }

  const prompt = buildPrompt(corpus, ctx.diagnostics);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system:
          "You are a senior reviewer. Produce up to 5 advisory observations about the diff. Output one JSON object per line. Schema: {\"id\":\"ai/review-<slug>\",\"severity\":\"info|warning\",\"title\":\"...\",\"message\":\"...\",\"file\":\"<path or null>\",\"line\":<number or null>}. No prose.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return [
        {
          id: "ai/review-error",
          severity: "info",
          title: "AI review request failed",
          message: `${res.status} ${res.statusText}`,
          evidence: [],
          confidence: "high",
        },
      ];
    }
    const payload = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = payload.content?.map((b) => b.text ?? "").join("\n") ?? "";
    return parseDiagnostics(text);
  } catch (err) {
    return [
      {
        id: "ai/review-error",
        severity: "info",
        title: "AI review threw",
        message: err instanceof Error ? err.message : String(err),
        evidence: [],
        confidence: "high",
      },
    ];
  }
}

function buildPrompt(corpus: Array<{ path: string; content: string }>, diagnostics: Diagnostic[]): string {
  const diagSummary = diagnostics
    .slice(0, 10)
    .map((d) => `- [${d.severity}] ${d.id}: ${d.title}`)
    .join("\n");
  const files = corpus
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
  return `Existing diagnostics:\n${diagSummary || "(none)"}\n\nChanged files:\n${files}`;
}

function parseDiagnostics(text: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const id = typeof obj["id"] === "string" ? obj["id"] : "ai/review";
      const sev = obj["severity"];
      const severity = sev === "warning" ? "warning" : "info";
      const title = typeof obj["title"] === "string" ? obj["title"] : "AI review note";
      const message = typeof obj["message"] === "string" ? obj["message"] : title;
      const file = typeof obj["file"] === "string" ? obj["file"] : undefined;
      const lineNum = typeof obj["line"] === "number" ? obj["line"] : undefined;
      out.push({
        id,
        severity,
        title,
        message,
        file,
        line: lineNum,
        evidence: [],
        confidence: "low",
      });
    } catch {}
  }
  return out;
}
