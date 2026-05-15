import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface VsCodeExt {
  identifier?: { id?: string };
  version?: string;
  location?: { fsPath?: string };
}

let cached: Map<string, { version?: string; path?: string }> | undefined;

const EXT_DIRS = [
  join(homedir(), ".vscode", "extensions"),
  join(homedir(), ".vscode-insiders", "extensions"),
  join(homedir(), ".cursor", "extensions"),
  join(homedir(), ".windsurf", "extensions"),
];

export async function loadVsCodeExtensions(): Promise<Map<string, { version?: string; path?: string }>> {
  if (cached) return cached;
  cached = new Map();
  for (const dir of EXT_DIRS) {
    const manifest = join(dir, "extensions.json");
    if (!existsSync(manifest)) continue;
    try {
      const raw = await readFile(manifest, "utf8");
      const parsed = JSON.parse(raw) as VsCodeExt[];
      if (!Array.isArray(parsed)) continue;
      for (const ext of parsed) {
        const id = ext.identifier?.id?.toLowerCase();
        if (!id) continue;
        if (!cached.has(id)) {
          cached.set(id, { version: ext.version, path: ext.location?.fsPath });
        }
      }
    } catch {
      // ignore unreadable manifest
    }
  }
  return cached;
}

export async function findExtension(extId: string): Promise<{ version?: string; path?: string } | undefined> {
  const map = await loadVsCodeExtensions();
  return map.get(extId.toLowerCase());
}
