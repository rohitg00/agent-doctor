# agent-doctor

Self-diagnostic for AI coding agents. One command, under a second, tells you exactly which of your installed agents are broken and how to fix them.

```sh
npx -y agent-doctor@latest
```

`agent-doctor` detects every AI coding agent on your machine (Claude Code, Cursor, Codex, Aider, Windsurf, Cline, Goose, Continue, OpenCode, Roo), validates configs / MCP / skills / hooks / auth / permissions, and prints concrete fixes for each problem.

It does **not** touch your files. Passive observer.

## Install

```sh
npx -y agent-doctor@latest
npm install -g agent-doctor
```

## Quick start

```sh
agent-doctor                              # scan every detected agent
agent-doctor --agent claude-code          # deep dive on one agent
agent-doctor --deep                       # include live probes (--version, MCP pings)
agent-doctor --json > report.json         # machine-readable
agent-doctor --ci                         # one-flag CI mode
```

## What it checks

Per agent (categories vary):

- **install** — binary on PATH, version, well-known install dirs probed when PATH is narrowed by `npx`
- **auth** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CODEIUM_API_KEY`, prefix validation
- **config** — JSON / YAML parse errors, deprecated models, settings.local shadowing
- **mcp** — server binary missing, server unreachable (with `--deep`), duplicate names
- **skills** — frontmatter invalid, oversized skill, broken references, destructive commands without approval language
- **rules** — Cursor `.mdc` frontmatter, `.cursorrules` vs `.cursor/rules/` conflict, rule files too large
- **hooks** — script not executable, missing shebang
- **permissions** — destructive commands in allowlist
- **version** — outdated, deprecated
- **network** — registry/API reachability (under `--deep`)

Real gotchas covered:

- aider `.aider.conf.yaml` is silently ignored (must be `.yml`)
- OpenCode 8-level config precedence — flagged when project shadows global
- Cursor `.cursorrules` legacy + `.cursor/rules/*.mdc` modern both active
- `npx` PATH narrowing — emits `install/path-shadowed` instead of `binary-missing` when binary lives in `~/.local/bin` or similar

## Output

Default report:

```
╭─────────────────────────────╮
│ ❯ agent-doctor  v1.0.0-rc.1 │
╰─────────────────────────────╯

  [✓]  claude-code      v2.0.14    healthy
  [⚠]  cursor           v0.45.3    1 warning   (MCP server unreachable)
  [✓]  codex            v0.9.1     healthy
  [✗]  aider            v0.71.0    2 errors    (missing OPENAI_API_KEY, stale config)
  [●]  windsurf                    not installed

  4 detected  ·  2 healthy  ·  1 with warnings  ·  1 with errors  (0.5s)

  → agent-doctor --agent aider     dig into errors
  → agent-doctor --deep            run live probes
```

Per-agent deep dive:

```
  config
    [⚠] claude-code/config/claudemd-too-large
        ├ CLAUDE.md is large
        ├ ~/.claude/CLAUDE.md is 26279 bytes; the file is loaded into every session
        └ fix: see: https://docs.anthropic.com/claude-code/memory

  mcp
    [✗] claude-code/mcp/server-binary-missing
        ├ MCP server "amplitude" command not found
        ├ "amplitude-mcp" is not on PATH or in any well-known install dir
        └ fix: install amplitude-mcp or fix the path in ~/.claude/mcp.json
```

## CLI

```text
agent-doctor [options]

--agent <id>          claude-code | cursor | codex | aider | windsurf |
                      cline | goose | continue | opencode | roo
--list                list detected agents and versions, no checks
--deep                slow checks (binary --version, MCP pings)
--no-network          hard-disable outbound sockets
--json                JSON report
--sarif [path]        SARIF 2.1.0
--junit [path]        JUnit XML
--annotations         GitHub Actions workflow commands (stderr)
--ignore <id>         silence a diagnostic id (repeatable)
--show-ignored        render suppressed diagnostics as info
--ci                  --no-color --no-unicode --json --fail-on warning
--fail-on <level>     error (default) | warning | none
--explain <id>        long-form explanation
--no-color / --no-unicode / --width <cols>
```

## Suppression

Two layers, deepest wins. Global at `~/.config/agent-doctor/ignore.json`, project at `.agent-doctor.json` in cwd.

```jsonc
{
  "ignore": [
    "claude-code/skills/skill-too-large",
    { "id": "*", "agent": "windsurf" },
    { "id": "claude-code/config/claudemd-too-large", "until": "2026-07-01" }
  ]
}
```

## Exit codes

- `0` healthy (or `--fail-on none`)
- `1` warnings or errors found, doctor completed
- `2` fatal (doctor itself could not run; corrupted config, permission denied)

## Design principles

- One command, zero setup.
- Default under 2 seconds. `--deep` opt-in for slow probes.
- Inline fix for every error — copy-pasteable command, file edit, or doc link.
- Passive observer. Never writes to your repo or your agent configs.
- No score inflation. Tally line replaces a single number.
- Suppression is explicit and per-id.

## Plugins

Custom adapters via `config.plugins` in `agent-doctor.config.json`:

```ts
import type { AgentAdapter } from "agent-doctor";

const myAdapter: AgentAdapter = {
  id: "my-agent",
  apiVersion: "1.0",
  async probe(cwd) { /* return AgentProbe */ },
  async validate(probe, ctx) { /* return Diagnostic[] */ },
};

export default { name: "my-org", apiVersion: "1.0", agents: [myAdapter] };
```

## Roadmap

- `--explain <id>` body (currently a stub)
- `--fix` for safe auto-remediation (off in v1.0; fix-hints only)
- More adapters: Crush, Trae, Kilo, Kiro, Antigravity, MCP-only setups
- Cached deep-probe results in `~/.cache/agent-doctor/`
- Plugin marketplace for org-specific checks

## License

[Apache-2.0](LICENSE)
