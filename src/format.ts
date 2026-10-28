export const fmt3 = (n: number): string =>
  n < 0 ? "-" + String(Math.min(-n, 99)).padStart(2, "0") : String(Math.min(n, 999)).padStart(3, "0");

export const fmtS = (s: number): string => (s < 100 ? s.toFixed(2) : s.toFixed(1)) + " s";

export const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? "" : "s"}`;

export const fmtDate = (s: string): string =>
  new Date(s + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
