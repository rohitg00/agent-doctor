# `agent-doctor` configuration

`agent-doctor` looks for config in this order:

1. The path passed via `--config`.
2. `agent-doctor.config.json` at the repo root.
3. `.agent-doctor.json` at the repo root.
4. The `agentDoctor` key in `package.json`.

If no config is found, typed defaults are used. All keys are optional.

## Schema

```jsonc
{
  // Default profile when --profile is not passed.
  "profile": "ci",

  // Optional explicit base ref for --diff. Falls back to origin/main, main,
  // origin/master, master.
  "base": "main",

  "ignore": {
    "files": ["dist/**", "node_modules/**", "build/**", "coverage/**"],
    "rules": ["tests/no-related-test-change"],
    "overrides": [
      {
        "files": ["scripts/one-off/**"],
        "rules": ["tests/no-related-test-change"]
      }
    ]
  },

  // Map well-known check names to project commands. Overrides anything
  // discovered via package.json scripts.
  "commands": {
    "typecheck": "pnpm typecheck",
    "lint": "pnpm lint",
    "test": "pnpm test",
    "build": "pnpm build",
    "test:e2e": "pnpm test:e2e",
    "db:migrate:check": "pnpm db:migrate:check"
  },

  "risk": {
    // Globs that escalate a touched file to critical risk.
    "critical": [
      "src/auth/**",
      "src/payments/**",
      "db/migrations/**",
      ".env*"
    ],
    // Globs that mark a file as generated. Editing one without editing a
    // source/template raises risk/generated-file-edited.
    "generated": [
      "**/*.generated.*",
      "**/__generated__/**",
      "docs/api/**"
    ]
  },

  "skills": {
    "paths": [".codex/skills", ".agents/skills", ".claude/skills", ".cursor/rules"],
    // Whether to require transcript evidence to claim a skill ran. Default false.
    "requireEvidence": false,
    // Max bytes for a SKILL.md before agent/skill-too-large fires.
    "maxInlineBytes": 160000,
    // Which validator layers to run. The MVP ships `structure` only.
    "validationLayers": ["structure", "style"],
    // Render-then-verify pairs for generated agent artifacts.
    "generatedSources": [
      {
        "output": ".agents/skills/**/SKILL.md",
        "source": ".agents/skills/**/*.tmpl",
        "renderCommand": "pnpm gen:skill-docs",
        "verifyCommand": "pnpm skill:check --layers structure,style"
      }
    ]
  },

  "ci": {
    "provider": "primary",
    "annotations": true,
    "stickyComment": true
  }
}
```

## Profiles

| Profile         | Hard-fail on                                  | Recommended use                                |
|-----------------|-----------------------------------------------|------------------------------------------------|
| `local`         | nothing by default                            | pre-commit, advisory                           |
| `ci`            | required check failures, error diagnostics    | PR gate                                        |
| `release`       | + broader build/test/browser evidence         | release branches                               |
| `skill-library` | + broken skill refs, oversized skills, drift  | skill / prompt / agent-instruction repos       |

## Suppressions

Suppressions live in `ignore.rules` or `ignore.overrides`. Keep them local and reviewable. Prefer fixing the root cause to silencing the diagnostic.
