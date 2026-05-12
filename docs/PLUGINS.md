# `agent-doctor` plugins

Plugins let teams ship custom rules and validation planners without forking. They are loaded at startup from `config.plugins`.

## Plugin shape

```ts
import type { AgentDoctorPlugin } from "agent-doctor";

const plugin: AgentDoctorPlugin = {
  name: "my-org-rules",

  // Optional: contribute detection capabilities.
  detect: async (ctx) => [
    { language: "yaml", testRunners: ["yamllint"] },
  ],

  // Optional: contribute planned checks (run before built-in rules).
  plan: async ({ cwd, detected, changedFiles, risk }) => {
    const touched = changedFiles.some((f) => f.path.endsWith(".yaml"));
    if (!touched) return [];
    return [
      {
        id: "validation/org/yamllint",
        command: "yamllint .",
        required: risk.level !== "low",
        reason: "YAML changed (org policy)",
      },
    ];
  },

  // Optional: contribute rules that emit diagnostics.
  rules: [
    {
      id: "org/no-console-log",
      defaultSeverity: "warning",
      run: ({ changedFiles }) =>
        changedFiles
          .filter((f) => f.path.endsWith(".ts") && f.status !== "deleted")
          .map((f) => ({
            id: "org/no-console-log",
            severity: "warning",
            title: "review console.log",
            message: `${f.path} touched - confirm no console.log left in`,
            evidence: [],
            confidence: "low",
          })),
    },
  ],
};

export default plugin;
```

## Loading

```json
{
  "plugins": [
    "./agent-doctor.plugins.mjs",
    "@my-org/agent-doctor-rules"
  ]
}
```

- A path starting with `.` or `/` is resolved against the project root.
- A bare specifier is resolved via Node module resolution.
- The default export can be a plugin object or a factory function returning a plugin (sync or async).

## Contexts

| Context        | Available fields                                                              |
|----------------|-------------------------------------------------------------------------------|
| `DetectContext`| `cwd`, `config`                                                               |
| `PlanContext`  | `cwd`, `config`, `detected`, `changedFiles`, `risk`                           |
| `RuleContext`  | `cwd`, `config`, `detected`, `changedFiles`, `risk`, `checks`                 |

Rules run after built-in rules and after the runner (so check outcomes are visible). A rule that throws becomes a `plugin/rule-error` warning rather than aborting the pipeline.

## Severity escalation

Plugin rules respect their `defaultSeverity` unless the diagnostic itself sets one. To allow projects to suppress your rule, give it a stable, unique ID.

## Distribution

- Ship as a regular npm package with an ESM `default` export.
- Pin a peer-range against `agent-doctor` and import its public types: `import type { AgentDoctorPlugin, Diagnostic, RuleContext } from "agent-doctor";`.
- Treat plugin diagnostics as non-blocking unless the team opts in via `defaultSeverity: "error"`.
