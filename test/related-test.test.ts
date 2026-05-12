import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { noRelatedTestRule } from "../src/rules/related-test.ts";

describe("noRelatedTestRule()", () => {
  it("fires for a source file with no matching test", () => {
    const out = noRelatedTestRule({
      changedFiles: [{ path: "src/pricing.ts", status: "modified" }],
    });
    strictEqual(out.length, 1);
    strictEqual(out[0]!.id, "tests/no-related-test-change");
  });

  it("does not fire when a sibling .test.ts changed", () => {
    const out = noRelatedTestRule({
      changedFiles: [
        { path: "src/pricing.ts", status: "modified" },
        { path: "src/pricing.test.ts", status: "modified" },
      ],
    });
    strictEqual(out.length, 0);
  });

  it("does not fire for docs/json/yaml/types-only changes", () => {
    const out = noRelatedTestRule({
      changedFiles: [
        { path: "README.md", status: "modified" },
        { path: "config.json", status: "modified" },
        { path: "src/types.ts", status: "modified" },
      ],
    });
    strictEqual(out.length, 0);
  });

  it("does not fire for deleted files", () => {
    const out = noRelatedTestRule({
      changedFiles: [{ path: "src/old.ts", status: "deleted" }],
    });
    strictEqual(out.length, 0);
  });
});
