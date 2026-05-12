# Diagnostic taxonomy

All diagnostic IDs are stable across `agent-doctor` versions. Severities can be overridden per-project.

## Validation

| ID                                  | Default | Meaning                                                            |
|-------------------------------------|---------|--------------------------------------------------------------------|
| `validation/required-check-missing` | warning | A required check has no command resolved.                          |
| `validation/required-check-failed`  | error   | A required check ran and exited non-zero.                          |
| `validation/required-check-timed-out` | error | A required check exceeded its timeout (SIGTERM, then SIGKILL).     |
| `validation/command-not-found`      | warning | A configured command is not on PATH.                               |
| `validation/ci-does-not-cover-package` | info | A changed workspace package has no covering CI job.                |
| `validation/browser-qa-missing`     | warning | UI changed but no browser test ran in this diff.                   |
| `validation/python/lint`            | info    | Python ruff (advisory) check.                                      |
| `validation/python/typecheck`       | warning | Python mypy or pyright check.                                      |
| `validation/python/test`            | warning | Python pytest check.                                               |
| `validation/go/vet`                 | warning | `go vet ./...`.                                                    |
| `validation/go/test`                | warning | `go test ./...`.                                                   |
| `validation/go/lint`                | info    | golangci-lint (advisory).                                          |
| `validation/rust/check`             | warning | `cargo check`.                                                     |
| `validation/rust/clippy`            | warning | `cargo clippy -- -D warnings`.                                     |
| `validation/rust/test`              | warning | `cargo test`.                                                      |
| `validation/rust/fmt`               | info    | `cargo fmt --check` (advisory).                                    |
| `validation/security/semgrep`       | info    | semgrep (advisory).                                                |
| `validation/security/gitleaks`      | warning | gitleaks secrets scan (required on security-sensitive paths).      |
| `validation/security/osv`           | warning | OSV-Scanner against changed manifests/lockfiles.                   |

## Tests

| ID                                | Default | Meaning                                                              |
|-----------------------------------|---------|----------------------------------------------------------------------|
| `tests/no-related-test-change`    | warning | A source file changed without a related test, snapshot, or scenario. |
| `tests/no-regression-test-for-bugfix` | warning | A bug-fix commit has no test asserting the fixed behavior.       |
| `tests/coverage-dropped`          | warning | Coverage went down on a touched package.                             |
| `tests/snapshot-changed-without-source` | warning | A snapshot moved without a matching source change.              |

## Diff risk

| ID                                    | Default | Meaning                                                       |
|---------------------------------------|---------|---------------------------------------------------------------|
| `risk/public-api-changed`             | info    | A public API surface changed.                                 |
| `risk/migration-changed`              | warning | A schema/migration file changed.                              |
| `risk/auth-or-permission-changed`     | warning | An auth or permission path changed.                           |
| `risk/security-sensitive-tooling-changed` | warning | A path the project marked as critical changed.            |
| `risk/generated-file-edited`          | warning | A generated path changed; suggest editing the source instead. |

## Dependencies

| ID                              | Default | Meaning                                                  |
|---------------------------------|---------|----------------------------------------------------------|
| `deps/manifest-lockfile-mismatch` | warning | `package.json` changed but the lockfile did not.       |
| `deps/new-package-unreviewed`   | info    | A new third-party dependency was added.                  |
| `deps/vulnerability-found`      | warning | A dependency has a known advisory.                       |

## Agent instructions and skills

| ID                                | Default | Meaning                                                            |
|-----------------------------------|---------|--------------------------------------------------------------------|
| `agent/instruction-conflict`      | warning | Two agent instruction files disagree on a destructive command.     |
| `agent/skill-frontmatter-invalid` | error / warning | YAML parse error, or missing name/description.             |
| `agent/skill-reference-broken`    | warning | A path referenced in the skill body does not exist.                |
| `agent/skill-too-large`           | warning | Skill exceeds the inline byte budget.                              |
| `agent/skill-trigger-too-broad`   | info    | Description lacks usable trigger language.                         |
| `agent/skill-applicable-no-proof` | info    | The skill might have applied; no transcript evidence was supplied. |
| `agent/required-skill-check-missing` | warning | A skill declared a required check that did not run.             |
| `agent/generated-skill-out-of-sync` | warning | A generated `SKILL.md` drifted from its template.                |
| `agent/rendered-artifact-drift`   | warning | A rendered agent artifact drifted from its source.                 |
| `agent/llm-only-block-unbalanced` | warning | LLM-only block markers are unbalanced.                             |
| `agent/destructive-command-unguarded` | warning | Destructive shell with no nearby approval language.             |
| `agent/skill-used`                | info    | Skill matched a changed path AND a transcript event proved it loaded. |
| `plugin/rule-error`               | warning | A plugin rule threw at run time; pipeline kept going.            |
| `ai/review-skipped`               | info    | --ai-review was requested but ANTHROPIC_API_KEY is not set.        |
| `ai/review-error`                 | info    | --ai-review request failed.                                        |

## Evidence

| ID                              | Default | Meaning                                              |
|---------------------------------|---------|------------------------------------------------------|
| `evidence/transcript-unparseable` | warning | Supplied transcript could not be normalized.       |
| `evidence/no-command-log`       | info    | No command log captured for an expected check.       |
| `evidence/no-artifact`          | info    | An expected artifact (e.g. screenshot) was missing.  |
| `evidence/stale-evidence`       | warning | Supplied evidence predates the current diff.         |
