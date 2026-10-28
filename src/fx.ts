// Motion: Web Animations on transform and opacity only, so effects run on the
// compositor and never force layout. Everything is skipped under reduced motion.

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
export const motionOK = (): boolean => !reduce.matches;

const SPRING = "cubic-bezier(.34,1.4,.64,1)";
const OUT = "cubic-bezier(.2,.8,.2,1)";

/** Grows an element in after delay ms; it stays hidden until its turn. */
export function popIn(el: Element, delay = 0, from = 0.6, duration = 230): void {
  if (!motionOK()) return;
  el.animate([{ transform: `scale(${from})`, opacity: 0 }, { transform: "none", opacity: 1 }], {
    duration,
    delay,
    easing: SPRING,
    fill: "backwards",
  });
}

/** A quick squeeze, for "not yet" feedback. */
export function nudge(el: Element): void {
  if (!motionOK()) return;
  el.animate(
    [{ transform: "none" }, { transform: "scale(.84)", offset: 0.4 }, { transform: "none" }],
    { duration: 260, easing: "ease-in-out" },
  );
}

export function shake(el: Element): void {
  if (!motionOK()) return;
  el.animate(
    [
      { transform: "none" },
      { transform: "translateX(-7px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(2px)" },
      { transform: "none" },
    ],
    { duration: 420, easing: "ease-in-out" },
  );
}

/** A small pulse, for counters that just changed. */
export function bump(el: Element): void {
  if (!motionOK()) return;
  el.animate([{ transform: "scale(1.16)" }, { transform: "none" }], {
    duration: 200,
    easing: OUT,
  });
}

export function fadeIn(el: Element, dy = 4, duration = 200): void {
  if (!motionOK()) return;
  el.animate([{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: "none" }], {
    duration,
    easing: OUT,
  });
}

export function dialogIn(d: HTMLDialogElement): void {
  if (!motionOK()) return;
  d.animate(
    [
      { opacity: 0, transform: "translateY(10px) scale(.97)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 220, easing: OUT },
  );
  try {
    d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, pseudoElement: "::backdrop" });
  } catch {}
}

/** Moves a segmented control's highlight under its pressed button. */
export function syncThumb(seg: HTMLElement, instant = false): void {
  let th = seg.querySelector<HTMLElement>(":scope > .thumb");
  if (!th) {
    th = document.createElement("span");
    th.className = "thumb";
    th.setAttribute("aria-hidden", "true");
    seg.prepend(th);
    seg.classList.add("has-thumb");
    instant = true;
  }
  const b = seg.querySelector<HTMLElement>('button[aria-pressed="true"]');
  if (!b || !b.offsetWidth) {
    th.style.opacity = "0";
    return;
  }
  const still = instant || !motionOK() || th.style.opacity === "0";
  if (still) th.style.transition = "none";
  th.style.opacity = "1";
  th.style.width = b.offsetWidth + "px";
  th.style.height = b.offsetHeight + "px";
  th.style.transform = `translate(${b.offsetLeft}px, ${b.offsetTop}px)`;
  if (still) {
    void th.offsetWidth;
    th.style.transition = "";
  }
}

let toastT = 0;
/** A short message that floats in and leaves on its own. */
export function toast(text: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  clearTimeout(toastT);
  el.textContent = text;
  if (el.hidden) {
    el.hidden = false;
    fadeIn(el, 10, 180);
  }
  toastT = window.setTimeout(() => {
    const done = () => (el.hidden = true);
    if (!motionOK()) return done();
    el.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(6px)" }], {
      duration: 180,
      easing: "ease-in",
    }).onfinish = done;
  }, 1600);
}

/** Confetti from a point, drawn on a throwaway canvas. */
export function confetti(ox: number, oy: number): void {
  if (!motionOK()) return;
  const cv = document.createElement("canvas");
  cv.className = "confetti";
  document.body.appendChild(cv);
  const dpr = Math.min(2, devicePixelRatio || 1),
    W = innerWidth,
    H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const x = cv.getContext("2d");
  if (!x) return cv.remove();
  x.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement),
    cols = ["--accent", "--n1", "--n2", "--n4", "--n6", "--pair"].map((v) =>
      cs.getPropertyValue(v).trim(),
    );
  const P = Array.from({ length: 150 }, (_, k) => ({
    x: ox,
    y: oy,
    vx: (Math.random() - 0.5) * 13,
    vy: -Math.random() * 12 - 3,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    w: 5 + Math.random() * 5,
    h: 3 + Math.random() * 4,
    c: cols[k % cols.length],
  }));
  const t0 = performance.now(),
    life = 2400;
  let last = t0;
  (function frame(now: number) {
    if (!cv.isConnected) return;
    const t = now - t0,
      k = Math.min(3, (now - last) / 16.7);
    last = now;
    x.clearRect(0, 0, W, H);
    x.globalAlpha = Math.max(0, 1 - t / life);
    for (const p of P) {
      p.vy += 0.32 * k;
      p.vx *= 0.99 ** k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.r += p.vr * k;
      x.save();
      x.translate(p.x, p.y);
      x.rotate(p.r);
      x.fillStyle = p.c;
      x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      x.restore();
    }
    if (t < life) requestAnimationFrame(frame);
    else cv.remove();
  })(t0);
}
export const clearConfetti = (): void =>
  document.querySelectorAll(".confetti").forEach((c) => c.remove());
