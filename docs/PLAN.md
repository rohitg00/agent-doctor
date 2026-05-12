# `agent-doctor` plan

## Goal

Build a small, evidence-based CLI that tells engineers whether an AI-agent code change is ready to review, ready to merge, or missing critical proof.

Core promise:

```sh
npx -y agent-doctor@latest .
```

It detects the repo, reads the diff, builds a risk model, discovers the cheapest relevant validations, audits agent instructions and skills, checks available agent evidence, and prints a report that is useful both locally and in CI.

It does not claim an agent was "safe". It tells the engineer what was proven, what was not proven, and what to run next.

## Product positioning

**One sentence:** `agent-doctor` is a diff-aware quality gate for AI-assisted code changes.

**Primary users:**

- Engineers reviewing AI-generated PRs.
- Solo developers shipping with AI coding agents.
- Teams standardizing project agent instructions, editor rules, and `SKILL.md` workflows.
- Maintainers of agent skill libraries who need validation before publishing or merging.

**Non-goals:**

- Do not replace project test suites.
- Do not judge code quality through an LLM by default.
- Do not require transcript access to be useful.
- Do not invent a new build system.
- Do not block a merge because of speculation. Block only on configured hard evidence.

## Core model

### Evidence is the main abstraction

Every diagnostic must be tied to evidence or explicitly marked as missing evidence. Evidence kinds:

- `file` — a path (optional line + hash).
- `diff` — a hunk summary for a changed file.
- `command` — exit code, duration, output excerpt.
- `ci` — provider, run URL, status.
- `agent-event` — normalized transcript or JSONL event.
- `artifact` — screenshot, trace, coverage, snapshot, log.

Rules say:

- "failed" when evidence proves failure.
- "missing" when required evidence is absent.
- "not found" when a reference is broken.
- "no evidence found" when transcript proof is optional or unavailable.

Never say "the agent skipped X" unless the transcript proves it.

### Risk model

Risk dimensions: public API, schema or migration, auth or permissions, payments, UI or route, dependency graph, generated, agent instruction or skill, CI or build, large deletion, security-sensitive.

Risk levels:

| Level    | Examples                                                                  |
|----------|---------------------------------------------------------------------------|
| low      | docs, comments, narrow tests, isolated types                              |
| medium   | local behavior, small UI, package internals                               |
| high     | public APIs, shared libraries, dependency manifest, build config          |
| critical | auth, permissions, payments, migrations, secrets, security-sensitive code |

Validation escalates with risk. A docs-only change should not run a full browser suite. An auth migration should not pass on lint alone.

## What it checks (MVP scope)

### Project detection

Package managers (npm, pnpm, yarn, bun) and the lockfile, workspaces, `package.json` scripts per package, agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, `.windsurfrules`), `SKILL.md` and `.skill.md` files under `.codex/skills`, `.agents/skills`, `.claude/skills`, `.cursor/rules`, and CI workflows.

### Change-aware planner

Given a diff:

- Map changed files to packages.
- Prefer package-scoped commands over repo-wide commands.
- Run cheap checks first.
- Escalate when shared files, public APIs, schemas, migrations, auth, security, browser surfaces, or CI config changed.
- Separate required from recommended.
- Show skipped checks and why.

### Skill audit

- `agent/skill-frontmatter-invalid` — malformed YAML, missing name, missing description.
- `agent/skill-trigger-too-broad` — description too short.
- `agent/skill-too-large` — exceeds inline byte budget.
- `agent/skill-reference-broken` — body references a path that doesn't exist.
- `agent/destructive-command-unguarded` — destructive shell with no nearby approval language.
- `agent/skill-applicable-no-proof` — info-only, requires transcript to escalate.

### First rules (post-detection, pre-runner)

- `deps/manifest-lockfile-mismatch`
- `tests/no-related-test-change`
- `risk/generated-file-edited`
- `validation/required-check-missing`
- `validation/required-check-failed`

## Scoring

```text
score = 100
score -= unique_error_rules * 4
score -= unique_warning_rules * 1
score -= failed_required_checks * 8
score -= missing_required_checks * 5
score -= critical_risk_without_evidence * 10
score = max(score, 0)
```

| Range    | Label         |
|----------|---------------|
| 90-100   | Ready         |
| 75-89    | Needs review  |
| 55-74    | Risky         |
| <55      | Blocked       |

The score is secondary. Diagnostics and next-actions matter more.

## Roadmap

### Phase 1 — core CLI and report (done in MVP)

TypeScript CLI, config loading, git diff/staged/full collection, package manager and workspace detection, report schema, text + JSON output, `--fail-on` behavior.

### Phase 2 — validation planner (done in MVP)

Risk classifier, command discovery, affected package mapping, `--plan-only`, command runner with timeouts, command evidence capture.

### Phase 3 — first rules (done in MVP)

Lockfile/manifest consistency, related-test heuristic, generated-file edit, required-check-missing/failed, scoring.

### Phase 4 — skills and instructions (done in MVP)

Parse `SKILL.md` with YAML frontmatter, validate references and command mentions, detect oversized skills, detect destructive instructions without approval language.

### Phase 5 — CI product

CI wrapper, annotations, sticky PR comment, SARIF once diagnostics stabilize, JUnit-style output.

### Phase 6 — adapters and rule packs

Python adapter, Go adapter, Rust adapter, Semgrep integration, gitleaks integration, OSV integration, custom org plugin API.

## Real-world hardening checklist

Before v1:

- Works in a dirty worktree.
- Handles missing git base gracefully.
- Handles monorepos with nested package managers.
- Never runs broad expensive checks unless configured or risk requires it.
- Does not break when transcripts are absent.
- Does not parse untrusted transcript text as instructions.
- Redacts secrets from command output excerpts.
- Truncates huge logs.
- Handles Windows paths.
- Handles generated skill docs.
- Handles renamed files.
- Handles lockfile-only dependency updates.
- Handles CI shallow clones with clear instructions.
- Gives engineers the next command to run, not just a complaint.

## Design principles

- Evidence first.
- Diff aware by default.
- Fast locally, stricter in CI.
- Explain every finding.
- Prefer existing commands.
- Prefer adapters over hardcoded framework assumptions.
- Treat skills as executable engineering instructions, not documentation.
- Avoid pretending to know what cannot be proven.
- Make suppressions narrow, local, and reviewable.
- Keep the MVP useful without transcripts.
