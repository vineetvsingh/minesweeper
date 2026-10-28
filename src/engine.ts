// No-guess board generation, the deduction solver and hint explanations.
// Pure logic with no DOM access, so it runs in the page, in a worker and under tests.

export interface Geom {
  R: number;
  C: number;
  N: number;
  /** The up-to-8 neighbours of each square. */
  nb: number[][];
  /** Squares within two steps, used to find overlapping numbers. */
  near: number[][];
}

/** Why a square was deduced. Rule 1: one number. Rule 2: two overlapping numbers. Rule 3: total mine count. */
export type Why =
  | { rule: 1; a: number; rem: number; known: number; safe: number }
  | { rule: 2; a: number; b: number; ra: number; rb: number; ox: number }
  | { rule: 3; rem: number; left: number };

export interface Deduction {
  /** 1 safe, 2 mine, 0 unchanged. */
  out: Uint8Array;
  rule: 1 | 2 | 3;
  why: Map<number, Why> | null;
}

export interface GenOptions {
  /** 1 limits the solver to single numbers (Gentle boards). */
  maxRule?: number;
  /** Ask for at least this many rounds that need more than single numbers. */
  minHard?: number;
  maxTries?: number;
  hardTries?: number;
}

export interface Generated {
  mines: Uint8Array<ArrayBuffer>;
  cnt: Uint8Array;
  tries: number;
  moves: number;
  hard: number;
}

export interface Explanation {
  target: number;
  why: Why;
  /** The state the reason was found in (2 known mine, 3 known safe). */
  state: Uint8Array;
  /** Whether earlier deductions were needed first. */
  deduced: boolean;
}

export type Rng = () => number;

const cache = new Map<string, Geom>();

export function geom(R: number, C: number): Geom {
  const key = R + "x" + C;
  const hit = cache.get(key);
  if (hit) return hit;
  const N = R * C,
    nb: number[][] = new Array(N),
    near: number[][] = new Array(N);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const a: number[] = [],
        b: number[] = [];
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr,
            cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= R || cc >= C) continue;
          const j = rr * C + cc;
          b.push(j);
          if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) a.push(j);
        }
      nb[r * C + c] = a;
      near[r * C + c] = b;
    }
  const g = { R, C, N, nb, near };
  cache.set(key, g);
  return g;
}

export function counts(g: Geom, mines: Uint8Array): Uint8Array {
  const cnt = new Uint8Array(g.N);
  for (let i = 0; i < g.N; i++) if (mines[i]) for (const n of g.nb[i]) cnt[n]++;
  return cnt;
}

// Minimum clicks to clear a board without flags: one per opening, plus
// one per numbered square that no opening reveals.
export function bbbv(g: Geom, mines: Uint8Array, cnt: Uint8Array): number {
  const seen = new Uint8Array(g.N),
    stack: number[] = [];
  let n = 0;
  for (let i = 0; i < g.N; i++) {
    if (mines[i] || cnt[i] || seen[i]) continue;
    n++;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of g.nb[x]) {
        if (seen[y]) continue;
        seen[y] = 1;
        if (!cnt[y]) stack.push(y);
      }
    }
  }
  for (let i = 0; i < g.N; i++) if (!mines[i] && !seen[i]) n++;
  return n;
}

interface Constraint {
  i: number;
  unk: number[];
  rem: number;
}

// state: 0 unknown, 1 open, 2 known mine, 3 known safe but not opened.
// Returns null if stuck. Uses only numbers on open squares, so it sees exactly
// what a player sees. maxRule 1 skips the pair rule. With explain, why maps each
// square to its reason.
export function deduce(
  g: Geom,
  cnt: Uint8Array,
  state: Uint8Array,
  M: number,
  maxRule = 3,
  explain = false,
): Deduction | null {
  const N = g.N,
    nb = g.nb,
    out = new Uint8Array(N),
    why = explain ? new Map<number, Why>() : null;
  const cons: Constraint[] = [],
    at = new Int32Array(N).fill(-1);
  let found = false;

  // Rule 1: a number whose remaining mines equal 0 or equal its unknown neighbours.
  for (let i = 0; i < N; i++) {
    if (state[i] !== 1 || cnt[i] === 0) continue;
    const unk: number[] = [];
    let fl = 0,
      sf = 0;
    for (const n of nb[i]) {
      const s = state[n];
      if (s === 0) unk.push(n);
      else if (s === 2) fl++;
      else if (s === 3) sf++;
    }
    if (!unk.length) continue;
    const rem = cnt[i] - fl;
    if (rem === 0 || rem === unk.length) {
      const v = rem === 0 ? 1 : 2;
      for (const u of unk) {
        out[u] = v;
        if (why && !why.has(u)) why.set(u, { rule: 1, a: i, rem, known: fl, safe: sf });
      }
      found = true;
    } else {
      at[i] = cons.length;
      cons.push({ i, unk, rem });
    }
  }
  if (found) return { out, rule: 1, why };

  // Rule 2: overlapping pairs (covers the 1-1 and 1-2 patterns and subset logic).
  if (maxRule >= 2) {
    const markA = new Int32Array(N),
      markB = new Int32Array(N);
    let sb = 0;
    for (let a = 0; a < cons.length; a++) {
      const A = cons[a],
        sa = a + 1;
      for (const u of A.unk) markA[u] = sa;
      for (const j of g.near[A.i]) {
        const b = at[j];
        if (b <= a) continue;
        const B = cons[b];
        let shared = 0,
          onlyB = 0;
        for (const u of B.unk) {
          if (markA[u] === sa) shared++;
          else onlyB++;
        }
        if (!shared) continue;
        const onlyA = A.unk.length - shared;
        if (!onlyA && !onlyB) continue;
        const d = A.rem - B.rem;
        let aMines: boolean;
        if (d === onlyA) aMines = true;
        else if (-d === onlyB) aMines = false;
        else continue;
        // X is the number whose own squares are all mines; Y's own squares are safe.
        const X = aMines ? A : B,
          Y = aMines ? B : A,
          w: Why | null = why && {
            rule: 2,
            a: X.i,
            b: Y.i,
            ra: X.rem,
            rb: Y.rem,
            ox: aMines ? onlyA : onlyB,
          };
        sb++;
        for (const u of B.unk) markB[u] = sb;
        for (const u of A.unk)
          if (markB[u] !== sb) {
            out[u] = aMines ? 2 : 1;
            if (w && why && !why.has(u)) why.set(u, w);
          }
        for (const u of B.unk)
          if (markA[u] !== sa) {
            out[u] = aMines ? 1 : 2;
            if (w && why && !why.has(u)) why.set(u, w);
          }
        found = true;
      }
    }
    if (found) return { out, rule: 2, why };
  }

  // Rule 3: total mine count.
  let known = 0,
    unknown = 0;
  for (let i = 0; i < N; i++) {
    if (state[i] === 2) known++;
    else if (state[i] === 0) unknown++;
  }
  const rem = M - known;
  if (unknown && (rem === 0 || rem === unknown)) {
    const v = rem === 0 ? 1 : 2;
    for (let i = 0; i < N; i++)
      if (state[i] === 0) {
        out[i] = v;
        if (why) why.set(i, { rule: 3, rem, left: unknown });
      }
    return { out, rule: 3, why };
  }
  return null;
}

// hard counts the rounds where single numbers were not enough.
export function solve(
  g: Geom,
  cnt: Uint8Array,
  mines: Uint8Array,
  M: number,
  start: number,
  maxRule = 3,
): { ok: boolean; state: Uint8Array; hard: number } {
  const state = new Uint8Array(g.N),
    stack: number[] = [];
  let opened = 0,
    hard = 0;
  const open = (i: number) => {
    stack.push(i);
    while (stack.length) {
      const x = stack.pop()!;
      if (state[x] !== 0) continue;
      if (mines[x]) throw new Error("solver opened a mine");
      state[x] = 1;
      opened++;
      if (cnt[x] === 0) for (const n of g.nb[x]) if (state[n] === 0) stack.push(n);
    }
  };
  open(start);
  const target = g.N - M;
  while (opened < target) {
    const r = deduce(g, cnt, state, M, maxRule);
    if (!r) break;
    if (r.rule > 1) hard++;
    const out = r.out;
    for (let i = 0; i < g.N; i++) {
      if (out[i] === 1) open(i);
      else if (out[i] === 2) state[i] = 2;
    }
  }
  return { ok: opened === target, state, hard };
}

// Yields between solver runs so a caller on the main thread can stay responsive.
// rng makes boards reproducible from a seed. If opt.minHard can't be met, the
// hardest board found after opt.hardTries solved boards is returned. Returns null
// if nothing works.
export function* generate(
  R: number,
  C: number,
  M: number,
  start: number,
  rng: Rng,
  opt: GenOptions = {},
): Generator<void, Generated | null, void> {
  const g = geom(R, C),
    N = g.N,
    maxRule = opt.maxRule || 3,
    minHard = opt.minHard || 0,
    maxTries = opt.maxTries || 300,
    hardTries = opt.hardTries || 30;
  const excl = new Uint8Array(N);
  excl[start] = 1;
  for (const n of g.nb[start]) excl[n] = 1;
  const pool: number[] = [];
  for (let i = 0; i < N; i++) if (!excl[i]) pool.push(i);
  if (M > pool.length) return null;
  let moves = 0,
    solved = 0,
    best: Generated | null = null;
  for (let tries = 1; tries <= maxTries; tries++) {
    const mines = new Uint8Array(N),
      p = pool.slice();
    for (let k = 0; k < M; k++) {
      const j = k + Math.floor(rng() * (p.length - k));
      const t = p[k];
      p[k] = p[j];
      p[j] = t;
      mines[p[k]] = 1;
    }
    // When the solver gets stuck, move one mine off the stuck edge into
    // untouched ground and solve again from scratch.
    for (let step = 0; step < 80; step++) {
      const cnt = counts(g, mines);
      const res = solve(g, cnt, mines, M, start, maxRule);
      if (res.ok) {
        const found: Generated = { mines, cnt, tries, moves, hard: res.hard };
        if (res.hard >= minHard) return found;
        if (!best || res.hard > best.hard) best = found;
        if (++solved >= hardTries) return best;
        break;
      }
      yield;
      const st = res.state,
        edgeMines: number[] = [],
        inner: number[] = [];
      for (let i = 0; i < N; i++) {
        if (st[i] === 1) continue;
        let edge = false;
        for (const n of g.nb[i])
          if (st[n] === 1) {
            edge = true;
            break;
          }
        if (edge) {
          if (st[i] === 0 && mines[i]) edgeMines.push(i);
        } else if (!mines[i]) inner.push(i);
      }
      if (!edgeMines.length || !inner.length) break;
      const a = edgeMines[Math.floor(rng() * edgeMines.length)];
      const b = inner[Math.floor(rng() * inner.length)];
      mines[a] = 0;
      mines[b] = 1;
      moves++;
    }
    yield;
  }
  return best;
}

/** Runs a generator to completion in one go. */
export function generateNow(...args: Parameters<typeof generate>): Generated | null {
  const it = generate(...args);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Works forward from what is open now, marking deduced mines and safe squares,
// until pick(out) returns the square it wants.
export function explain(
  g: Geom,
  cnt: Uint8Array,
  open: Uint8Array,
  M: number,
  pick: (out: Uint8Array) => number,
): Explanation | null {
  const state = new Uint8Array(g.N);
  for (let i = 0; i < g.N; i++) state[i] = open[i] ? 1 : 0;
  for (let step = 0; step < g.N; step++) {
    const r = deduce(g, cnt, state, M, 3, true);
    if (!r || !r.why) return null;
    const t = pick(r.out);
    if (t >= 0) return { target: t, why: r.why.get(t)!, state, deduced: step > 0 };
    for (let i = 0; i < g.N; i++) if (r.out[i]) state[i] = r.out[i] === 2 ? 2 : 3;
  }
  return null;
}

/** The square marked v in out that is closest to ref, or -1. */
export function nearest(g: Geom, out: Uint8Array, v: number, ref: number): number {
  let bestI = -1,
    bestD = Infinity;
  const rr = Math.floor(ref / g.C),
    rc = ref % g.C;
  for (let i = 0; i < g.N; i++) {
    if (out[i] !== v) continue;
    const d = Math.max(Math.abs(Math.floor(i / g.C) - rr), Math.abs((i % g.C) - rc));
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}
