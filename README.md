# agent-doctor

Diff-aware quality gate for AI-assisted code changes.

```sh
npx -y agent-doctor@latest .
```

`agent-doctor` reads the diff, builds a risk model, discovers the cheapest relevant validations, audits agent instructions and skills, ingests available evidence, and prints a report that is useful both locally and in CI.

It does **not** claim an agent was "safe". It tells the engineer what was proven, what was not proven, and what to run next.

- [Plan](docs/PLAN.md)
- [Configuration](docs/CONFIG.md)
- [Diagnostic taxonomy](docs/DIAGNOSTICS.md)

> Status: 0.x. MVP targets TypeScript / JavaScript monorepos and skill-library checks.

## Install

Run without installing:

```sh
npx -y agent-doctor@latest --diff main --plan-only
```

Install globally:

```sh
npm install -g agent-doctor
agent-doctor --diff main --plan-only
```

Install per-repo as a dev dependency:

```sh
npm install --save-dev agent-doctor
npx agent-doctor --diff main --plan-only
```

## Quick start

```sh
agent-doctor --diff main --plan-only        # print the validation plan
agent-doctor --diff main --run              # run discovered checks and report
agent-doctor --diff main --run --json > report.json
agent-doctor --staged                       # for pre-commit
agent-doctor --full --profile skill-library # audit a skill repo
```

## CLI options

```text
agent-doctor [directory] [options]

  --diff [base]              scan files changed against a base ref
  --staged                   scan staged + unstaged + untracked
  --full                     scan the whole repo
  --profile <name>           local | ci | release | skill-library
  --run                      run discovered validations
  --plan-only                print the validation plan without running
  --json                     emit machine-readable JSON report
  --fail-on <level>          error | warning | none  (default: error)
  --config <path>            explicit config file path
  --evidence <path>          attach transcript/log/artifact (repeatable)
  --no-color                 disable ANSI colors
  --help                     show this help
  --version                  print version
```

## What it checks

### Risk classification

`agent-doctor` classifies each diff across these dimensions: public API, schema or migration, auth or permissions, payments, UI or route, dependency graph, generated, agent instruction or skill, CI or build, large deletion, security-sensitive. Risk rolls up to one of `low / medium / high / critical` and drives which checks become required vs. recommended.

### Validation planner

Maps changed files to packages and picks the cheapest relevant commands. Prefers package-scoped scripts over repo-wide commands. Falls back from explicit config to `package.json` scripts to detected language defaults.

### Skill audit

- `agent/skill-frontmatter-invalid` — malformed YAML, missing name, missing description.
- `agent/skill-trigger-too-broad` — description too short to match real prompts.
- `agent/skill-too-large` — exceeds the inline byte budget.
- `agent/skill-reference-broken` — body references a path that does not exist.
- `agent/destructive-command-unguarded` — `rm -rf`, `sudo`, piped `curl | sh`, `DROP TABLE`, etc., with no nearby approval language.
- `agent/skill-applicable-no-proof` — info-only; never escalates without transcript evidence.

### First rules

- `deps/manifest-lockfile-mismatch`
- `tests/no-related-test-change`
- `risk/generated-file-edited`
- `validation/required-check-missing` and `validation/required-check-failed`

The full diagnostic table lives in [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md).

## Example report

```text
Agent Doctor: 78/100 Needs review

Mode: diff
Changed files: 12
Detected: pnpm, 4 packages, 3 skills, agent instructions
Risk: critical
  - critical path matched: src/auth/session.ts

Planned checks
  [required] validation/typecheck: pnpm typecheck
      TS/JS sources changed
  [required] validation/test: pnpm test
      behavior or risky path changed

Errors
  validation/required-check-failed
    validation/typecheck failed
    Exit code 2.
    next: re-run locally
          $ pnpm typecheck

Warnings
  tests/no-related-test-change
    src/billing/pricing.ts changed, but no related test, snapshot, or scenario changed.
```

## Profiles

| Profile         | Hard-fail on                                  | Recommended use                            |
|-----------------|-----------------------------------------------|--------------------------------------------|
| `local`         | nothing by default                            | pre-commit, advisory                       |
| `ci`            | required check failures, error diagnostics    | PR gate                                    |
| `release`       | + broader build/test/browser evidence         | release branches                           |
| `skill-library` | + broken skill refs, oversized skills, drift  | skill / prompt / agent-instruction repos   |

## Configuration

`agent-doctor.config.json` at the repo root. See [`docs/CONFIG.md`](docs/CONFIG.md) for the full schema and [`agent-doctor.config.example.json`](agent-doctor.config.example.json) for a starter.

## CI integration

GitHub Actions:

```yaml
name: agent-doctor
on: pull_request
jobs:
  agent-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx -y agent-doctor@latest --diff origin/${{ github.base_ref }} --profile ci --run --fail-on error
```

## Design principles

- Evidence first. Every diagnostic ties to a file, diff, command exit, CI log, transcript event, or artifact — or is explicitly marked as missing evidence.
- Diff-aware by default. A docs-only change should not run a full browser suite.
- Fast locally, stricter in CI. The `ci` profile blocks on required checks and broken references; the `local` profile is advisory.
- Explain every finding. Each diagnostic has an ID, a message, and a `next` action.
- Prefer existing commands. The CLI does not invent commands silently.
- Treat skills as executable engineering instructions, not documentation.
- Avoid pretending to know what cannot be proven. Without transcript evidence, "skill was likely applicable" is at most informational.

## Roadmap

See [`docs/PLAN.md`](docs/PLAN.md). Phases 5+ (CI sticky comments, SARIF, JUnit, Python/Go/Rust adapters, Semgrep/gitleaks/OSV integration, plugin API) are post-MVP.

## License

[Apache-2.0](LICENSE)
