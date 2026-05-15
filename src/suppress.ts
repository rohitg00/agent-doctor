import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentId, Diagnostic } from "./types.js";

type IgnoreEntry = string | { id?: string; agent?: AgentId; until?: string };

interface IgnoreFile {
  ignore?: IgnoreEntry[];
}

const GLOBAL_PATH = join(homedir(), ".config", "agent-doctor", "ignore.json");
const PROJECT_NAME = ".agent-doctor.json";

export interface SuppressorOptions {
  cwd: string;
  extraIds?: string[];
}

export interface Suppressor {
  apply(diagnostics: Diagnostic[]): { kept: Diagnostic[]; suppressed: Diagnostic[] };
}

export function loadSuppressor(opts: SuppressorOptions): Suppressor {
  const entries: IgnoreEntry[] = [];
  for (const path of [GLOBAL_PATH, join(opts.cwd, PROJECT_NAME)]) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as IgnoreFile;
      if (Array.isArray(parsed.ignore)) entries.push(...parsed.ignore);
    } catch (err) {
      process.stderr.write(`agent-doctor: failed to read ${path}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  for (const id of opts.extraIds ?? []) entries.push(id);

  const now = new Date();
  const filters = entries
    .map((entry) => normalize(entry))
    .filter((f) => f && !f.expired(now)) as ActiveFilter[];

  return {
    apply(diagnostics: Diagnostic[]) {
      const kept: Diagnostic[] = [];
      const suppressed: Diagnostic[] = [];
      for (const d of diagnostics) {
        if (filters.some((f) => f.match(d))) suppressed.push(d);
        else kept.push(d);
      }
      return { kept, suppressed };
    },
  };
}

interface ActiveFilter {
  match(d: Diagnostic): boolean;
  expired(now: Date): boolean;
}

function normalize(entry: IgnoreEntry): ActiveFilter | undefined {
  if (typeof entry === "string") {
    return idFilter(entry, undefined, undefined);
  }
  if (!entry || (entry.id === undefined && entry.agent === undefined)) return undefined;
  return idFilter(entry.id, entry.agent, entry.until);
}

function idFilter(id: string | undefined, agent: AgentId | undefined, until: string | undefined): ActiveFilter {
  const wildcardId = id === undefined || id === "*";
  const wildcardAgent = agent === undefined;
  const expiry = until ? new Date(until) : undefined;
  return {
    match(d) {
      if (!wildcardId && d.id !== id) return false;
      if (!wildcardAgent && d.agent !== agent) return false;
      return true;
    },
    expired(now) {
      return expiry !== undefined && !Number.isNaN(expiry.getTime()) && expiry < now;
    },
  };
}
