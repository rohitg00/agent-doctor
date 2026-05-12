import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

export interface AgentEvent {
  type: "skill.loaded" | "tool.called" | "command.started" | "command.finished" | "file.edited" | "artifact.created" | "approval.requested" | "approval.granted";
  source: string;
  name?: string;
  tool?: string;
  command?: string;
  exitCode?: number;
  durationMs?: number;
  path?: string;
  artifactType?: string;
  action?: string;
  timestamp?: string;
  raw?: unknown;
}

export async function ingestEvidence(paths: string[], cwd: string): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for (const p of paths) {
    const abs = resolve(cwd, p);
    if (!existsSync(abs)) {
      process.stderr.write(`agent-doctor: evidence path not found: ${p}\n`);
      continue;
    }
    const s = await stat(abs);
    if (s.isDirectory()) {
      const files = await readdir(abs, { withFileTypes: true });
      for (const f of files) {
        if (!f.isFile()) continue;
        out.push(...(await parseFile(join(abs, f.name))));
      }
    } else {
      out.push(...(await parseFile(abs)));
    }
  }
  return out;
}

async function parseFile(path: string): Promise<AgentEvent[]> {
  const ext = extname(path).toLowerCase();
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw) return [];
  if (ext === ".jsonl" || isJsonl(raw)) return parseJsonl(raw, path);
  if (ext === ".json") return parseJson(raw, path);
  return parsePlain(raw, path);
}

function isJsonl(raw: string): boolean {
  const head = raw.slice(0, 4096).split("\n").find((line) => line.trim().startsWith("{"));
  return head !== undefined && raw.split("\n").filter((l) => l.trim()).length > 1;
}

function parseJsonl(raw: string, source: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      const ev = mapEntry(entry, source);
      if (ev) out.push(ev);
    } catch {}
  }
  return out;
}

function parseJson(raw: string, source: string): AgentEvent[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const out: AgentEvent[] = [];
      for (const entry of parsed) {
        if (entry && typeof entry === "object") {
          const ev = mapEntry(entry as Record<string, unknown>, source);
          if (ev) out.push(ev);
        }
      }
      return out;
    }
    if (parsed && typeof parsed === "object") {
      const ev = mapEntry(parsed as Record<string, unknown>, source);
      return ev ? [ev] : [];
    }
  } catch {}
  return [];
}

function parsePlain(raw: string, source: string): AgentEvent[] {
  const out: AgentEvent[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    const m = /\$ (.+)/.exec(line);
    if (m) out.push({ type: "command.started", source, command: m[1]!.trim() });
  }
  return out;
}

function mapEntry(entry: Record<string, unknown>, source: string): AgentEvent | undefined {
  const ts = pickString(entry, ["timestamp", "time", "ts", "created_at"]);

  const type = pickString(entry, ["type", "event", "kind"]);

  if (entry["tool_use"] || entry["tool_call"] || entry["tool"]) {
    const tool = pickString(entry, ["tool", "tool_name"]) ??
      (typeof entry["tool_use"] === "object" && entry["tool_use"] !== null
        ? pickString(entry["tool_use"] as Record<string, unknown>, ["name"])
        : undefined);
    if (tool) {
      return { type: "tool.called", source, tool, timestamp: ts, raw: entry };
    }
  }

  if (type === "skill" || pickString(entry, ["skill"])) {
    const name = pickString(entry, ["skill", "name"]);
    return { type: "skill.loaded", source, name, timestamp: ts, raw: entry };
  }

  if (type === "command" || pickString(entry, ["command", "cmd"])) {
    const command = pickString(entry, ["command", "cmd"]);
    const exitCode = pickNumber(entry, ["exit", "exit_code", "exitCode", "code"]);
    if (exitCode !== undefined) {
      return { type: "command.finished", source, command, exitCode, timestamp: ts, raw: entry };
    }
    return { type: "command.started", source, command, timestamp: ts, raw: entry };
  }

  if (type === "edit" || type === "file.edited" || pickString(entry, ["edited_file"])) {
    const path = pickString(entry, ["path", "file", "edited_file"]);
    return { type: "file.edited", source, path, timestamp: ts, raw: entry };
  }

  if (type === "approval.request" || type === "approval.requested") {
    return {
      type: "approval.requested",
      source,
      action: pickString(entry, ["action", "what", "command"]),
      timestamp: ts,
      raw: entry,
    };
  }

  return undefined;
}

function pickString(entry: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = entry[k];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function pickNumber(entry: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = entry[k];
    if (typeof v === "number") return v;
  }
  return undefined;
}
