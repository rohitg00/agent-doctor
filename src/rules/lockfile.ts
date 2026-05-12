import type { ChangedFile, Diagnostic, ProjectGraph } from "../types.js";

export function lockfileMismatchRule(args: {
  changedFiles: ChangedFile[];
  detected: ProjectGraph;
}): Diagnostic[] {
  const manifestChanged = args.changedFiles.some(
    (f) => f.path.endsWith("package.json") && !f.path.includes("node_modules/"),
  );
  if (!manifestChanged) return [];

  const lockfiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"];
  const lockChanged = args.changedFiles.some((f) => lockfiles.includes(f.path.split("/").pop() ?? ""));

  if (!args.detected.hasLockfile) return [];
  if (lockChanged) return [];

  return [
    {
      id: "deps/manifest-lockfile-mismatch",
      severity: "warning",
      title: "package.json changed without a lockfile update",
      message:
        "Dependency manifest changed but the lockfile is unchanged. Install may behave differently in CI than locally.",
      evidence: args.changedFiles
        .filter((f) => f.path.endsWith("package.json"))
        .map((f) => ({ kind: "diff" as const, file: f.path, status: f.status })),
      confidence: "high",
      nextActions: [
        { label: "update the lockfile", command: lockUpdateCommand(args.detected.packageManager) },
      ],
    },
  ];
}

function lockUpdateCommand(pm: ProjectGraph["packageManager"]): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install --lockfile-only";
    case "yarn":
      return "yarn install --mode=update-lockfile";
    case "bun":
      return "bun install";
    case "npm":
      return "npm install --package-lock-only";
    default:
      return "install your package manager and re-run install";
  }
}
