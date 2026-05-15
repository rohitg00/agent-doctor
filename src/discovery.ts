import { claudeCodeAdapter } from "./agents/claude-code.js";
import { cursorAdapter } from "./agents/cursor.js";
import { codexAdapter } from "./agents/codex.js";
import { aiderAdapter } from "./agents/aider.js";
import { windsurfAdapter } from "./agents/windsurf.js";
import { clineAdapter } from "./agents/cline.js";
import { gooseAdapter } from "./agents/goose.js";
import { continueAdapter } from "./agents/continue.js";
import { opencodeAdapter } from "./agents/opencode.js";
import { rooAdapter } from "./agents/roo.js";
import type { AgentAdapter } from "./plugin-api.js";

export const BUILTIN_ADAPTERS: AgentAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  codexAdapter,
  aiderAdapter,
  windsurfAdapter,
  clineAdapter,
  gooseAdapter,
  continueAdapter,
  opencodeAdapter,
  rooAdapter,
];
