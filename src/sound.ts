// Tiny WebAudio synth. Nothing is created until the first sound plays.

type Ctx = AudioContext;
let ctx: Ctx | null = null;

function ac(): Ctx | null {
  if (!ctx) {
    const A =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!A) return null;
    ctx = new A();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  at?: number;
  slide?: number;
}
function tone(f: number, dur: number, o: ToneOpts = {}): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + (o.at || 0),
    osc = c.createOscillator(),
    gn = c.createGain();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(f, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + 0.008);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gn).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number): void {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur),
    buf = c.createBuffer(1, len, c.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource(),
    lp = c.createBiquadFilter(),
    gn = c.createGain();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  gn.gain.value = vol;
  src.buffer = buf;
  src.connect(lp).connect(gn).connect(c.destination);
  src.start();
}

const fx = {
  dig: () => tone(520, 0.06, { type: "triangle", vol: 0.12, slide: 380 }),
  open: () => {
    tone(360, 0.13, { type: "triangle", vol: 0.12, slide: 640 });
    tone(820, 0.1, { vol: 0.05, at: 0.05 });
  },
  flag: () => {
    tone(880, 0.05, { type: "square", vol: 0.035 });
    tone(1320, 0.06, { type: "square", vol: 0.03, at: 0.045 });
  },
  unflag: () => tone(660, 0.07, { type: "square", vol: 0.03, slide: 440 }),
  nope: () => tone(170, 0.09, { type: "square", vol: 0.035 }),
  hint: () => {
    tone(988, 0.18, { vol: 0.07 });
    tone(1319, 0.26, { vol: 0.06, at: 0.09 });
  },
  win: () =>
    [523, 659, 784, 1047].forEach((f, k) =>
      tone(f, 0.34, { type: "triangle", vol: 0.12, at: k * 0.09 }),
    ),
  lose: () => {
    noise(0.6, 0.45);
    tone(150, 0.5, { type: "sawtooth", vol: 0.06, slide: 45 });
  },
};
export type SoundName = keyof typeof fx;

export function playSound(name: SoundName): void {
  try {
    fx[name]();
  } catch {}
}

/** Call from a user gesture so later sounds are allowed to play. */
export function wakeAudio(): void {
  try {
    ac();
  } catch {}
}
