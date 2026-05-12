import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Profile } from "./types.js";

export interface UserConfig {
  profile?: Profile;
  base?: string;
  ignore?: {
    files?: string[];
    rules?: string[];
    overrides?: Array<{ files: string[]; rules: string[] }>;
  };
  commands?: Record<string, string>;
  risk?: {
    critical?: string[];
    generated?: string[];
  };
  skills?: {
    paths?: string[];
    requireEvidence?: boolean;
    maxInlineBytes?: number;
    validationLayers?: Array<"structure" | "style" | "ai" | "drift">;
    generatedSources?: Array<{
      output: string;
      source: string;
      renderCommand?: string;
      verifyCommand?: string;
    }>;
  };
  ci?: {
    provider?: string;
    annotations?: boolean;
    stickyComment?: boolean;
  };
}

const DEFAULT: UserConfig = {
  profile: "local",
  ignore: { files: ["dist/**", "node_modules/**", "build/**", "coverage/**"], rules: [] },
  risk: {
    critical: ["**/auth/**", "**/payments/**", "**/billing/**", "db/migrations/**", "**/.env*"],
    generated: ["**/*.generated.*", "**/generated/**", "**/__generated__/**"],
  },
  skills: {
    paths: [".codex/skills", ".agents/skills", ".claude/skills", ".cursor/rules"],
    requireEvidence: false,
    maxInlineBytes: 160_000,
    validationLayers: ["structure"],
  },
  ci: { annotations: false, stickyComment: false },
};

const CONFIG_FILES = [
  "agent-doctor.config.json",
  ".agent-doctor.json",
];

export async function loadConfig(cwd: string, explicit?: string): Promise<UserConfig> {
  let raw: UserConfig | undefined;

  if (explicit) {
    raw = JSON.parse(await readFile(explicit, "utf8")) as UserConfig;
  } else {
    for (const name of CONFIG_FILES) {
      const p = join(cwd, name);
      if (existsSync(p)) {
        raw = JSON.parse(await readFile(p, "utf8")) as UserConfig;
        break;
      }
    }
    if (!raw) {
      const pkgPath = join(cwd, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
        if (pkg["agentDoctor"] && typeof pkg["agentDoctor"] === "object") {
          raw = pkg["agentDoctor"] as UserConfig;
        }
      }
    }
  }

  return merge(DEFAULT, raw ?? {});
}

function merge(a: UserConfig, b: UserConfig): UserConfig {
  return {
    profile: b.profile ?? a.profile,
    base: b.base ?? a.base,
    ignore: {
      files: b.ignore?.files ?? a.ignore?.files,
      rules: b.ignore?.rules ?? a.ignore?.rules,
      overrides: b.ignore?.overrides ?? a.ignore?.overrides,
    },
    commands: { ...(a.commands ?? {}), ...(b.commands ?? {}) },
    risk: {
      critical: b.risk?.critical ?? a.risk?.critical,
      generated: b.risk?.generated ?? a.risk?.generated,
    },
    skills: {
      paths: b.skills?.paths ?? a.skills?.paths,
      requireEvidence: b.skills?.requireEvidence ?? a.skills?.requireEvidence,
      maxInlineBytes: b.skills?.maxInlineBytes ?? a.skills?.maxInlineBytes,
      validationLayers: b.skills?.validationLayers ?? a.skills?.validationLayers,
      generatedSources: b.skills?.generatedSources ?? a.skills?.generatedSources,
    },
    ci: {
      provider: b.ci?.provider ?? a.ci?.provider,
      annotations: b.ci?.annotations ?? a.ci?.annotations,
      stickyComment: b.ci?.stickyComment ?? a.ci?.stickyComment,
    },
  };
}
