// Game UI: rendering, input, timer, stats, codes, replay and dialogs.
import {
  DIFFS,
  LOGICS,
  dailySpec,
  formatCode,
  gradeOf,
  isLogic,
  isStd,
  maxMines,
  parseCode,
  today,
  toughTarget,
  validCustom,
  type BoardSpec,
  type DiffKey,
  type LogicKey,
} from "./config";
import { bbbv, counts, explain, geom, nearest, type Explanation, type Geom } from "./engine";
import { fmt3, fmtDate, fmtS, plural } from "./format";
import {
  bump,
  clearConfetti,
  confetti,
  dialogIn,
  fadeIn,
  motionOK,
  nudge,
  popIn,
  shake,
  syncThumb,
  toast,
} from "./fx";
import { cancelGeneration, generateBoard } from "./generate";
import { randomSeed } from "./rng";
import { playSound, wakeAudio, type SoundName } from "./sound";
import { statsHtml } from "./stats";
import {
  DL,
  S,
  ST,
  dailyKey,
  load,
  save,
  saveDaily,
  saveSettings,
  saveStats,
  statOf,
  type TapMode,
  type Theme,
} from "./storage";

type MoveType = "d" | "c" | "f" | "h";
/** [ms since the timer started, action, square] */
type Move = [number, MoveType, number];

interface Info {
  ms: number;
  hard: number | null;
  bv: number;
}
interface LossCtx {
  boom: number;
  chord: number;
}

interface Game {
  key: DiffKey;
  R: number;
  C: number;
  M: number;
  N: number;
  /** Shown transposed: canonical rows are display columns. */
  T: boolean;
  cR: number;
  cC: number;
  g: Geom;
  seed: number | null;
  logic: LogicKey;
  cStart: number;
  /** The start area was opened for the player (codes, dailies, retries). */
  pre: boolean;
  daily: string | null;
  mines: Uint8Array | null;
  cnt: Uint8Array;
  open: Uint8Array;
  flags: Uint8Array;
  openCount: number;
  flagCount: number;
  start: number;
  over: boolean;
  won: boolean;
  lost: boolean;
  boom: number;
  elapsed: number;
  t0: number;
  started: boolean;
  hints: number;
  clicks: number;
  moves: Move[];
  retried: boolean;
  recorded: boolean;
  generating: boolean;
  info: Info | null;
  endMsg: string | null;
  lossCtx: LossCtx | null;
}

export interface Snapshot {
  v?: number;
  key: DiffKey;
  R: number;
  C: number;
  M: number;
  T?: boolean;
  cR?: number;
  cC?: number;
  seed?: number | null;
  logic?: string;
  start: number;
  cStart?: number;
  pre?: boolean;
  daily?: string | null;
  mines: string | number[] | null;
  open: string | number[];
  flags: string | number[];
  over: boolean;
  won: boolean;
  lost: boolean;
  boom: number;
  elapsed?: number;
  started?: boolean;
  hints?: number;
  clicks?: number;
  moves?: Move[];
  retried?: boolean;
  recorded?: boolean;
  info?: Info | null;
  endMsg?: string | null;
  lossCtx?: LossCtx | null;
}

interface Replay {
  final: Snapshot;
  i: number;
  t: number;
  end: number;
  speed: number;
  playing: boolean;
  last: number;
}

const MSG_START = "Click any square to start. The first click always opens an area.";
const MSG_PLAY = "No guessing needed. Every safe square can be worked out from the numbers.";

const svg = (body: string, w = 2) =>
  `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  soundOn: svg(
    '<path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor" stroke-width="1.4"/><path d="M13.5 7.2a4 4 0 0 1 0 5.6M15.8 5a7 7 0 0 1 0 10"/>',
    1.8,
  ),
  soundOff: svg(
    '<path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor" stroke-width="1.4"/><path d="M13.5 8l4 4M17.5 8l-4 4"/>',
    1.8,
  ),
  auto: svg(
    '<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/>',
    1.8,
  ),
  light: svg(
    '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3L6 14M14 6l1.3-1.3"/>',
    1.8,
  ),
  dark: svg('<path d="M16 12.3A6.5 6.5 0 0 1 7.7 4a6.5 6.5 0 1 0 8.3 8.3z"/>', 1.8),
  pause: svg('<path d="M7 4.5v11M13 4.5v11"/>', 2.6),
  play: svg('<path d="M6.5 4.5l9 5.5-9 5.5z" fill="currentColor"/>', 1.6),
};
const FLAG =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 3v13.5M3.5 16.5h6.5" fill="none" stroke="var(--stake)" stroke-width="1.8" stroke-linecap="round"/><path d="M7.4 3.4l8.6 3.3-8.6 3.3z" fill="var(--flag)"/></svg>';
const MINE =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6v14.8M2.6 10h14.8M4.8 4.8l10.4 10.4M15.2 4.8L4.8 15.2" fill="none" stroke="var(--mine)" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="10" r="5.1" fill="var(--mine)"/><circle cx="8.3" cy="8.3" r="1.35" fill="var(--glint)"/></svg>';
const CROSS =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 3.5l13 13M16.5 3.5l-13 13" fill="none" stroke="var(--bad)" stroke-width="2.4" stroke-linecap="round"/></svg>';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const els = {
  wrap: $(".wrap"),
  panel: $(".panel"),
  scroll: $("#scroll"),
  board: $("#board"),
  mines: $("#mines"),
  time: $("#time"),
  status: $("#status"),
  statusRow: $("#statusRow"),
  meta: $("#meta"),
  result: $("#result"),
  retry: $<HTMLButtonElement>("#retry"),
  watch: $<HTMLButtonElement>("#watch"),
  hint: $<HTMLButtonElement>("#hint"),
  fresh: $<HTMLButtonElement>("#fresh"),
  pause: $<HTMLButtonElement>("#pause"),
  pauseOv: $("#pauseOv"),
  resume: $<HTMLButtonElement>("#resume"),
  diff: $("#diff"),
  logic: $("#logic"),
  mode: $("#mode"),
  daily: $<HTMLButtonElement>("#daily"),
  share: $<HTMLButtonElement>("#share"),
  zoomIn: $<HTMLButtonElement>("#zoomIn"),
  zoomOut: $<HTMLButtonElement>("#zoomOut"),
  zoomFit: $<HTMLButtonElement>("#zoomFit"),
  statsBtn: $<HTMLButtonElement>("#statsBtn"),
  soundBtn: $<HTMLButtonElement>("#soundBtn"),
  themeBtn: $<HTMLButtonElement>("#themeBtn"),
  replay: $("#replay"),
  rpPlay: $<HTMLButtonElement>("#rpPlay"),
  rpSeek: $<HTMLInputElement>("#rpSeek"),
  rpTime: $("#rpTime"),
  rpSpeed: $("#rpSpeed"),
  rpClose: $<HTMLButtonElement>("#rpClose"),
  statsTabs: $("#statsTabs"),
};

let G!: Game;
let cells: HTMLButtonElement[] = [];
let sigs: string[] = [];
let focusIdx = 0,
  genToken = 0,
  tick = 0,
  shownSec = -1,
  paused = false,
  quiet = false,
  saveT = 0;
let RP: Replay | null = null;

const sfx = (name: SoundName) => {
  if (S.sound && !quiet) playSound(name);
};
const mines = () => G.mines as Uint8Array;

// ---- Board geometry and sizing ----
function dimsOf(o: Partial<BoardSpec> & { key: DiffKey }) {
  if (o.key === "custom") {
    const c = o.r && o.c && o.m ? { r: o.r, c: o.c, m: o.m } : S.custom;
    return { r: c.r, c: c.c, m: c.m, name: "Custom" };
  }
  return DIFFS[o.key];
}

function layout(C: number) {
  const cs = getComputedStyle(els.panel);
  const avail =
    els.wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 6;
  const max = C <= 9 ? 40 : C <= 16 ? 34 : 30;
  let gap = 2,
    size = Math.floor((avail - (C - 1) * gap) / C);
  if (size < 22) {
    gap = 1;
    size = Math.floor((avail - (C - 1) * gap) / C);
  }
  return { size: Math.max(16, Math.min(max, size)), gap };
}
function sizeBoard() {
  const { size } = layout(G.C);
  const cell = Math.max(14, Math.min(72, Math.round(size * S.zoom)));
  els.board.style.setProperty("--cell", cell + "px");
  els.board.style.setProperty("--gap", (cell < 22 ? 1 : 2) + "px");
  els.board.style.setProperty("--cols", String(G.C));
}
function setZoom(z: number, persist = true) {
  z = Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
  if (z !== S.zoom && G) {
    const sc = els.scroll,
      frac = (sc.scrollLeft + sc.clientWidth / 2) / Math.max(1, sc.scrollWidth);
    S.zoom = z;
    sizeBoard();
    sc.scrollLeft = frac * sc.scrollWidth - sc.clientWidth / 2;
  }
  if (persist) saveSettings();
  els.zoomOut.disabled = S.zoom <= 0.5;
  els.zoomIn.disabled = S.zoom >= 3;
  els.zoomFit.disabled = S.zoom === 1;
}

// Boards are generated in their canonical orientation so codes and dailies match
// on every screen; narrow screens show them transposed.
function toCanon(i: number) {
  if (!G.T) return i;
  const r = Math.floor(i / G.C),
    c = i % G.C;
  return c * G.cC + r;
}
function fromCanon(j: number) {
  if (!G.T) return j;
  const cr = Math.floor(j / G.cC),
    cc = j % G.cC;
  return cc * G.C + cr;
}

function blank(key: DiffKey, R: number, C: number, M: number): Game {
  const N = R * C;
  return {
    key,
    R,
    C,
    M,
    N,
    T: false,
    cR: R,
    cC: C,
    g: geom(R, C),
    seed: null,
    logic: "any",
    cStart: -1,
    pre: false,
    daily: null,
    mines: null,
    cnt: new Uint8Array(N),
    open: new Uint8Array(N),
    flags: new Uint8Array(N),
    openCount: 0,
    flagCount: 0,
    start: -1,
    over: false,
    won: false,
    lost: false,
    boom: -1,
    elapsed: 0,
    t0: 0,
    started: false,
    hints: 0,
    clicks: 0,
    moves: [],
    retried: false,
    recorded: false,
    generating: false,
    info: null,
    endMsg: null,
    lossCtx: null,
  };
}

type NewGameOpts = Partial<BoardSpec> & { key: DiffKey };

// With a seed the board is built right away around the given (canonical) start square.
function newGame(o: NewGameOpts) {
  if (RP) endReplay(false);
  clearConfetti();
  cancelGeneration();
  genToken++;
  stopTimer();
  setPaused(false, true);
  const key: DiffKey = o.key === "custom" || isStd(o.key) ? o.key : "beginner";
  const d = dimsOf({ ...o, key });
  let R = d.r,
    C = d.c,
    T = false;
  if (C > R && layout(C).size < 24) {
    R = d.c;
    C = d.r;
    T = true;
  }
  G = blank(key, R, C, d.m);
  Object.assign(G, {
    T,
    cR: d.r,
    cC: d.c,
    logic: isLogic(o.logic) ? o.logic : S.logic,
    daily: o.daily || null,
  });
  focusIdx = 0;
  buildBoard();
  updateHud();
  setMeta();
  syncControls();
  showEnd();
  setStatus(MSG_START);
  if (o.seed != null && o.start != null) {
    G.seed = o.seed;
    G.pre = true;
    begin(fromCanon(o.start));
  }
}
function newSame() {
  newGame(
    G.key === "custom" ? { key: "custom", r: G.cR, c: G.cC, m: G.M } : { key: G.key },
  );
}

function buildBoard() {
  sizeBoard();
  const frag = document.createDocumentFragment();
  cells = new Array(G.N);
  sigs = new Array(G.N).fill("");
  for (let i = 0; i < G.N; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.i = String(i);
    b.tabIndex = i === focusIdx ? 0 : -1;
    cells[i] = b;
    frag.appendChild(b);
    paint(i);
  }
  els.board.replaceChildren(frag);
  els.board.setAttribute("aria-label", `Minefield, ${G.C} columns by ${G.R} rows`);
}

function paint(i: number) {
  const el = cells[i],
    { open, flags, cnt } = G;
  let cls = "cell",
    html = "",
    n = "",
    desc: string;
  if (G.lost && G.mines && G.mines[i] && !flags[i]) {
    cls += " open mine" + (i === G.boom ? " boom" : "");
    html = MINE;
    desc = i === G.boom ? "mine, exploded" : "mine";
  } else if (open[i]) {
    cls += " open";
    const k = cnt[i];
    if (k) {
      cls += " num";
      html = String(k);
      n = String(k);
      desc = k + (k === 1 ? " mine" : " mines") + " nearby";
    } else desc = "clear";
  } else if (flags[i]) {
    const bad = G.lost && G.mines && !G.mines[i];
    cls += " covered flag";
    html = bad ? FLAG + CROSS : FLAG;
    desc = bad ? "wrong flag" : "flagged";
  } else {
    cls += " covered";
    desc = "covered";
  }
  const sig = cls + "|" + html;
  if (sigs[i] === sig) return;
  sigs[i] = sig;
  el.className = cls;
  el.innerHTML = html;
  if (n) el.dataset.n = n;
  else delete el.dataset.n;
  el.setAttribute("aria-label", `Row ${Math.floor(i / G.C) + 1}, column ${(i % G.C) + 1}: ${desc}`);
}
function paintAll() {
  for (let i = 0; i < G.N; i++) paint(i);
}
function stopCellAnimations() {
  for (const c of cells) for (const a of c.getAnimations()) a.cancel();
}
function pop(i: number, d: number, stepMs: number, from?: number) {
  if (!quiet) popIn(cells[i], Math.min(d * stepMs, 700), from);
}
const chebyshev = (a: number, b: number) =>
  Math.max(
    Math.abs(Math.floor(a / G.C) - Math.floor(b / G.C)),
    Math.abs((a % G.C) - (b % G.C)),
  );

// ---- HUD ----
let hudPaused: boolean | null = null;
function updateHud() {
  els.mines.textContent = fmt3(G.M - G.flagCount);
  showTime();
  els.hint.disabled = G.over || !!RP || !!G.generating;
  els.pause.disabled = !G.started || G.over || !!RP;
  els.share.disabled = G.seed == null || !G.mines;
  if (hudPaused !== paused) {
    hudPaused = paused;
    els.pause.innerHTML = paused ? ICON.play : ICON.pause;
    els.pause.setAttribute("aria-label", paused ? "Resume" : "Pause");
  }
}
function showTime() {
  const s = Math.floor(G.elapsed);
  if (s === shownSec) return;
  shownSec = s;
  els.time.textContent = fmt3(s);
}
function setMeta() {
  const parts: string[] = [];
  if (G.daily) parts.push(`Daily · ${fmtDate(G.daily)}`);
  parts.push(`${G.C} × ${G.R} · ${G.M} mines`);
  if (G.info && G.info.hard != null) {
    const h = G.info.hard;
    parts.push(`logic: ${gradeOf(h, G.M)}${h ? ` (${plural(h, "pattern step")})` : ""}`);
  } else if (G.logic !== "any") parts.push(`logic: ${LOGICS[G.logic].name}`);
  if (G.info && G.info.ms) parts.push(`solver-checked in ${G.info.ms} ms`);
  const s = isStd(G.key) ? ST[G.key] : undefined;
  if (s && s.best != null) parts.push(`best ${fmtS(s.best)}`);
  els.meta.textContent = parts.join(" · ");
}
function setStatus(text: string, tone?: "win" | "bad") {
  const cls = "status" + (tone ? " " + tone : "");
  if (els.status.textContent === text && els.status.className === cls) return;
  els.status.textContent = text;
  els.status.className = cls;
  fadeIn(els.status, 3, 180);
}
function syncControls(instant = false) {
  const press = (root: HTMLElement, attr: string, v: string) => {
    root
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === v)));
    syncThumb(root, instant);
  };
  press(els.diff, "k", G.key);
  press(els.logic, "l", G.logic);
  press(els.mode, "m", S.mode);
  els.board.classList.toggle("flag-mode", S.mode === "flag");
}
function syncAllThumbs() {
  for (const seg of document.querySelectorAll<HTMLElement>(".seg")) syncThumb(seg, true);
}

// ---- Timer and pause ----
function startTimer(fromSec: number) {
  stopTimer();
  G.t0 = performance.now() - fromSec * 1000;
  G.elapsed = fromSec;
  tick = window.setInterval(() => {
    G.elapsed = (performance.now() - G.t0) / 1000;
    showTime();
  }, 100);
}
function stopTimer() {
  if (tick) {
    clearInterval(tick);
    tick = 0;
    if (G && G.t0) G.elapsed = (performance.now() - G.t0) / 1000;
  }
}
const elapsedMs = () => (tick ? performance.now() - G.t0 : G.elapsed * 1000);
function ensureStarted() {
  if (RP || G.started) return;
  G.started = true;
  startTimer(0);
  updateHud();
}
function setPaused(p: boolean, silent = false) {
  if (p) {
    if (!G || !G.started || G.over || paused || RP) return;
    stopTimer();
    paused = true;
  } else {
    if (!paused) return;
    paused = false;
    if (!silent && G && G.started && !G.over) startTimer(G.elapsed);
  }
  els.pauseOv.hidden = !paused;
  els.board.classList.toggle("paused", paused);
  if (paused) fadeIn(els.pauseOv, 0, 160);
  if (G) updateHud();
  if (!p && !silent && cells[focusIdx]) cells[focusIdx].focus({ preventScroll: true });
}

// ---- Playing ----
const canAct = () => !!G && !G.over && !G.generating && !paused && !RP;
function rec(type: MoveType, i: number) {
  if (RP || quiet) return;
  G.moves.push([Math.round(elapsedMs()), type, i]);
}

function begin(i: number) {
  G.generating = true;
  if (G.seed == null) G.seed = randomSeed();
  G.start = i;
  G.cStart = toCanon(i);
  const token = ++genToken,
    t = performance.now(),
    game = G;
  els.board.classList.add("busy");
  cells[i].classList.add("pressed");
  updateHud();
  const slow = setTimeout(() => {
    if (token === genToken) setStatus("Checking the board with the solver…");
  }, 250);
  const opt =
    G.logic === "gentle" ? { maxRule: 1 } : G.logic === "tough" ? { minHard: toughTarget(G.M) } : {};
  void generateBoard({ R: G.cR, C: G.cC, M: G.M, start: G.cStart, seed: G.seed, opt }).then(
    (res) => {
      clearTimeout(slow);
      if (token !== genToken || game !== G) return;
      els.board.classList.remove("busy");
      cells[i].classList.remove("pressed");
      G.generating = false;
      if (!res) {
        G.seed = null;
        G.pre = false;
        G.start = G.cStart = -1;
        updateHud();
        setStatus(
          "Couldn't build a no-guess board with these settings. Try fewer mines or a different logic level.",
          "bad",
        );
        return;
      }
      const m = new Uint8Array(G.N);
      for (let j = 0; j < G.N; j++) m[j] = res.mines[toCanon(j)];
      G.mines = m;
      G.cnt = counts(G.g, m);
      G.info = {
        ms: Math.max(1, Math.round(performance.now() - t)),
        hard: res.hard,
        bv: bbbv(G.g, m, G.cnt),
      };
      setMeta();
      if (G.pre) {
        openFrom(i, true);
        sfx("open");
        const done = G.daily && isStd(G.key) ? DL[dailyKey(G.daily, G.key)] : null;
        setStatus(
          G.daily
            ? done
              ? `You finished today's daily in ${fmtS(done.s)}. Replays don't change your daily result.`
              : "Today's daily board: the same for everyone. The timer starts on your first move."
            : "Board loaded from a code. The timer starts on your first move.",
        );
      } else {
        G.started = true;
        startTimer(0);
        G.clicks = 1;
        rec("d", i);
        openFrom(i, true);
        sfx("open");
        setStatus(MSG_PLAY);
      }
      updateHud();
      checkWin();
      saveSoon();
    },
  );
}

// Breadth-first so the reveal can ripple outward. Returns false on a mine,
// otherwise the number of squares opened.
function openFrom(i: number, anim: boolean): number | false {
  const { g, cnt, open, flags } = G;
  if (mines()[i]) {
    lose(i);
    return false;
  }
  if (open[i] || flags[i]) return 0;
  const q = [i],
    dist = [0];
  open[i] = 1;
  for (let h = 0; h < q.length; h++) {
    const x = q[h];
    G.openCount++;
    paint(x);
    if (anim) pop(x, dist[h], 22, 0.55);
    if (cnt[x] === 0)
      for (const n of g.nb[x])
        if (!open[n] && !flags[n]) {
          open[n] = 1;
          q.push(n);
          dist.push(dist[h] + 1);
        }
  }
  return q.length;
}

function primary(i: number) {
  if (!canAct()) return;
  clearWhy();
  if (!G.mines) {
    wakeAudio();
    begin(i);
    return;
  }
  G.clicks++;
  if (G.open[i]) {
    chord(i);
    return;
  }
  if (S.mode === "flag") {
    flag(i);
    return;
  }
  if (G.flags[i]) {
    sfx("nope");
    nudge(cells[i]);
    return;
  }
  dig(i);
}

function dig(i: number) {
  ensureStarted();
  rec("d", i);
  const n = openFrom(i, true);
  if (n === false) return;
  sfx(n > 1 ? "open" : "dig");
  checkWin();
  saveSoon();
}

function chord(i: number) {
  const { g, cnt, open, flags } = G;
  const k = cnt[i];
  if (!k) return;
  let f = 0;
  const todo: number[] = [];
  for (const n of g.nb[i]) {
    if (flags[n]) f++;
    else if (!open[n]) todo.push(n);
  }
  if (f !== k || !todo.length) {
    if (!RP && !quiet && todo.length) {
      sfx("nope");
      for (const j of [i, ...todo]) nudge(cells[j]);
    }
    return;
  }
  ensureStarted();
  rec("c", i);
  for (const n of todo)
    if (mines()[n]) {
      lose(n, i);
      return;
    }
  let total = 0;
  for (const n of todo) total += openFrom(n, true) || 0;
  sfx(total > todo.length ? "open" : "dig");
  checkWin();
  saveSoon();
}

function flag(i: number) {
  if (G.open[i]) return false;
  ensureStarted();
  rec("f", i);
  G.flags[i] ^= 1;
  G.flagCount += G.flags[i] ? 1 : -1;
  paint(i);
  if (G.flags[i]) pop(i, 0, 0, 0.4);
  updateHud();
  if (!quiet) bump(els.mines);
  sfx(G.flags[i] ? "flag" : "unflag");
  saveSoon();
  return true;
}
function toggleFlag(i: number) {
  if (!canAct() || !G.mines || G.open[i]) return false;
  clearWhy();
  G.clicks++;
  return flag(i);
}

function lose(i: number, chordAt = -1) {
  stopTimer();
  G.over = true;
  G.lost = true;
  G.boom = i;
  paintAll();
  updateHud();
  sfx("lose");
  if (!quiet && motionOK()) {
    popIn(cells[i], 0, 1.5, 320);
    const m = mines();
    for (let j = 0; j < G.N; j++)
      if (m[j] && !G.flags[j] && j !== i) pop(j, chebyshev(i, j), 45, 0.3);
    shake(els.board);
  }
  if (RP) return;
  G.lossCtx = { boom: i, chord: chordAt };
  record(false);
  explainLoss();
  showEnd();
  setMeta();
  saveSoon();
}

function checkWin() {
  if (G.over || G.openCount !== G.N - G.M) return;
  stopTimer();
  // Round once so the status, result chips and stats all agree.
  G.elapsed = Math.max(0.01, Math.round(G.elapsed * 100) / 100);
  G.over = true;
  G.won = true;
  const m = mines();
  for (let i = 0; i < G.N; i++) if (m[i]) G.flags[i] = 1;
  G.flagCount = G.M;
  paintAll();
  updateHud();
  sfx("win");
  if (!quiet && motionOK()) {
    let k = 0;
    for (let i = 0; i < G.N; i++) if (m[i]) pop(i, k++, 12, 0.3);
    if (!RP) {
      const b = els.board.getBoundingClientRect();
      confetti(b.left + b.width / 2, Math.min(innerHeight * 0.6, Math.max(60, b.top + b.height * 0.3)));
    }
  }
  if (RP) return;
  const secs = G.elapsed,
    r = record(true),
    std = isStd(G.key) ? G.key : null,
    name = std ? DIFFS[std].name : "custom boards",
    best = std ? ST[std]?.best : null;
  let msg = `Board cleared in ${fmtS(secs)}.`;
  if (G.retried) msg += " You'd already seen this board's mines, so it isn't counted.";
  else if (!std) msg += " Custom boards aren't ranked.";
  else if (G.hints)
    msg += ` You used ${plural(G.hints, "hint")}, so it doesn't count toward your best time.`;
  else if (r && r.newBest) msg += ` New best for ${name}!`;
  else if (best != null) msg += ` Your ${name} best is ${fmtS(best)}.`;
  if (r && r.daily) msg += " Today's daily is done.";
  G.endMsg = msg;
  setStatus(msg, "win");
  showEnd();
  setMeta();
  saveSoon();
}

// A game counts once; retried boards and replays never count.
function record(win: boolean): { daily: boolean; newBest?: boolean } | null {
  if (G.recorded || G.retried || RP) return null;
  G.recorded = true;
  const std = isStd(G.key) ? G.key : null;
  let daily = false;
  if (win && G.daily && std) {
    const k = dailyKey(G.daily, std);
    if (!DL[k]) {
      DL[k] = { s: Math.round(G.elapsed * 100) / 100, h: G.hints };
      saveDaily();
      daily = true;
    }
  }
  if (!std) return { daily };
  const s = statOf(std);
  s.played++;
  const res: { daily: boolean; newBest?: boolean } = { daily };
  if (win) {
    const secs = Math.max(0.01, G.elapsed),
      bv = bvOf(),
      rate = Math.round((bv / secs) * 100) / 100,
      eff = Math.round((bv / Math.max(1, G.clicks)) * 100);
    s.won++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.recent.push({
      s: secs,
      bv,
      eff,
      rate,
      h: G.hints,
      d: today(),
      l: G.info && G.info.hard != null ? gradeOf(G.info.hard, G.M) : "",
    });
    if (s.recent.length > 30) s.recent.splice(0, s.recent.length - 30);
    if (!G.hints) {
      if (s.best == null || secs < s.best) {
        s.best = secs;
        res.newBest = true;
      }
      if (s.bestRate == null || rate > s.bestRate) s.bestRate = rate;
    }
  } else s.streak = 0;
  saveStats();
  return res;
}
const bvOf = () => (G.info && G.info.bv ? G.info.bv - (G.pre ? 1 : 0) : 0);

// Retry, replay and the result chips for a finished game.
function showEnd() {
  els.retry.hidden = !(G.over && G.lost && G.mines);
  els.watch.hidden = !(G.over && G.moves.length);
  if (!(G.over && G.won)) {
    els.result.hidden = true;
    return;
  }
  const secs = Math.max(0.01, G.elapsed),
    bv = bvOf(),
    chips: [string, string | number][] = [
      ["Time", fmtS(secs)],
      ["3BV", bv],
      ["Clicks", G.clicks],
      ["Efficiency", Math.round((bv / Math.max(1, G.clicks)) * 100) + "%"],
      ["3BV/s", (bv / secs).toFixed(2)],
    ];
  if (G.hints) chips.push(["Hints", G.hints]);
  els.result.innerHTML = chips
    .map(
      ([l, v]) =>
        `<li class="chip"><span class="lbl">${l}</span><span class="val">${v}</span></li>`,
    )
    .join("");
  const wasHidden = els.result.hidden;
  els.result.hidden = false;
  if (wasHidden && !quiet)
    [...els.result.children].forEach((c, k) => popIn(c, 120 + k * 50, 0.85, 260));
}

function retry() {
  if (!G.mines || RP) return;
  Object.assign(G, {
    retried: true,
    pre: true,
    moves: [],
    clicks: 0,
    hints: 0,
    started: false,
    elapsed: 0,
    endMsg: null,
    lossCtx: null,
  });
  stopTimer();
  resetPlay();
  updateHud();
  showEnd();
  setMeta();
  setStatus("Same board, same first square. The timer starts on your first move.");
  saveSoon();
}
// Covers the board again, keeping the mines. Pre-opened boards reopen their start.
function resetPlay() {
  clearWhy();
  stopCellAnimations();
  G.open.fill(0);
  G.flags.fill(0);
  Object.assign(G, { openCount: 0, flagCount: 0, over: false, won: false, lost: false, boom: -1 });
  paintAll();
  if (G.pre) openFrom(G.start, false);
}

// ---- Explanations ----
const WHY_CLASSES = ["why-a", "why-b", "why-mine", "why-safe", "hint"];
function clearWhy() {
  for (const el of els.board.querySelectorAll(".why-a,.why-b,.why-mine,.why-safe,.hint"))
    el.classList.remove(...WHY_CLASSES);
}
function showWhy(res: Explanation) {
  const w = res.why;
  if (w.rule === 3) return;
  const src = w.rule === 2 ? [w.a, w.b] : [w.a];
  cells[w.a].classList.add("why-a");
  if (w.rule === 2) cells[w.b].classList.add("why-b");
  if (!res.deduced) return;
  for (const s of src)
    for (const n of G.g.nb[s]) {
      if (res.state[n] === 2) cells[n].classList.add("why-mine");
      else if (res.state[n] === 3) cells[n].classList.add("why-safe");
    }
}
function whyText(res: Explanation, isMine: boolean): string {
  const w = res.why,
    k = (i: number) => G.cnt[i];
  const tail = res.deduced
    ? " Dashed squares were worked out first (orange dashes are mines, green are safe)."
    : "";
  if (w.rule === 1) {
    if (w.rem === 0)
      return `The orange-ringed ${k(w.a)} already touches ${plural(k(w.a), "known mine")}, so its other squares are safe.${tail}`;
    return `The orange-ringed ${k(w.a)} ${w.known ? "still needs" : "needs"} ${plural(w.rem, "mine")} and has exactly that many covered squares left${w.known || w.safe ? " (not counting dashed ones)" : ""}, so ${w.rem === 1 ? "it is a mine" : "they are all mines"}.${tail}`;
  }
  if (w.rule === 2) {
    const kx = k(w.a),
      ky = k(w.b),
      needs = w.ra === kx ? "needs" : "still needs";
    if (!isMine && w.ox === 0)
      return `Every mine the orange-ringed ${kx} ${needs} (${w.ra}) has to sit in squares it shares with the purple-ringed ${ky}. That fills the ${ky}, so its other squares are safe.${tail}`;
    const head = `The orange-ringed ${kx} ${needs} ${plural(w.ra, "mine")}, but at most ${w.rb} can fit in the squares it shares with the purple-ringed ${ky}. So its other ${plural(w.ox, "square")} ${w.ox === 1 ? "is a mine" : "are all mines"}`;
    return isMine
      ? `${head}.${tail}`
      : `${head}, which fills the ${ky}: its remaining squares are safe.${tail}`;
  }
  return w.rem === 0
    ? `All ${G.M} mines are accounted for, so every covered square left is safe.`
    : `Only ${plural(w.rem, "mine")} ${w.rem === 1 ? "is" : "are"} left and exactly ${plural(w.left, "covered square")} remain unworked, so they are all mines.`;
}

function giveHint() {
  if (!canAct()) return;
  if (!G.mines) {
    setStatus("Click any square to start. The first click is always safe.");
    nudge(els.board);
    return;
  }
  clearWhy();
  const res = explain(G.g, G.cnt, G.open, G.M, (out) => nearest(G.g, out, 1, focusIdx));
  let t = res ? res.target : -1;
  if (t < 0)
    for (let j = 0; j < G.N; j++)
      if (!G.open[j] && !G.mines[j]) {
        t = j;
        break;
      }
  if (t < 0) return;
  ensureStarted();
  G.hints++;
  rec("h", t);
  if (res) showWhy(res);
  cells[t].classList.add("hint");
  setFocus(t, true);
  cells[t].scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: motionOK() ? "smooth" : "auto",
  });
  sfx("hint");
  const lead = G.flags[t]
    ? "The blue square is safe, so its flag is wrong."
    : "The blue square is safe to dig.";
  setStatus(res ? `${lead} ${whyText(res, false)}` : lead);
  saveSoon();
}

function explainLoss() {
  if (!G.lossCtx) return;
  const { boom, chord } = G.lossCtx;
  let text: string;
  if (chord >= 0) {
    cells[chord].classList.add("why-a");
    text = `A flag next to the orange-ringed ${G.cnt[chord]} was wrong (crossed out), so clearing around it hit a mine.`;
  } else {
    const res = explain(G.g, G.cnt, G.open, G.M, (out) => (out[boom] === 2 ? boom : -1));
    if (res) {
      showWhy(res);
      text = `That square was a mine. ${whyText(res, true)}`;
    } else {
      const h = explain(G.g, G.cnt, G.open, G.M, (out) => nearest(G.g, out, 1, boom));
      text = "That square was a mine, and the numbers hadn't proven it either way yet.";
      if (h) {
        showWhy(h);
        cells[h.target].classList.add("hint");
        text += ` The blue square was provably safe instead. ${whyText(h, false)}`;
      }
    }
  }
  G.endMsg = text;
  setStatus(text + " Retry this board or start a new one.", "bad");
}

function setFocus(j: number, doFocus: boolean) {
  if (cells[focusIdx]) cells[focusIdx].tabIndex = -1;
  focusIdx = j;
  cells[j].tabIndex = 0;
  if (doFocus) cells[j].focus({ preventScroll: true });
}

// ---- Replay ----
function startReplay() {
  if (!G.over || !G.moves.length || RP) return;
  const final = gameSnap(),
    last = G.moves[G.moves.length - 1][0];
  RP = { final, i: 0, t: 0, end: last + 800, speed: 1, playing: true, last: performance.now() };
  els.statusRow.hidden = true;
  els.result.hidden = true;
  els.replay.hidden = false;
  fadeIn(els.replay);
  syncReplayUi();
  resetPlay();
  G.elapsed = 0;
  updateHud();
  requestAnimationFrame(rpTick);
  els.rpPlay.focus();
}
function applyMove([, type, i]: Move) {
  if (type === "d") openFrom(i, true);
  else if (type === "c") chord(i);
  else if (type === "f") {
    G.flags[i] ^= 1;
    G.flagCount += G.flags[i] ? 1 : -1;
    paint(i);
    if (G.flags[i]) pop(i, 0, 0, 0.4);
    sfx(G.flags[i] ? "flag" : "unflag");
  } else if (type === "h") {
    clearWhy();
    cells[i].classList.add("hint");
  }
  if (type !== "h") checkWin();
}
function rpTick(now: number) {
  if (!RP) return;
  const mv = G.moves;
  if (RP.playing) {
    RP.t = Math.min(RP.end, RP.t + (now - RP.last) * RP.speed);
    while (RP.i < mv.length && mv[RP.i][0] <= RP.t) applyMove(mv[RP.i++]);
    if (RP.t >= RP.end) {
      RP.playing = false;
      syncReplayUi();
    }
    rpShowTime();
  }
  RP.last = now;
  requestAnimationFrame(rpTick);
}
function rpShowTime() {
  if (!RP) return;
  const s = Math.max(0, Math.min(RP.t, RP.end - 800) / 1000);
  G.elapsed = s;
  els.mines.textContent = fmt3(G.M - G.flagCount);
  showTime();
  els.rpTime.textContent = s.toFixed(1) + " s";
  els.rpSeek.value = String(Math.round((RP.t / RP.end) * 1000));
}
function rpSeek(t: number) {
  if (!RP) return;
  quiet = true;
  resetPlay();
  RP.i = 0;
  RP.t = t;
  const mv = G.moves;
  while (RP.i < mv.length && mv[RP.i][0] <= t) applyMove(mv[RP.i++]);
  quiet = false;
  rpShowTime();
}
function syncReplayUi() {
  const playing = !!RP && RP.playing;
  els.rpPlay.innerHTML = playing ? ICON.pause : ICON.play;
  els.rpPlay.setAttribute("aria-label", playing ? "Pause replay" : "Play replay");
  els.rpSpeed
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) => b.setAttribute("aria-pressed", String(+(b.dataset.s || 0) === RP?.speed)));
  syncThumb(els.rpSpeed);
}
function endReplay(restoreIt = true) {
  if (!RP) return;
  const f = RP.final;
  RP = null;
  els.replay.hidden = true;
  els.statusRow.hidden = false;
  if (restoreIt) {
    restore(f);
    els.watch.focus();
  }
}

// ---- Saving and restoring ----
const pack = (a: Uint8Array) => Array.prototype.join.call(a, "");
const unpack = (v: string | number[]) =>
  typeof v === "string" ? Uint8Array.from(v, Number) : Uint8Array.from(v);

function gameSnap(): Snapshot {
  return {
    v: 2,
    key: G.key,
    R: G.R,
    C: G.C,
    M: G.M,
    T: G.T,
    cR: G.cR,
    cC: G.cC,
    seed: G.seed,
    logic: G.logic,
    start: G.start,
    cStart: G.cStart,
    pre: G.pre,
    daily: G.daily,
    mines: G.mines ? pack(G.mines) : null,
    open: pack(G.open),
    flags: pack(G.flags),
    over: G.over,
    won: G.won,
    lost: G.lost,
    boom: G.boom,
    elapsed: elapsedMs() / 1000,
    started: G.started,
    hints: G.hints,
    clicks: G.clicks,
    moves: G.moves,
    retried: G.retried,
    recorded: G.recorded,
    info: G.info,
    endMsg: G.endMsg,
    lossCtx: G.lossCtx,
  };
}
export function snapshot() {
  if (!G) return {};
  return { mode: S.mode, game: RP ? RP.final : gameSnap() };
}
function saveSoon() {
  clearTimeout(saveT);
  saveT = window.setTimeout(saveNow, 300);
}
function saveNow() {
  clearTimeout(saveT);
  if (!G || G.generating || !G.mines) return;
  save("nogs-game", RP ? RP.final : gameSnap());
}

function restore(s: Snapshot) {
  if (!s || !s.mines || s.mines.length !== s.R * s.C) throw new Error("bad save");
  stopTimer();
  G = blank(s.key, s.R, s.C, s.M);
  G.mines = unpack(s.mines);
  G.cnt = counts(G.g, G.mines);
  G.open = unpack(s.open);
  G.flags = unpack(s.flags);
  G.openCount = G.open.reduce((a, b) => a + b, 0);
  G.flagCount = G.flags.reduce((a, b) => a + b, 0);
  Object.assign(G, {
    T: !!s.T,
    cR: s.cR || s.R,
    cC: s.cC || s.C,
    seed: s.seed ?? null,
    logic: isLogic(s.logic) ? s.logic : "any",
    start: s.start,
    cStart: s.cStart ?? s.start,
    pre: !!s.pre,
    daily: s.daily || null,
    over: s.over,
    won: s.won,
    lost: s.lost,
    boom: s.boom,
    elapsed: s.elapsed || 0,
    started: s.started ?? (s.elapsed || 0) > 0,
    hints: s.hints || 0,
    clicks: s.clicks || 0,
    moves: Array.isArray(s.moves) ? s.moves : [],
    retried: !!s.retried,
    recorded: !!s.recorded,
    info: s.info || null,
    endMsg: s.endMsg || null,
    lossCtx: s.lossCtx || null,
  });
  if (G.info && G.info.bv == null) G.info.bv = bbbv(G.g, G.mines, G.cnt);
  focusIdx = 0;
  paused = false;
  buildBoard();
  paintAll();
  updateHud();
  setMeta();
  syncControls(true);
  showEnd();
  if (!G.over) {
    setStatus(MSG_PLAY);
    if (G.started) {
      // Come back paused so the clock doesn't run while the page loads.
      paused = true;
      els.pauseOv.hidden = false;
      els.board.classList.add("paused");
      updateHud();
      setStatus("Welcome back. Your game is paused.");
    }
  } else if (G.lost) {
    if (G.lossCtx) explainLoss();
    else
      setStatus(
        "That square was a mine, and the numbers could have shown it. Retry this board or start a new one.",
        "bad",
      );
  } else setStatus(G.endMsg || `Board cleared in ${fmtS(Math.max(0.01, G.elapsed))}.`, "win");
}

// ---- Codes and daily boards ----
function boardCode() {
  if (G.seed == null || !G.mines) return "";
  return formatCode({
    key: G.key,
    r: G.cR,
    c: G.cC,
    m: G.M,
    logic: G.logic,
    seed: G.seed,
    start: G.cStart,
  });
}
function playDaily() {
  const key = isStd(G.key) ? G.key : isStd(S.diff) ? S.diff : "intermediate",
    date = today();
  if (G.daily === date && G.key === key && !G.over) {
    toast("You're already playing today's daily");
    return;
  }
  confirmLeave(() => newGame(dailySpec(key, date)));
}

// ---- Dialogs ----
function openDlg(d: HTMLDialogElement) {
  try {
    d.showModal();
  } catch {
    d.setAttribute("open", "");
  }
  dialogIn(d);
}
const inProgress = () => !!G.mines && !G.over && G.started && G.moves.length > 0;
function confirmLeave(then: () => void) {
  if (!inProgress()) return then();
  const d = $<HTMLDialogElement>("#confirmDlg");
  $("#confirmText").textContent =
    G.retried || !isStd(G.key)
      ? "Your progress on this board will be lost."
      : "Your progress will be lost and the game counts as a loss in your stats.";
  d.returnValue = "";
  d.onclose = () => {
    d.onclose = null;
    if (d.returnValue !== "ok") return;
    record(false);
    then();
  };
  openDlg(d);
  $("#confirmOk").focus();
}

const num = (id: string) => +$<HTMLInputElement>(id).value;
function openCustom() {
  const c = S.custom;
  $<HTMLInputElement>("#cRows").value = String(c.r);
  $<HTMLInputElement>("#cCols").value = String(c.c);
  $<HTMLInputElement>("#cMines").value = String(c.m);
  checkCustom();
  const d = $<HTMLDialogElement>("#customDlg");
  d.returnValue = "";
  d.onclose = () => {
    d.onclose = null;
    if (d.returnValue !== "ok") return;
    const v = readCustom();
    if (!v) return;
    confirmLeave(() => {
      S.custom = v;
      S.diff = "custom";
      saveSettings();
      newGame({ key: "custom", ...v });
    });
  };
  openDlg(d);
}
function readCustom() {
  const r = num("#cRows"),
    c = num("#cCols"),
    m = num("#cMines");
  return validCustom(r, c, m) ? { r, c, m } : null;
}
function checkCustom() {
  const r = num("#cRows"),
    c = num("#cCols"),
    note = $("#customNote"),
    okSize = Number.isInteger(r) && Number.isInteger(c) && r >= 5 && r <= 30 && c >= 5 && c <= 40;
  $<HTMLInputElement>("#cMines").max = okSize ? String(maxMines(r, c)) : "";
  const v = readCustom();
  $<HTMLButtonElement>("#customOk").disabled = !v;
  note.className = "note" + (v ? "" : " bad");
  note.textContent = !okSize
    ? "Rows can be 5 to 30 and columns 5 to 40."
    : v
      ? `${Math.round((v.m / (r * c)) * 100)}% mines. Up to ${maxMines(r, c)} mines keep no-guess boards quick to build at this size.`
      : `Mines must be between 1 and ${maxMines(r, c)} for this size.`;
}
function openShare() {
  const code = boardCode();
  $<HTMLInputElement>("#codeOut").value = code;
  $<HTMLButtonElement>("#copyCode").disabled = !code;
  $("#shareNote").textContent = code
    ? "Anyone who plays this code gets the same mines and the same first square. Your progress isn't included."
    : "Make your first click to create a board, then come back for its code.";
  $("#codeErr").hidden = true;
  openDlg($<HTMLDialogElement>("#shareDlg"));
}
async function copyCode() {
  const inp = $<HTMLInputElement>("#codeOut");
  let ok = false;
  try {
    await navigator.clipboard.writeText(inp.value);
    ok = true;
  } catch {
    inp.select();
    try {
      ok = document.execCommand("copy");
    } catch {}
  }
  toast(ok ? "Code copied" : "Select the code and copy it");
}
function playCode(e: Event) {
  e.preventDefault();
  const p = parseCode($<HTMLInputElement>("#codeIn").value),
    err = $("#codeErr");
  if (!p) {
    err.textContent = "That code doesn't look right. Codes look like E-a-1x8k2p-5d.";
    err.hidden = false;
    nudge($("#codeIn"));
    return;
  }
  $<HTMLDialogElement>("#shareDlg").close();
  confirmLeave(() => newGame(p));
}

let statsKey: keyof typeof DIFFS = "beginner";
function openStats() {
  if (isStd(G.key)) statsKey = G.key;
  renderStats();
  openDlg($<HTMLDialogElement>("#statsDlg"));
  syncThumb(els.statsTabs, true);
}
function renderStats() {
  els.statsTabs
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === statsKey)));
  syncThumb(els.statsTabs);
  $("#statsBody").innerHTML = statsHtml(statOf(statsKey), DL[dailyKey(today(), statsKey)]);
  const reset = $("#statsReset");
  reset.textContent = "Reset these stats";
  delete reset.dataset.armed;
}

// ---- Settings UI ----
const THEME_LABEL: Record<Theme, string> = { auto: "Automatic", light: "Light", dark: "Dark" };
function applyTheme() {
  const root = document.documentElement;
  if (S.theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", S.theme);
  const label = THEME_LABEL[S.theme];
  els.themeBtn.innerHTML = ICON[S.theme];
  els.themeBtn.setAttribute("aria-label", `Theme: ${label}. Click to change.`);
  els.themeBtn.title = `Theme: ${label}`;
}
function applySound() {
  els.soundBtn.innerHTML = S.sound ? ICON.soundOn : ICON.soundOff;
  els.soundBtn.setAttribute("aria-pressed", String(S.sound));
  els.soundBtn.title = S.sound ? "Sound effects: on" : "Sound effects: off";
}
function setMode(m: TapMode, announce = false) {
  S.mode = m;
  saveSettings();
  syncControls();
  if (announce) toast(m === "flag" ? "Taps place flags" : "Taps dig");
}

// ---- Input ----
function wire() {
  let hold: { i: number; x: number; y: number; t: number; ring: number } | null = null,
    suppress = false,
    lastType = "mouse",
    pinch: { d: number; z: number } | null = null,
    pinchEnd = 0,
    zoomRaf = 0,
    pressed: number[] = [],
    pressedAt = -1,
    downAt = -1;
  const pts = new Map<number, [number, number]>();
  const cellOf = (e: Event) =>
    (e.target as Element | null)?.closest?.<HTMLButtonElement>(".cell") ?? null;
  // Squares have 1-2px gaps between them, about a tenth of the board's area. A
  // pointer in a gap belongs to the nearest square, so no click falls through.
  // Returns -1 outside the board.
  const cellAt = (e: MouseEvent): number => {
    const el = cellOf(e);
    if (el) return +(el.dataset.i || 0);
    if (!cells.length || !els.board.contains(e.target as Node)) return -1;
    const cs = getComputedStyle(els.board),
      gap = parseFloat(cs.columnGap) || 0,
      pitch = cells[0].offsetWidth + gap,
      r = els.board.getBoundingClientRect(),
      col = Math.floor((e.clientX - r.left - parseFloat(cs.paddingLeft) + gap / 2) / pitch),
      row = Math.floor((e.clientY - r.top - parseFloat(cs.paddingTop) + gap / 2) / pitch),
      clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, v));
    return clamp(row, G.R) * G.C + clamp(col, G.C);
  };
  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
  };

  // Immediate feedback: a pressed square sinks before the action lands, and
  // holding a number previews the squares it would clear.
  const release = () => {
    for (const j of pressed) cells[j]?.classList.remove("pressed");
    pressed = [];
    pressedAt = -1;
  };
  const pressAt = (i: number) => {
    if (i === pressedAt) return;
    release();
    pressedAt = i;
    if (!canAct()) return;
    if (!G.mines) pressed = [i];
    else if (G.open[i])
      pressed = G.cnt[i] ? G.g.nb[i].filter((n) => !G.open[n] && !G.flags[n]) : [];
    else if (!G.flags[i] && S.mode === "dig") pressed = [i];
    for (const j of pressed) cells[j].classList.add("pressed");
  };
  const cancelHold = () => {
    if (!hold) return;
    clearTimeout(hold.t);
    clearTimeout(hold.ring);
    cells[hold.i]?.classList.remove("holding");
    hold = null;
  };

  els.scroll.addEventListener("pointerdown", (e) => {
    lastType = e.pointerType;
    if (e.pointerType !== "mouse") pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size >= 2) {
      cancelHold();
      release();
      if (!pinch) pinch = { d: spread(), z: S.zoom };
      return;
    }
    const i = cellAt(e);
    if (i < 0) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    downAt = e.pointerType === "mouse" ? i : -1;
    pressAt(i);
    if (e.pointerType === "mouse" || !canAct() || !G.mines || G.open[i]) return;
    // Touch long-press flags; a ring fills in first so the hold is visible.
    cancelHold();
    hold = {
      i,
      x: e.clientX,
      y: e.clientY,
      ring: window.setTimeout(() => cells[i].classList.add("holding"), 110),
      t: window.setTimeout(() => {
        cancelHold();
        release();
        if (toggleFlag(i)) {
          suppress = true;
          try {
            navigator.vibrate?.(12);
          } catch {}
        }
      }, 380),
    };
  });
  els.scroll.addEventListener("pointermove", (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size >= 2) {
      const z = (pinch.z * spread()) / pinch.d;
      cancelAnimationFrame(zoomRaf);
      zoomRaf = requestAnimationFrame(() => setZoom(z, false));
      return;
    }
    if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) {
      cancelHold();
      release();
    }
    // Dragging with the mouse button held moves the press, like the classic game.
    if (e.pointerType === "mouse" && e.buttons & 1 && downAt >= 0) {
      const i = cellAt(e);
      if (i >= 0) pressAt(i);
      else release();
    }
  });
  const lift = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    cancelHold();
    if (pinch && pts.size < 2) {
      pinch = null;
      pinchEnd = performance.now();
      saveSettings();
      toast(`Zoom ${Math.round(S.zoom * 100)}%`);
    }
  };
  // Mouse left-clicks act on release, here, wherever the press ended up: on
  // another square after a drag, or in a gap. The click event is then ignored.
  els.scroll.addEventListener("pointerup", (e) => {
    lift(e);
    release();
    if (e.pointerType === "mouse" && e.button === 0) {
      const i = cellAt(e);
      if (i >= 0 && downAt >= 0) {
        setFocus(i, false);
        primary(i);
      }
    }
    downAt = -1;
  });
  els.scroll.addEventListener("pointercancel", (e) => {
    lift(e);
    release();
  });
  els.scroll.addEventListener("pointerleave", () => {
    cancelHold();
    release();
  });
  // Touch, pen and keyboard (Enter/Space on a focused square) act on click.
  els.board.addEventListener("click", (e) => {
    if (lastType === "mouse" && e.detail > 0) return;
    const i = cellAt(e);
    if (i < 0) return;
    if (suppress) {
      suppress = false;
      return;
    }
    if (pinch || performance.now() - pinchEnd < 400) return;
    setFocus(i, false);
    primary(i);
  });
  // The browser menu never opens over the board, even between squares.
  els.board.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (lastType === "touch" || lastType === "pen") return;
    const i = cellAt(e);
    if (i >= 0) toggleFlag(i);
  });
  els.board.addEventListener("keydown", (e) => {
    const el = cellOf(e);
    if (!el) return;
    const i = +(el.dataset.i || 0),
      C = G.C;
    let j = -1;
    switch (e.key) {
      case "ArrowUp":
        j = i >= C ? i - C : i;
        break;
      case "ArrowDown":
        j = i + C < G.N ? i + C : i;
        break;
      case "ArrowLeft":
        j = i % C ? i - 1 : i;
        break;
      case "ArrowRight":
        j = i % C < C - 1 ? i + 1 : i;
        break;
      case "f":
      case "F":
        e.preventDefault();
        e.stopPropagation();
        toggleFlag(i);
        return;
      default:
        return;
    }
    e.preventDefault();
    setFocus(j, true);
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !G) return;
    const t = e.target as Element;
    if (t.closest?.("input, textarea, select, dialog[open]")) return;
    if (document.querySelector("dialog[open]")) return;
    const k = e.key;
    if (k === "Escape" && RP) return endReplay();
    if (RP) return;
    if (k === "n" || k === "N") confirmLeave(newSame);
    else if (k === "h" || k === "H") giveHint();
    else if (k === "p" || k === "P") setPaused(!paused);
    else if ((k === "r" || k === "R") && G.lost) retry();
    else if (k === "m" || k === "M") setMode(S.mode === "dig" ? "flag" : "dig", true);
    else if (k === "+" || k === "=") zoomBy(1.2);
    else if (k === "-" || k === "_") zoomBy(1 / 1.2);
    else if (k === "0") zoomBy(0);
    else return;
    e.preventDefault();
  });
  const zoomBy = (f: number) => {
    setZoom(f ? S.zoom * f : 1);
    toast(`Zoom ${Math.round(S.zoom * 100)}%`);
  };

  const btnOf = (e: Event) => (e.target as Element).closest<HTMLButtonElement>("button");
  els.diff.addEventListener("click", (e) => {
    const b = btnOf(e);
    if (!b) return;
    const k = b.dataset.k as DiffKey;
    if (k === "custom") return openCustom();
    if (k === G.key && !G.mines) return;
    confirmLeave(() => {
      S.diff = k;
      saveSettings();
      newGame({ key: k });
    });
  });
  els.logic.addEventListener("click", (e) => {
    const b = btnOf(e);
    const l = b?.dataset.l;
    if (!isLogic(l) || l === G.logic) return;
    confirmLeave(() => {
      S.logic = l;
      saveSettings();
      newSame();
    });
  });
  els.mode.addEventListener("click", (e) => {
    const m = btnOf(e)?.dataset.m;
    if (m === "dig" || m === "flag") setMode(m);
  });
  els.fresh.addEventListener("click", () => confirmLeave(newSame));
  els.hint.addEventListener("click", giveHint);
  els.retry.addEventListener("click", retry);
  els.watch.addEventListener("click", startReplay);
  els.pause.addEventListener("click", () => setPaused(!paused));
  els.resume.addEventListener("click", () => setPaused(false));
  els.daily.addEventListener("click", playDaily);
  els.share.addEventListener("click", openShare);
  els.zoomIn.addEventListener("click", () => setZoom(S.zoom * 1.2));
  els.zoomOut.addEventListener("click", () => setZoom(S.zoom / 1.2));
  els.zoomFit.addEventListener("click", () => setZoom(1));
  els.statsBtn.addEventListener("click", openStats);
  els.soundBtn.addEventListener("click", () => {
    S.sound = !S.sound;
    saveSettings();
    applySound();
    toast(S.sound ? "Sound on" : "Sound off");
    if (S.sound) {
      wakeAudio();
      sfx("flag");
    }
  });
  els.themeBtn.addEventListener("click", () => {
    const next: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };
    S.theme = next[S.theme] || "auto";
    saveSettings();
    applyTheme();
    toast(`Theme: ${THEME_LABEL[S.theme]}`);
  });

  els.rpPlay.addEventListener("click", () => {
    if (!RP) return;
    if (!RP.playing && RP.t >= RP.end) rpSeek(0);
    RP.playing = !RP.playing;
    RP.last = performance.now();
    syncReplayUi();
  });
  els.rpSeek.addEventListener("input", () => {
    if (RP) rpSeek((+els.rpSeek.value / 1000) * RP.end);
  });
  els.rpSpeed.addEventListener("click", (e) => {
    const b = btnOf(e);
    if (!b || !RP) return;
    RP.speed = +(b.dataset.s || 1);
    syncReplayUi();
  });
  els.rpClose.addEventListener("click", () => endReplay());

  for (const id of ["#cRows", "#cCols", "#cMines"]) $(id).addEventListener("input", checkCustom);
  $("#copyCode").addEventListener("click", () => void copyCode());
  $("#codeForm").addEventListener("submit", playCode);
  els.statsTabs.addEventListener("click", (e) => {
    const k = btnOf(e)?.dataset.k;
    if (!isStd(k)) return;
    statsKey = k;
    renderStats();
  });
  $("#statsReset").addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (!b.dataset.armed) {
      b.dataset.armed = "1";
      b.textContent = `Click again to reset ${DIFFS[statsKey].name}`;
      return;
    }
    delete ST[statsKey];
    saveStats();
    renderStats();
    setMeta();
    toast(`${DIFFS[statsKey].name} stats reset`);
  });
  for (const d of document.querySelectorAll("dialog")) {
    d.addEventListener("click", (e) => {
      if (e.target === d) d.close();
      if ((e.target as Element).closest("[data-close]")) d.close();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      setPaused(true);
      saveNow();
    }
  });
  window.addEventListener("pagehide", saveNow);
  let rz = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = window.setTimeout(() => {
      if (G) sizeBoard();
      syncAllThumbs();
    }, 80);
  });
  // Segment widths change once the web fonts arrive.
  void document.fonts?.ready.then(syncAllThumbs);
}

export function start(data: { mode?: string; game?: Snapshot } = {}) {
  wire();
  applyTheme();
  applySound();
  setZoom(S.zoom, false);
  if (data.mode === "dig" || data.mode === "flag") S.mode = data.mode;
  let code: BoardSpec | null = null;
  try {
    code = location.hash.length > 1 ? parseCode(location.hash) : null;
  } catch {}
  if (code) {
    newGame(code);
  } else {
    let restored = false;
    for (const s of [data.game, load<Snapshot | null>("nogs-game", null)]) {
      if (s && s.mines) {
        try {
          restore(s);
          restored = true;
          break;
        } catch {}
      }
    }
    if (!restored)
      newGame(S.diff === "custom" ? { key: "custom", ...S.custom } : { key: S.diff });
  }
  syncControls(true);
  syncAllThumbs();
}

// Test hook for the dev server only; it is stripped from production builds.
if (import.meta.env.DEV)
  Object.assign(window, {
    __nogs: {
      get G() {
        return G;
      },
      get RP() {
        return RP;
      },
      get paused() {
        return paused;
      },
      get focusIdx() {
        return focusIdx;
      },
      cells: () => cells,
      els,
      S,
      ST,
      newGame,
      giveHint,
      toggleFlag,
      startReplay,
      rpSeek,
      endReplay,
      retry,
      boardCode,
      parseCode,
      playDaily,
      openCustom,
      openStats,
      setPaused,
      saveNow,
      toCanon,
      setZoom,
      pack,
      engine: { explain, nearest },
    },
  });
