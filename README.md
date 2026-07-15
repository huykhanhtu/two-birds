# Two Birds 🐦🐦

A web arcade game — a reskin of *Two Cars*. Two birds fly up two half-fields (two lanes each); tap left/right to switch the bird on that side, **dodge the poles** and **catch the seeds**. Miss a seed or hit a pole and it's game over. Endless, gets faster.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
```

Controls: **A / ←** switch the left bird, **D / →** the right bird — or **tap** the left/right half of the screen (mobile). Space / tap to restart.

## Stack

TypeScript + Vite + raw Canvas 2D — no game engine ([ADR-0007](../../docs/architecture/decisions/0007-two-birds-stack-ts-vite-canvas.md)). The game logic is a **pure, deterministic core** (`src/core/`, fixed 60Hz timestep, seeded RNG, zero DOM) so it is fully unit-testable and the spawner's fairness is provable ([ADR-0008](../../docs/architecture/decisions/0008-two-birds-fixed-timestep-pure-core.md)).

## Tests

```bash
npm test         # vitest unit + fairness property test
npm run test:e2e # Playwright (real browser) — needs: npx playwright install chromium
```

## Roadmap

Wave 1 core gameplay (shipped) → Wave 2 scoring + difficulty ramp + best score → Wave 3 sprites/SFX + deploy to GitHub Pages.
