import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { binaryVersion, findBinary, homePath } from "./shared/probe.js";
import { parseYamlFile } from "./shared/config-parse.js";
import { checkEnvKey } from "./shared/env-keys.js";
import type { AgentAdapter, ValidateContext } from "../plugin-api.js";
import type { AgentProbe, Diagnostic } from "../types.js";

const AGENT_ID = "aider" as const;
const KNOWN_MODELS = new Set([
  "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini", "o1", "o1-preview", "o1-mini",
  "claude-3-5-sonnet", "claude-3-5-haiku", "claude-sonnet-4", "claude-opus-4", "claude-haiku-4",
  "deepseek-chat", "deepseek-coder", "mistral-large",
]);

interface AiderConfig {
  model?: string;
  "openai-api-key"?: string;
  "anthropic-api-key"?: string;
}

export const aiderAdapter: AgentAdapter = {
  id: AGENT_ID,

  async probe(cwd: string): Promise<AgentProbe> {
    const bin = findBinary("aider");
    const yml = resolve(cwd, ".aider.conf.yml");
    const home = homePath(".aider.conf.yml");
    const yamlMistake = resolve(cwd, ".aider.conf.yaml");
    const configPaths = [yml, home, yamlMistake].filter((p) => existsSync(p));
    const present = bin.found || configPaths.length > 0;
    if (!present) return { id: AGENT_ID, present: false, configPaths: [], source: "absent" };
    return {
      id: AGENT_ID,
      present: true,
      binary: "aider",
      binaryPath: bin.path,
      configPaths,
      source: bin.found ? "binary" : "config-only",
    };
  },

  async validate(probe: AgentProbe, ctx: ValidateContext): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];

    if (ctx.deep && probe.binaryPath) {
      probe.version = await binaryVersion(probe.binaryPath, "--version", 750);
    }

    const yamlMistake = resolve(ctx.cwd, ".aider.conf.yaml");
    if (existsSync(yamlMistake)) {
      out.push({
        id: `${AGENT_ID}/config/yaml-extension-not-yml`,
        severity: "error",
        title: "Aider config uses .yaml extension",
        message: "Aider only loads .aider.conf.yml. The .yaml extension is silently ignored.",
        file: yamlMistake,
        agent: AGENT_ID,
        category: "config",
        evidence: [{ kind: "file", path: yamlMistake }],
        confidence: "high",
        fixHint: { kind: "command", run: `mv ${yamlMistake} ${yamlMistake.replace(/\.yaml$/, ".yml")}` },
      });
    }

    for (const candidate of [resolve(ctx.cwd, ".aider.conf.yml"), homePath(".aider.conf.yml")]) {
      if (!existsSync(candidate)) continue;
      const parsed = await parseYamlFile<AiderConfig>(
        candidate,
        AGENT_ID,
        `${AGENT_ID}/config/yaml-parse-error`,
      );
      out.push(...parsed.diagnostics);
      const data = parsed.data ?? {};

      if (data.model && !KNOWN_MODELS.has(data.model.replace(/-\d{8}$/, ""))) {
        out.push({
          id: `${AGENT_ID}/config/model-unknown`,
          severity: "info",
          title: `aider model "${data.model}" not in known list`,
          message: `Aider may route via litellm; double-check the model id.`,
          file: candidate,
          agent: AGENT_ID,
          category: "config",
          evidence: [{ kind: "config", path: candidate, key: "model", value: data.model }],
          confidence: "low",
        });
      }

      if (data["openai-api-key"] || data["anthropic-api-key"]) {
        const raw = readFileSync(candidate, "utf8");
        if (/\bsk-[a-zA-Z0-9_-]{8,}/.test(raw)) {
          out.push({
            id: `${AGENT_ID}/auth/key-in-conf-not-env`,
            severity: "warning",
            title: "API key stored in config file",
            message: `${candidate} appears to contain an API key. Move it to an env var or ${candidate.replace(/\.yml$/, "")}.env to avoid leaking it via git.`,
            file: candidate,
            agent: AGENT_ID,
            category: "auth",
            evidence: [{ kind: "config", path: candidate }],
            confidence: "medium",
            fixHint: { kind: "env-set", name: "OPENAI_API_KEY", example: "sk-XXXX" },
          });
        }
      }
    }

    out.push(
      ...checkEnvKey({
        envName: "OPENAI_API_KEY",
        agent: AGENT_ID,
        ruleId: `${AGENT_ID}/auth/openai-key-missing`,
        prefix: /^sk-/,
      }),
    );

    return out;
  },
};
