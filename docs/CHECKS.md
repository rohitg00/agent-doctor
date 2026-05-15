# Checks catalog

Stable diagnostic ids by agent and category. Severity is the default; suppression may downgrade.

Naming: `<agent>/<category>/<slug>`.

## Categories

- `install` — binary on PATH, version, well-known dirs
- `auth` — API key env vars, OAuth tokens
- `config` — JSON / YAML parse, deprecated keys, schema mismatch
- `mcp` — server binary missing, server unreachable, duplicate names
- `skills` — frontmatter, size, reference broken, destructive command
- `rules` — Cursor / Windsurf rule formats
- `hooks` — script perms, shebang
- `permissions` — destructive allowlist
- `version` — outdated, deprecated
- `network` — registry / API reachability

## claude-code

| id | severity |
|---|---|
| `claude-code/install/binary-missing` | warning |
| `claude-code/install/path-shadowed` | warning |
| `claude-code/auth/anthropic-key-missing` | error |
| `claude-code/auth/anthropic-key-missing-malformed` | warning |
| `claude-code/config/settings-invalid-json` | error |
| `claude-code/config/settings-local-invalid-json` | error |
| `claude-code/config/settings-local-shadows-global` | info |
| `claude-code/config/claudemd-too-large` | warning |
| `claude-code/config/model-deprecated` | warning |
| `claude-code/config/mcp-invalid-json` | error |
| `claude-code/mcp/server-binary-missing` | error |
| `claude-code/mcp/server-binary-not-on-path` | warning |
| `claude-code/mcp/duplicate-server-name` | warning |
| `claude-code/skills/frontmatter-invalid` | error |
| `claude-code/skills/frontmatter-name-missing` | warning |
| `claude-code/skills/frontmatter-description-missing` | warning |
| `claude-code/skills/skill-too-large` | warning |
| `claude-code/skills/reference-broken` | warning |
| `claude-code/skills/duplicate-name` | warning |
| `claude-code/skills/destructive-command-unguarded` | warning |
| `claude-code/skills/trigger-too-broad` | info |
| `claude-code/hooks/script-missing` | error |
| `claude-code/hooks/script-not-executable` | warning |
| `claude-code/hooks/shebang-missing` | warning |
| `claude-code/permissions/destructive-allowed` | warning |

## cursor

| id | severity |
|---|---|
| `cursor/config/mcp-invalid-json` | error |
| `cursor/config/cursorrules-conflict-with-mdc` | warning |
| `cursor/config/mdc-frontmatter-missing` | warning |
| `cursor/config/mdc-frontmatter-invalid` | warning |
| `cursor/rules/file-too-large` | warning |
| `cursor/mcp/server-binary-missing` | error |
| `cursor/mcp/duplicate-server-name` | warning |

## codex

| id | severity |
|---|---|
| `codex/auth/openai-key-missing` | error |
| `codex/auth/openai-key-missing-malformed` | warning |
| `codex/config/config-invalid-json` | error |

## aider

| id | severity |
|---|---|
| `aider/config/yaml-extension-not-yml` | error |
| `aider/config/yaml-parse-error` | error |
| `aider/config/model-unknown` | info |
| `aider/auth/key-in-conf-not-env` | warning |
| `aider/auth/openai-key-missing` | error |

## windsurf

| id | severity |
|---|---|
| `windsurf/config/yaml-parse-error` | error |

## cline

| id | severity |
|---|---|
| `cline/config/mcp-invalid-json` | error |
| `cline/mcp/server-binary-missing` | error |
| `cline/skills/*` (same set as claude-code/skills) | – |

## goose

| id | severity |
|---|---|
| `goose/config/yaml-parse-error` | error |
| `goose/config/profile-missing` | warning |

## continue

| id | severity |
|---|---|
| `continue/config/yaml-parse-error` | error |
| `continue/config/json-parse-error` | error |
| `continue/config/legacy-json-detected` | warning |

## opencode

| id | severity |
|---|---|
| `opencode/config/json-parse-error` | error |
| `opencode/config/precedence-shadow` | info |

## roo

| id | severity |
|---|---|
| (probe only; no validators yet) | – |

## Cross-agent / internal

| id | severity |
|---|---|
| `<agent>/internal/adapter-error` | warning |
| `<agent>/internal/adapter-timeout` | warning |
