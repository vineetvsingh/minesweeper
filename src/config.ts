// Board sizes, logic levels and share codes. Codes and daily boards depend on the
// generator in engine.ts: changing it changes which board a code produces.
import { hash32, mulberry32 } from "./rng";

export type StdKey = "beginner" | "intermediate" | "expert";
export type DiffKey = StdKey | "custom";
export type LogicKey = "any" | "gentle" | "tough";

export interface Dims {
  r: number;
  c: number;
  m: number;
  name: string;
}

export const DIFFS: Record<StdKey, Dims & { code: string }> = {
  beginner: { r: 9, c: 9, m: 10, name: "Beginner", code: "B" },
  intermediate: { r: 16, c: 16, m: 40, name: "Intermediate", code: "I" },
  expert: { r: 16, c: 30, m: 99, name: "Expert", code: "E" },
};
export const isStd = (k: unknown): k is StdKey =>
  typeof k === "string" && Object.prototype.hasOwnProperty.call(DIFFS, k);

export const LOGICS: Record<LogicKey, { name: string; code: string }> = {
  any: { name: "Any", code: "a" },
  gentle: { name: "Gentle", code: "g" },
  tough: { name: "Tough", code: "t" },
};
export const isLogic = (k: unknown): k is LogicKey =>
  typeof k === "string" && Object.prototype.hasOwnProperty.call(LOGICS, k);

export const MAX_DENSITY = 0.25;
export const maxMines = (r: number, c: number): number =>
  Math.max(1, Math.min(Math.floor(r * c * MAX_DENSITY), r * c - 9));
export const validCustom = (r: number, c: number, m: number): boolean =>
  Number.isInteger(r) &&
  Number.isInteger(c) &&
  Number.isInteger(m) &&
  r >= 5 &&
  r <= 30 &&
  c >= 5 &&
  c <= 40 &&
  m >= 1 &&
  m <= maxMines(r, c);

export const toughTarget = (M: number): number => Math.max(2, Math.round(M / 14));
export const gradeOf = (hard: number, M: number): string =>
  hard === 0 ? "Gentle" : hard >= toughTarget(M) ? "Tough" : "Standard";

/** Everything needed to rebuild a board: size, logic, seed and the canonical start square. */
export interface BoardSpec {
  key: DiffKey;
  r: number;
  c: number;
  m: number;
  logic: LogicKey;
  seed: number;
  start: number;
  daily?: string | null;
}

export function formatCode(s: BoardSpec): string {
  const size = isStd(s.key) ? DIFFS[s.key].code : `${s.r}x${s.c}x${s.m}`;
  return [size, LOGICS[s.logic].code, s.seed.toString(36), s.start.toString(36)].join("-");
}

export function parseCode(raw: string): BoardSpec | null {
  const p = String(raw).trim().replace(/^.*#/, "").toLowerCase().split("-");
  if (p.length !== 4 || !/^[0-9a-z]+$/.test(p[2] + p[3])) return null;
  let key: DiffKey | undefined = (Object.keys(DIFFS) as StdKey[]).find(
    (k) => DIFFS[k].code.toLowerCase() === p[0],
  );
  let r: number, c: number, m: number;
  if (key) ({ r, c, m } = DIFFS[key]);
  else {
    const mm = /^(\d+)x(\d+)x(\d+)$/.exec(p[0]);
    if (!mm) return null;
    key = "custom";
    [r, c, m] = [+mm[1], +mm[2], +mm[3]];
    if (!validCustom(r, c, m)) return null;
  }
  const logic = (Object.keys(LOGICS) as LogicKey[]).find((k) => LOGICS[k].code === p[1]);
  const seed = parseInt(p[2], 36),
    start = parseInt(p[3], 36);
  if (!logic || !(seed < 4294967296) || !(start < r * c)) return null;
  return { key, r, c, m, logic, seed, start };
}

export const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Today's board for a difficulty: the same for everyone on the same date. */
export function dailySpec(key: StdKey, date: string): BoardSpec {
  const d = DIFFS[key],
    seed = hash32(`nogs|${date}|${key}`),
    rng = mulberry32(seed ^ 0x9e3779b9),
    r = 1 + Math.floor(rng() * (d.r - 2)),
    c = 1 + Math.floor(rng() * (d.c - 2));
  return { key, r: d.r, c: d.c, m: d.m, logic: "any", seed, start: r * d.c + c, daily: date };
}
