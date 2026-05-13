import { describe, it, before } from "node:test";
import { strictEqual, ok } from "node:assert";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSkills } from "../src/rules/skills.ts";
import type { SkillDefinition } from "../src/types.ts";

let tmp: string;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), "agent-doctor-test-"));
  await mkdir(join(tmp, ".codex/skills/imagegen"), { recursive: true });
  await writeFile(join(tmp, ".codex/skills/imagegen/SKILL.md"), "");
  await writeFile(join(tmp, "scripts.ok.sh"), "echo ok");
});

describe("auditSkills()", () => {
  it("fires frontmatter-invalid on malformed YAML", () => {
    const skill: SkillDefinition = {
      path: "/x/SKILL.md",
      frontmatter: { __parse_error__: true },
      body: "",
      bytes: 100,
    };
    const out = auditSkills({ skills: [skill], cwd: "/x", config: {} });
    ok(out.some((d) => d.id === "agent/skill-frontmatter-invalid" && d.severity === "error"));
  });

  it("warns on missing name and description", () => {
    const skill: SkillDefinition = {
      path: "/x/SKILL.md",
      frontmatter: {},
      body: "body",
      bytes: 4,
    };
    const out = auditSkills({ skills: [skill], cwd: "/x", config: {} });
    const ids = out.map((d) => d.id);
    ok(ids.filter((id) => id === "agent/skill-frontmatter-invalid").length >= 2);
  });

  it("warns when skill exceeds inline byte budget", () => {
    const skill: SkillDefinition = {
      path: "/x/SKILL.md",
      name: "x",
      description: "do the thing in a meaningful way",
      frontmatter: { name: "x", description: "do the thing in a meaningful way" },
      body: "body",
      bytes: 1_000_000,
    };
    const out = auditSkills({ skills: [skill], cwd: "/x", config: { skills: { maxInlineBytes: 1000 } } });
    ok(out.some((d) => d.id === "agent/skill-too-large"));
  });

  it("flags broken references and accepts existing ones", () => {
    const skill: SkillDefinition = {
      path: join(tmp, ".codex/skills/imagegen/SKILL.md"),
      name: "imagegen",
      description: "image generation skill for the demo",
      frontmatter: { name: "imagegen", description: "image generation skill for the demo" },
      body: "Run [setup](../../../scripts.ok.sh) then [resize](./resize.js)",
      bytes: 200,
    };
    const out = auditSkills({ skills: [skill], cwd: tmp, config: {} });
    const broken = out.filter((d) => d.id === "agent/skill-reference-broken");
    strictEqual(broken.length, 1);
    ok(broken[0]!.message.includes("./resize.js"));
  });

  it("flags unguarded destructive commands", () => {
    const skill: SkillDefinition = {
      path: "/x/SKILL.md",
      name: "danger",
      description: "this skill does cleanup work in the working tree",
      frontmatter: { name: "danger", description: "this skill does cleanup work in the working tree" },
      body: "First run:\n```sh\nrm -rf node_modules\n```\nThen continue.",
      bytes: 200,
    };
    const out = auditSkills({ skills: [skill], cwd: "/x", config: {} });
    ok(out.some((d) => d.id === "agent/destructive-command-unguarded"));
  });

  it("does NOT flag destructive commands when approval language is nearby", () => {
    const skill: SkillDefinition = {
      path: "/x/SKILL.md",
      name: "danger",
      description: "this skill does cleanup work in the working tree",
      frontmatter: { name: "danger", description: "this skill does cleanup work in the working tree" },
      body: "Ask the user to confirm before destructive work. Then:\n```sh\nrm -rf node_modules\n```",
      bytes: 200,
    };
    const out = auditSkills({ skills: [skill], cwd: "/x", config: {} });
    strictEqual(out.filter((d) => d.id === "agent/destructive-command-unguarded").length, 0);
  });
});
