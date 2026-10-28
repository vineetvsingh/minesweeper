// The statistics dialog body: tiles, today's daily, a trend line and recent wins.
import { fmtDate, fmtS, plural } from "./format";
import type { DailyEntry, Stat, WinEntry } from "./storage";

export function statsHtml(s: Stat, daily: DailyEntry | undefined): string {
  const tiles: [string, string | number][] = [
    ["Played", s.played],
    ["Win rate", s.played ? Math.round((s.won / s.played) * 100) + "%" : "—"],
    ["Streak", s.streak],
    ["Best streak", s.bestStreak],
    ["Best time", s.best != null ? fmtS(s.best) : "—"],
    ["Best 3BV/s", s.bestRate != null ? s.bestRate.toFixed(2) : "—"],
  ];
  const rows = s.recent
    .slice(-6)
    .reverse()
    .map(
      (e) =>
        `<tr><td>${fmtDate(e.d)}</td><td>${fmtS(e.s)}</td><td>${e.rate.toFixed(2)}</td><td>${e.eff}%</td><td>${e.h || "—"}</td><td>${e.l || "—"}</td></tr>`,
    )
    .join("");
  return (
    `<div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><span class="lbl">${l}</span><span class="val">${v}</span></div>`).join("")}</div>` +
    `<h3>Today's daily</h3><p>${daily ? `Done in ${fmtS(daily.s)}${daily.h ? ` with ${plural(daily.h, "hint")}` : ""}.` : "Not played yet."}</p>` +
    `<h3>Winning times, last ${Math.min(30, s.recent.length) || 30} wins</h3>` +
    (s.recent.length >= 2
      ? sparkline(s.recent)
      : `<p class="note">Win a couple of games to see your trend.</p>`) +
    (rows
      ? `<h3>Recent wins</h3><div class="table-wrap"><table class="recent"><thead><tr><th>Date</th><th>Time</th><th>3BV/s</th><th>Eff.</th><th>Hints</th><th>Logic</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : "")
  );
}

// One series, so no legend: the heading names it. Native tooltips on each point.
function sparkline(list: WinEntry[]): string {
  const W = 560,
    H = 120,
    L = 44,
    Rm = 10,
    T = 10,
    B = 22,
    vals = list.map((e) => e.s),
    lo = Math.min(...vals),
    hi = Math.max(...vals),
    span = hi - lo || 1,
    x = (k: number) => L + (k * (W - L - Rm)) / Math.max(1, list.length - 1),
    y = (v: number) => T + ((hi - v) / span) * (H - T - B),
    ax = (v: number) => (hi < 10 ? v.toFixed(1) : v.toFixed(0)) + "s";
  const pts = list.map((e, k) => `${x(k).toFixed(1)},${y(e.s).toFixed(1)}`).join(" ");
  const dots = list
    .map(
      (e, k) =>
        `<g><title>${fmtS(e.s)} · ${e.rate.toFixed(2)} 3BV/s · ${e.eff}% efficient${e.h ? ` · ${plural(e.h, "hint")}` : ""} · ${fmtDate(e.d)}</title><circle class="hit" cx="${x(k)}" cy="${y(e.s)}" r="11"/><circle class="dot" cx="${x(k)}" cy="${y(e.s)}" r="4"/></g>`,
    )
    .join("");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Winning times from ${fmtS(vals[0])} to ${fmtS(vals[vals.length - 1])}, best ${fmtS(lo)}">
    <line x1="${L}" x2="${W - Rm}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line)" stroke-dasharray="3 4"/>
    <line x1="${L}" x2="${W - Rm}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
    <text class="ax" x="${L - 6}" y="${y(hi) + 4}" text-anchor="end">${ax(hi)}</text>
    <text class="ax" x="${L - 6}" y="${y(lo) + 4}" text-anchor="end">${ax(lo)}</text>
    <text class="ax" x="${L}" y="${H - 6}">older</text>
    <text class="ax" x="${W - Rm}" y="${H - 6}" text-anchor="end">latest</text>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}</svg>`;
}
