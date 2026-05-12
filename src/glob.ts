const SS = String.fromCharCode(1);
const D = String.fromCharCode(2);
const S = String.fromCharCode(3);
const Q = String.fromCharCode(4);

export function globToRegex(glob: string): RegExp {
  const replaced = glob
    .replace(/\*\*\//g, SS)
    .replace(/\*\*/g, D)
    .replace(/\*/g, S)
    .replace(/\?/g, Q)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .split(SS)
    .join("(?:.*/)?")
    .split(D)
    .join(".*")
    .split(S)
    .join("[^/]*")
    .split(Q)
    .join(".");
  return new RegExp(`^${replaced}$`);
}
