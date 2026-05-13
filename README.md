# agent-doctor

Diff-aware quality gate for AI-assisted code changes.

```sh
npx -y agent-doctor@latest .
```

`agent-doctor` reads the diff, builds a risk model, discovers the cheapest relevant validations, audits agent instructions and skills, ingests available evidence, and prints a green-themed report that is useful both locally and in CI.

It does **not** claim an agent was "safe". It tells the engineer what was proven, what was not proven, and what to run next.

- [Plan](docs/PLAN.md)
- [Configuration](docs/CONFIG.md)
- [Diagnostic taxonomy](docs/DIAGNOSTICS.md)
- [Plugins](docs/PLUGINS.md)

> Status: 0.x. TypeScript / JavaScript / Python / Go / Rust supported. Skill-library audit built-in.

## Install

```sh
npx -y agent-doctor@latest --diff main --plan-only
npm install -g agent-doctor
npm install --save-dev agent-doctor
```

## Quick start

```sh
agent-doctor --diff main --plan-only        # print the validation plan
agent-doctor --diff main --run              # run discovered checks and report
agent-doctor --diff main --run --json > report.json
agent-doctor --staged                       # pre-commit
agent-doctor --full --profile skill-library # audit a skill repo
```

## CLI options

```text
agent-doctor [directory] [options]

Scope:
  --diff [base]              files changed against a base ref
  --staged                   staged + unstaged + untracked
  --full                     the whole repo

Execution:
  --profile <name>           local | ci | release | skill-library
  --run                      run discovered validations
  --plan-only                print the plan without running
  --ai-review                opt-in LLM review (needs ANTHROPIC_API_KEY)
  --no-network               disable any outbound network call
  --fail-on <level>          error | warning | none  (default: error)
  --config <path>            explicit config file
  --evidence <path>          attach transcript/log/artifact (repeatable)

Output:
  --json                     machine-readable JSON report
  --sarif [path]             SARIF 2.1.0 (path or stdout)
  --annotations              GitHub Actions workflow commands (stderr)
  --pr-comment [path]        sticky markdown PR comment
  --junit [path]             JUnit XML
  --no-color                 disable ANSI colors
  --no-unicode               ASCII glyphs only
  --width <cols>             override terminal width
  --help                     show help
  --version                  print version
```

## What it checks

### Risk classification

Per-file dimensions: public API · schema/migration · auth/permissions · payments · UI/route · dependency graph · generated · agent instruction · CI/build · large deletion · security-sensitive. Rolls up to `low / medium / high / critical` and drives which checks become required vs. recommended.

### Validation planner

Maps changed files to packages and picks the cheapest relevant commands. Prefers package-scoped scripts. Falls back from explicit config to `package.json` scripts to detected language defaults.

### Language adapters

| Language   | Triggers on                                          | Plans                                                              |
|------------|------------------------------------------------------|--------------------------------------------------------------------|
| TS / JS    | `package.json` and `*.ts*` / `*.js*` changes         | `typecheck`, `lint`, `test`, `build`, `test:e2e`                   |
| Python     | `pyproject.toml` / `setup.py` / `requirements.txt`   | `ruff check`, `mypy` or `pyright`, `pytest -q`                     |
| Go         | `go.mod` + any `.go` change                          | `go vet ./...`, `go test ./...`, `golangci-lint run`               |
| Rust       | `Cargo.toml` + any `.rs` change                      | `cargo check`, `cargo clippy -- -D warnings`, `cargo test`, `fmt`  |

### Security integrations

When found on PATH (and not disabled in `config.integrations`):

- `semgrep --error --quiet --config=auto` (advisory)
- `gitleaks detect --no-banner --redact --exit-code 1` (required on security-sensitive paths)
- `osv-scanner --recursive .` (only when a manifest/lockfile changed)

### Skill audit

`agent/skill-frontmatter-invalid` · `agent/skill-trigger-too-broad` · `agent/skill-too-large` · `agent/skill-reference-broken` · `agent/destructive-command-unguarded` · `agent/skill-applicable-no-proof` (info-only) · `agent/skill-used` (escalates when transcript proves the skill loaded).

### Built-in rules

`deps/manifest-lockfile-mismatch` · `tests/no-related-test-change` · `risk/generated-file-edited` · `validation/required-check-missing` · `validation/required-check-failed` · `validation/required-check-timed-out`.

Full table in [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md).

## Evidence ingestion

Pass `--evidence <path>` one or more times. Paths may be files or directories. Supported:

- JSONL session logs (Claude Code, Codex CLI, custom agents)
- `.json` files containing a single event object or an array
- Plain transcripts (shell `$ command` lines are picked up)

Normalized to `AgentEvent`s: `skill.loaded`, `tool.called`, `command.started/finished`, `file.edited`, `approval.requested/granted`. Skill applicability escalates when a matching `skill.loaded` event is present.

## Output formats

| Flag             | Format                                                  | Typical use                            |
|------------------|---------------------------------------------------------|----------------------------------------|
| (default)        | green-themed terminal report                            | local                                  |
| `--json`         | JSON report (`Report` shape)                            | scripting                              |
| `--sarif`        | SARIF 2.1.0                                             | GitHub Code Scanning, CodeQL viewers   |
| `--annotations`  | `::error::` / `::warning::` / `::notice::` on stderr    | GitHub Actions inline annotations      |
| `--pr-comment`   | Markdown with `<!-- agent-doctor:sticky -->` marker     | sticky PR comment via `gh pr comment`  |
| `--junit`        | JUnit XML                                               | CI dashboards                          |

## CI integration

GitHub Actions:

```yaml
name: agent-doctor
on: pull_request
permissions:
  contents: read
  pull-requests: write
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
      - id: ad
        run: |
          npx -y agent-doctor@latest \
            --diff origin/${{ github.base_ref }} \
            --profile ci \
            --run \
            --fail-on error \
            --annotations \
            --sarif agent-doctor.sarif \
            --pr-comment agent-doctor-pr.md
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: agent-doctor.sarif
      - if: always()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # upsert sticky PR comment
          marker='<!-- agent-doctor:sticky -->'
          body=$(cat agent-doctor-pr.md)
          existing=$(gh api repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments \
            --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -1)
          if [ -n "$existing" ]; then
            gh api -X PATCH repos/${{ github.repository }}/issues/comments/$existing -f body="$body"
          else
            gh pr comment ${{ github.event.pull_request.number }} --body "$body"
          fi
```

## Plugin API

Add custom rules and planners without forking. See [`docs/PLUGINS.md`](docs/PLUGINS.md).

```ts
import type { AgentDoctorPlugin } from "agent-doctor";

const plugin: AgentDoctorPlugin = {
  name: "my-org-rules",
  rules: [
    {
      id: "org/no-console-log",
      defaultSeverity: "warning",
      run: ({ changedFiles }) =>
        changedFiles
          .filter((f) => f.path.endsWith(".ts"))
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

```json
{ "plugins": ["./agent-doctor.plugins.mjs"] }
```

## AI review (opt-in)

`--ai-review` enables an advisory pass that sends a redacted slice of the diff to Anthropic. Off by default. Requires `ANTHROPIC_API_KEY`. Bypassed entirely by `--no-network`. Only emits `info` / `warning` diagnostics; never blocks.

## Profiles

| Profile         | Hard-fail on                                  | Recommended use                            |
|-----------------|-----------------------------------------------|--------------------------------------------|
| `local`         | nothing by default                            | pre-commit, advisory                       |
| `ci`            | required check failures, error diagnostics    | PR gate                                    |
| `release`       | + broader build/test/browser evidence         | release branches                           |
| `skill-library` | + broken skill refs, oversized skills, drift  | skill / prompt / agent-instruction repos   |

## Configuration

`agent-doctor.config.json` at repo root. Schema in [`docs/CONFIG.md`](docs/CONFIG.md), starter in [`agent-doctor.config.example.json`](agent-doctor.config.example.json).

## Design principles

- Evidence first. Every diagnostic ties to a file, diff, command exit, CI log, transcript event, or artifact — or is explicitly marked as missing evidence.
- Diff-aware by default. A docs-only change does not trigger a full browser suite.
- Fast locally, stricter in CI.
- Explain every finding. Each diagnostic has an ID, a message, and a `next` action.
- Prefer existing commands. Never invent commands silently.
- Skills are executable engineering instructions, not documentation.
- Without transcript evidence, "skill was likely applicable" is at most informational.

## Roadmap

Phases 1–6 of [`docs/PLAN.md`](docs/PLAN.md) are now shipped. Tracked for v0.x post-MVP:

- Native browser-QA evidence (Playwright trace / screenshot ingestion)
- Per-package script ownership in workspaces (`pnpm --filter` / `npm -w` rendering)
- Coverage delta detection
- Drift checks for rendered skill artifacts
- Org-level plugin marketplace

## License

[Apache-2.0](LICENSE)
