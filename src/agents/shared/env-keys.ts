import type { AgentId, Diagnostic, FixHint } from "../../types.js";

export interface EnvKeyCheck {
  envName: string;
  agent: AgentId;
  ruleId: string;
  prefix?: RegExp;
  exampleValue?: string;
  required?: boolean;
}

export function checkEnvKey(check: EnvKeyCheck): Diagnostic[] {
  const value = process.env[check.envName];
  if (!value || value.length === 0) {
    if (!check.required) return [];
    const fix: FixHint = {
      kind: "env-set",
      name: check.envName,
      example: check.exampleValue ?? `<your-${check.envName.toLowerCase()}>`,
    };
    return [
      {
        id: check.ruleId,
        severity: "error",
        title: `${check.envName} is not set`,
        message: `${check.envName} env var is required for ${check.agent}.`,
        agent: check.agent,
        category: "auth",
        evidence: [{ kind: "env", name: check.envName, present: false }],
        confidence: "high",
        fixHint: fix,
      },
    ];
  }
  if (check.prefix && !check.prefix.test(value)) {
    return [
      {
        id: `${check.ruleId}-malformed`,
        severity: "warning",
        title: `${check.envName} looks malformed`,
        message: `Value does not match expected prefix pattern ${check.prefix}.`,
        agent: check.agent,
        category: "auth",
        evidence: [{ kind: "env", name: check.envName, present: true }],
        confidence: "medium",
        fixHint: { kind: "doc", url: `https://docs.anthropic.com` },
      },
    ];
  }
  return [];
}
