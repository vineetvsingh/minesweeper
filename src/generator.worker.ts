// Builds boards off the main thread so the page never stutters while the solver runs.
import { generateNow } from "./engine";
import { mulberry32 } from "./rng";
import type { GenRequest } from "./generate";

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<{ id: number; req: GenRequest }>) => {
  const { id, req } = e.data;
  const v = generateNow(req.R, req.C, req.M, req.start, mulberry32(req.seed), req.opt);
  const result = v && { mines: v.mines, hard: v.hard };
  ctx.postMessage({ id, result }, v ? [v.mines.buffer] : []);
};
