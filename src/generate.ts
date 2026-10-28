// Runs board generation in a worker, falling back to time-sliced work on the main
// thread if workers aren't available. Both paths give identical boards for a seed.
import { generate, type GenOptions } from "./engine";
import { mulberry32 } from "./rng";
import GenWorker from "./generator.worker.ts?worker&inline";

export interface GenRequest {
  R: number;
  C: number;
  M: number;
  start: number;
  seed: number;
  opt: GenOptions;
}
export interface GenResult {
  mines: Uint8Array;
  hard: number;
}

type Done = (r: GenResult | null) => void;

// undefined: not started yet; null: unavailable, use the main thread.
let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, { req: GenRequest; done: Done }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  // Browsers refuse workers on pages opened from disk; skip the noisy attempt.
  if (location.protocol === "file:") return (worker = null);
  try {
    const w = new GenWorker();
    w.onmessage = (e: MessageEvent<{ id: number; result: GenResult | null }>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      p?.done(e.data.result);
    };
    w.onerror = (e) => {
      e.preventDefault();
      worker = null;
      w.terminate();
      for (const [id, p] of pending) {
        pending.delete(id);
        onMainThread(p.req).then(p.done);
      }
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

export function generateBoard(req: GenRequest): Promise<GenResult | null> {
  const w = getWorker();
  if (!w) return onMainThread(req);
  return new Promise((done) => {
    const id = ++seq;
    pending.set(id, { req, done });
    w.postMessage({ id, req });
  });
}

/** Stops any board being built; its promise resolves with null. */
export function cancelGeneration(): void {
  mainToken++;
  if (!pending.size || !worker) return;
  worker.terminate();
  worker = undefined;
  for (const [id, p] of pending) {
    pending.delete(id);
    p.done(null);
  }
}

let mainToken = 0;
function onMainThread(req: GenRequest): Promise<GenResult | null> {
  const token = mainToken,
    it = generate(req.R, req.C, req.M, req.start, mulberry32(req.seed), req.opt);
  return new Promise((done) => {
    (function step() {
      if (token !== mainToken) return done(null);
      const t1 = performance.now();
      let r = it.next();
      while (!r.done && performance.now() - t1 < 12) r = it.next();
      if (!r.done) return void setTimeout(step, 0);
      done(r.value && { mines: r.value.mines, hard: r.value.hard });
    })();
  });
}
