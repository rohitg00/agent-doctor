export interface ThemeOptions {
  color: boolean;
  unicode: boolean;
}

export const PALETTE = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  ember: "\x1b[38;5;42m",
  mint: "\x1b[38;5;121m",
  forest: "\x1b[38;5;28m",
  moss: "\x1b[38;5;65m",
  pine: "\x1b[38;5;22m",
  lime: "\x1b[38;5;46m",
  bgPine: "\x1b[48;5;22m",
  amber: "\x1b[38;5;220m",
  rust: "\x1b[38;5;203m",
  cloud: "\x1b[38;5;250m",
  fog: "\x1b[38;5;244m",
  charcoal: "\x1b[38;5;240m",
} as const;

export type Tone = keyof typeof PALETTE;

export function paint(text: string, tone: Tone, opts: ThemeOptions): string {
  if (!opts.color) return text;
  return `${PALETTE[tone]}${text}${PALETTE.reset}`;
}

export function compose(text: string, tones: Tone[], opts: ThemeOptions): string {
  if (!opts.color) return text;
  return `${tones.map((t) => PALETTE[t]).join("")}${text}${PALETTE.reset}`;
}

export const GLYPH = {
  unicode: {
    check: "✓",
    cross: "✗",
    warn: "⚠",
    info: "●",
    bullet: "•",
    arrow: "❯",
    branchT: "│",
    branchL: "└",
    branchM: "├",
    hLine: "─",
    hHeavy: "━",
    boxTL: "╭",
    boxTR: "╮",
    boxBL: "╰",
    boxBR: "╯",
    boxV: "│",
    boxH: "─",
    barFull: "▰",
    barEmpty: "▱",
  },
  ascii: {
    check: "v",
    cross: "x",
    warn: "!",
    info: "o",
    bullet: "*",
    arrow: ">",
    branchT: "|",
    branchL: "`",
    branchM: "|",
    hLine: "-",
    hHeavy: "=",
    boxTL: "+",
    boxTR: "+",
    boxBL: "+",
    boxBR: "+",
    boxV: "|",
    boxH: "-",
    barFull: "#",
    barEmpty: ".",
  },
} as const;

export type Glyphs = { [K in keyof typeof GLYPH.unicode]: string };

export function glyphs(opts: ThemeOptions): Glyphs {
  return opts.unicode ? GLYPH.unicode : GLYPH.ascii;
}

export function progressBar(score: number, width: number, opts: ThemeOptions): string {
  const g = glyphs(opts);
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * width);
  const empty = width - filled;
  const full = g.barFull.repeat(filled);
  const blank = g.barEmpty.repeat(empty);
  if (!opts.color) return `${full}${blank}`;
  const tone: Tone =
    score >= 90 ? "lime" : score >= 75 ? "ember" : score >= 55 ? "amber" : "rust";
  return `${paint(full, tone, opts)}${paint(blank, "charcoal", opts)}`;
}

export function banner(version: string, opts: ThemeOptions): string {
  const g = glyphs(opts);
  const title = `${g.arrow} agent-doctor`;
  const sub = `v${version}`;
  const inner = ` ${title}  ${paint(sub, "charcoal", opts)} `;
  const visibleLen = stripAnsi(inner).length;
  const top = `${g.boxTL}${g.boxH.repeat(visibleLen)}${g.boxTR}`;
  const bottom = `${g.boxBL}${g.boxH.repeat(visibleLen)}${g.boxBR}`;
  const mid = `${g.boxV}${inner}${g.boxV}`;
  const colored = (s: string): string => paint(s, "ember", opts);
  return [colored(top), `${colored(g.boxV)}${inner}${colored(g.boxV)}`, colored(bottom)]
    .join("\n")
    .replace(top, colored(top))
    .replace(bottom, colored(bottom))
    .replace(mid, `${colored(g.boxV)}${inner}${colored(g.boxV)}`);
}

export function rule(width: number, opts: ThemeOptions): string {
  const g = glyphs(opts);
  return paint(g.hLine.repeat(width), "charcoal", opts);
}

export function sectionHeader(title: string, opts: ThemeOptions): string {
  const g = glyphs(opts);
  return `\n${paint(`${g.arrow} ${title}`, "ember", opts)}`;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
