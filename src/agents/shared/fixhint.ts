import type { FixHint } from "../../types.js";

export function renderFixHint(fix: FixHint | undefined): string[] {
  if (!fix) return [];
  switch (fix.kind) {
    case "command":
      return [fix.sudo ? `sudo ${fix.run}` : fix.run];
    case "env-set":
      return [
        `export ${fix.name}=${fix.example ?? `<your-${fix.name.toLowerCase()}>`}`,
        `# add the line above to ~/.${fix.shell ?? "zshrc"}`,
      ];
    case "file-edit": {
      const target = fix.path;
      if (fix.replace) return [`# in ${target}`, `# replace: ${fix.replace.from}`, `# with:    ${fix.replace.to}`];
      if (fix.insert) return [`# in ${target}`, `# insert:`, fix.insert];
      if (fix.keyPath !== undefined && fix.value !== undefined) {
        return [`# in ${target}`, `# set ${fix.keyPath} = ${JSON.stringify(fix.value)}`];
      }
      if (fix.keyPath !== undefined) return [`# in ${target}`, `# edit key: ${fix.keyPath}`];
      return [`# edit ${target}`];
    }
    case "reinstall":
      return [fix.instruction];
    case "doc":
      return [`see: ${fix.url}${fix.anchor ? `#${fix.anchor}` : ""}`];
  }
}
