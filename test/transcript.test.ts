import { describe, it, before, after } from "node:test";
import { strictEqual, ok } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestEvidence } from "../src/evidence/transcript.ts";

describe("ingestEvidence()", () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "ad-evd-"));
    const jsonl = [
      JSON.stringify({ type: "skill", skill: "imagegen", timestamp: "2026-05-13T00:00:00Z" }),
      JSON.stringify({ type: "tool_use", tool_use: { name: "Read" } }),
      JSON.stringify({ type: "command", command: "pnpm test", exit: 0 }),
      JSON.stringify({ type: "command", command: "pnpm typecheck" }),
      JSON.stringify({ type: "file.edited", path: "src/x.ts" }),
      "this is not json",
    ].join("\n");
    await writeFile(join(dir, "session.jsonl"), jsonl);
    await writeFile(join(dir, "plain.txt"), `\n$ pnpm install\n$ pnpm build\nfinished\n`);
    await writeFile(
      join(dir, "blob.json"),
      JSON.stringify([{ type: "skill", skill: "design-html" }]),
    );
  });
  after(async () => { await rm(dir, { recursive: true, force: true }); });

  it("parses jsonl with mixed event shapes", async () => {
    const events = await ingestEvidence([join(dir, "session.jsonl")], "/");
    const types = events.map((e) => e.type);
    ok(types.includes("skill.loaded"));
    ok(types.includes("tool.called"));
    ok(types.includes("command.finished"));
    ok(types.includes("command.started"));
    ok(types.includes("file.edited"));
  });

  it("reads plain shell prompts as command.started", async () => {
    const events = await ingestEvidence([join(dir, "plain.txt")], "/");
    const cmds = events.filter((e) => e.type === "command.started").map((e) => e.command);
    ok(cmds.includes("pnpm install"));
    ok(cmds.includes("pnpm build"));
  });

  it("reads single-object and array JSON files", async () => {
    const events = await ingestEvidence([join(dir, "blob.json")], "/");
    strictEqual(events.length, 1);
    strictEqual(events[0]!.type, "skill.loaded");
    strictEqual(events[0]!.name, "design-html");
  });

  it("ingests a directory of evidence", async () => {
    const events = await ingestEvidence([dir], "/");
    ok(events.length >= 6);
  });
});
