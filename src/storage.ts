// Settings, stats and daily results, kept in this browser's localStorage.
import { isStd, type DiffKey, type LogicKey, type StdKey } from "./config";

export function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
}
export function save(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export type TapMode = "dig" | "flag";
export type Theme = "auto" | "light" | "dark";
export interface Settings {
  diff: DiffKey;
  logic: LogicKey;
  mode: TapMode;
  zoom: number;
  sound: boolean;
  theme: Theme;
  custom: { r: number; c: number; m: number };
}
export const S: Settings = Object.assign(
  {
    diff: load<DiffKey>("nogs-diff", "beginner"),
    logic: "any",
    mode: "dig",
    zoom: 1,
    sound: false,
    theme: "auto",
    custom: { r: 12, c: 20, m: 40 },
  } satisfies Settings,
  load<Partial<Settings>>("nogs-settings", {}),
);
export const saveSettings = (): void => save("nogs-settings", S);

export interface WinEntry {
  /** seconds */
  s: number;
  bv: number;
  /** efficiency, percent */
  eff: number;
  /** 3BV per second */
  rate: number;
  /** hints used */
  h: number;
  /** date, YYYY-MM-DD */
  d: string;
  /** logic grade */
  l: string;
}
export interface Stat {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  best: number | null;
  bestRate: number | null;
  recent: WinEntry[];
}
export const emptyStat = (): Stat => ({
  played: 0,
  won: 0,
  streak: 0,
  bestStreak: 0,
  best: null,
  bestRate: null,
  recent: [],
});

// Best times from the first version are carried over.
export const ST: Partial<Record<StdKey, Stat>> =
  load<Partial<Record<StdKey, Stat>> | null>("nogs-stats", null) ??
  (() => {
    const old = load<Record<string, number>>("nogs-best", {}),
      o: Partial<Record<StdKey, Stat>> = {};
    for (const k in old) if (isStd(k)) o[k] = Object.assign(emptyStat(), { best: old[k] });
    return o;
  })();
export const statOf = (k: StdKey): Stat => (ST[k] = Object.assign(emptyStat(), ST[k]));
export const saveStats = (): void => save("nogs-stats", ST);

export interface DailyEntry {
  s: number;
  h: number;
}
/** Keyed by "YYYY-MM-DD|difficulty". */
export const DL: Record<string, DailyEntry> = load("nogs-daily", {});
export const saveDaily = (): void => save("nogs-daily", DL);
export const dailyKey = (date: string, key: StdKey): string => `${date}|${key}`;
