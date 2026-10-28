import { describe, expect, it } from "vitest";
import { bbbv, counts, explain, generateNow, geom, nearest, solve } from "../src/engine";
import { dailySpec, formatCode, parseCode, toughTarget } from "../src/config";
import { mulberry32 } from "../src/rng";

const build = (R: number, C: number, M: number, start: number, seed: number, opt = {}) => {
  const v = generateNow(R, C, M, start, mulberry32(seed), opt);
  if (!v) throw new Error("no board");
  return v;
};

describe("generate", () => {
  it.each([
    [9, 9, 10],
    [16, 16, 40],
    [16, 30, 99],
  ])("builds %ix%i boards with %i mines that the solver clears", (R, C, M) => {
    const g = geom(R, C);
    for (let seed = 1; seed <= 8; seed++) {
      const start = Math.floor(R / 2) * C + Math.floor(C / 2);
      const v = build(R, C, M, start, seed);
      expect(v.mines.reduce((a, b) => a + b, 0)).toBe(M);
      expect(v.mines[start]).toBe(0);
      for (const n of g.nb[start]) expect(v.mines[n]).toBe(0);
      expect(solve(g, v.cnt, v.mines, M, start).ok).toBe(true);
    }
  });

  it("is deterministic for a seed", () => {
    const a = build(16, 30, 99, 100, 42),
      b = build(16, 30, 99, 100, 42);
    expect(Array.from(a.mines)).toEqual(Array.from(b.mines));
  });

  it("gentle boards need no pattern steps", () => {
    const v = build(16, 30, 99, 200, 7, { maxRule: 1 });
    expect(v.hard).toBe(0);
  });

  it("tough boards usually meet their target", () => {
    let met = 0;
    for (let seed = 1; seed <= 6; seed++)
      if (build(16, 16, 40, 136, seed, { minHard: toughTarget(40) }).hard >= toughTarget(40)) met++;
    expect(met).toBeGreaterThanOrEqual(4);
  });
});

describe("hints", () => {
  it("only ever point at safe squares, with a reason, and clear the board", () => {
    const R = 16,
      C = 30,
      M = 99,
      start = 5 * C + 7,
      g = geom(R, C),
      v = build(R, C, M, start, 3),
      open = new Uint8Array(g.N);
    const dig = (i: number) => {
      const st = [i];
      while (st.length) {
        const x = st.pop()!;
        if (open[x]) continue;
        open[x] = 1;
        if (!v.cnt[x]) st.push(...g.nb[x]);
      }
    };
    dig(start);
    for (;;) {
      const res = explain(g, v.cnt, open, M, (out) => nearest(g, out, 1, 0));
      if (!res) break;
      expect(v.mines[res.target]).toBe(0);
      expect(res.why).toBeTruthy();
      dig(res.target);
    }
    expect(open.reduce((a, b) => a + b, 0)).toBe(g.N - M);
  });

  it("can prove a mine is a mine", () => {
    const g = geom(9, 9),
      v = build(9, 9, 10, 40, 5),
      open = new Uint8Array(g.N);
    const st = [40];
    while (st.length) {
      const x = st.pop()!;
      if (open[x]) continue;
      open[x] = 1;
      if (!v.cnt[x]) st.push(...g.nb[x]);
    }
    const res = explain(g, v.cnt, open, 10, (out) => out.findIndex((x) => x === 2));
    expect(res).not.toBeNull();
    expect(v.mines[res!.target]).toBe(1);
  });
});

describe("3BV", () => {
  it("counts one click for a board with no mines", () => {
    const g = geom(5, 5),
      mines = new Uint8Array(25);
    expect(bbbv(g, mines, counts(g, mines))).toBe(1);
  });
});

describe("codes", () => {
  it("round-trip standard and custom boards", () => {
    const spec = { key: "expert", r: 16, c: 30, m: 99, logic: "tough", seed: 123456789, start: 77 } as const;
    expect(parseCode(formatCode(spec))).toEqual(spec);
    const custom = { key: "custom", r: 12, c: 20, m: 40, logic: "any", seed: 5, start: 3 } as const;
    expect(parseCode(formatCode(custom))).toEqual(custom);
  });
  it("reject malformed codes", () => {
    for (const bad of ["", "nonsense", "E-a-zz-99999", "50x50x9-a-1-1", "E-q-1-1", "E-a-!!-1"])
      expect(parseCode(bad)).toBeNull();
  });
  it("give the same daily board for the same date", () => {
    expect(dailySpec("expert", "2026-10-28")).toEqual(dailySpec("expert", "2026-10-28"));
    expect(dailySpec("expert", "2026-10-28").seed).not.toBe(dailySpec("expert", "2026-10-29").seed);
  });
});
