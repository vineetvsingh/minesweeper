# No-Guess Minesweeper

Minesweeper where every board can be solved by logic alone. After your first click, a
solver plays the board using only the numbers; if it would ever need a guess, the board
is rebuilt before you see it. Hints and losses explain the reasoning.

**Play it:** https://vineetvsingh.github.io/minesweeper/

Every push to `main` runs the tests, builds the game and deploys it to GitHub Pages
(`.github/workflows/deploy.yml`).

## Commands

```sh
npm install        # once
npm run dev        # dev server with hot reload
npm test           # engine tests (Vitest)
npm run typecheck  # TypeScript, no output
npm run build      # type-check, then build dist/index.html
npm run preview    # serve the build locally
```

The build is a single self-contained `dist/index.html` (scripts, styles and the
generator worker inlined). It opens straight from disk, or can be hosted anywhere as
one static file. Opened from disk, browsers don't allow workers, so boards are built
on the main thread in short slices instead; served over HTTP they're built in a worker.

## Layout

| File | What it does |
|---|---|
| `src/engine.ts` | Board generation, the deduction solver, hint explanations, 3BV. Pure logic, no DOM. |
| `src/generate.ts`, `src/generator.worker.ts` | Runs generation in a worker, with a main-thread fallback. |
| `src/config.ts` | Difficulties, logic levels, share codes and daily boards. |
| `src/game.ts` | The game UI: input, rendering, timer, stats, replay, dialogs. |
| `src/fx.ts` | Animations (Web Animations API), toasts, confetti. |
| `src/storage.ts` | Settings, stats and daily results in `localStorage`. |
| `src/sound.ts`, `src/stats.ts`, `src/format.ts` | Sound effects, the stats dialog, formatting helpers. |
| `tests/engine.test.ts` | Engine and share-code tests. |

Share codes and daily boards are reproduced from a seed by `engine.ts`. Changing how
the generator uses random numbers changes which board an existing code produces.
