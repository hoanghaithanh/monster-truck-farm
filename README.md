# Monster Truck Farm

A cute, bouncy 3D browser game: build a toy monster truck, tear around a farm, **boop** animals for coins (they fly, land, shake it off and trot away — nobody gets hurt), pull stunts, dodge a grumpy farmer on a tractor, and upgrade your truck until it's a neon-rimmed, rocket-powered legend.

Built for a 6-year-old and the 30-year-old sitting next to him. Runs in any modern browser; nothing to install, nothing to download but ~180 kB of JavaScript.

## How to play

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Drive | `W A S D` / arrow keys | left stick, `RT` gas, `LT` brake | ◀ ▶ ▲ ▼ |
| Jump | `Space` | `A` | ⤴ |
| Nitro boost | `Shift` (or `X`) | `X` / `RB` | 🔥 |
| Honk | `H` (or `E`, `F`) | `Y` / `B` | 📯 |
| Pause / settings | `Esc` (or `P`) | `Start` | ⏸ |

**In the air:** steer to spin, hold brake to backflip. **On the ground:** brake + steer to drift.

### The loop

1. **Garage** — your truck spins on a turntable in the farmyard. Collect trucks, spend coins on four upgrades (4 tiers each), pick paint, finish and a decal, hit **GO**.
   - **Trucks** (buy once, switch any time; upgrades apply to all of them):
     🛻 Pickup (balanced) · 🏎️ Dune Buggy (quick off the line) · 🚌 School Bus (+2 hearts, slower) · 🦈 Shark Bite (water doesn't slow it) · 🦖 Dino Crush (smashes one size bigger) · 🐂 Raging Bull (+50% nitro, +25% boop coins)
   - 🛡️ **Armor** = hearts (3 → 6) plus bars, lights, wing, neon · 🛞 **Wheels** = what you can smash (hay/fences → rocks → boulders → old cars) · 🔥 **Engine** = speed · ⚡ **Tank** = nitro
   - 12 paints, 3 finishes (shiny / metal / matte), 8 decals — all free
2. **One farm day** — a run lasts from sunrise to sunset (180 s). The sky is the clock.
3. **Boop animals** for coins. Chain boops for a multiplier (up to x8). Bigger animals pay more; rare **golden** animals pay 5x. A flying animal that lands on another one is a **Strike!**
4. **Missions** (three at a time, top-left) pay coins and add **+10 s of daylight**.
5. **Style**: big air, spins, backflips, drifts and smashing things earn style points, which convert to coins at the end and refill your nitro. Land a trick wheels-down and straight for a **Clean Landing** bonus.
6. **The farmer** shows up on his tractor now and then. While he's chasing you, coins are **doubled**. If he bumps you, you lose a heart and drop some coins (grab them back). Escape by outrunning him, juking (he turns wide), jumping over him, honking in his face, or crossing the river — tractors can't swim.
7. **Surprises**: stampedes, chicken parties, nitro drops, five hidden **golden corn** per run, a dozen ramps, a stunt park, a mud pit, two hills, a pond and a lake to splash through.
8. **Sunset** (or zero hearts) ends the day: tally, medal (🥉 2,500 · 🥈 8,000 · 🥇 20,000 · 🌈 45,000), back to the garage.

Coins, parts, paint, best score and settings are saved in the browser (`localStorage`).

### For little players

Driving helpers are on by default (gentle aim-assist toward animals, generous boop radius, and **the last heart is safe** — the farmer can only scatter coins, so the day always runs to sunset). The farmer takes at most one heart per visit and eases off every time he catches you. A truck pinned against something pops itself free after a moment. Nothing needs reading: missions are icon + progress bar. Helpers, screen shake/flashes, volume, music and graphics quality are in the pause menu (`Esc` or ⚙️).

## Running it

```bash
npm install
npm run dev        # dev server, open the printed URL
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build
npm test           # unit tests + headless bot playthroughs
npm run typecheck
npm run lint
```

## Tech

- [Three.js](https://threejs.org/) for rendering, [Vite](https://vitejs.dev/) + TypeScript, [Vitest](https://vitest.dev/), ESLint.
- **No physics engine, no model files, no textures, no audio files.** Physics is a small custom arcade model; every model is built in code from rounded primitives; every sound is synthesized with WebAudio.
- Layout:
  - `src/core/` — the whole game as a headless, deterministic simulation (`Sim`): world layout, truck physics, animals, farmer, missions, scoring, save. Pure TypeScript, no DOM/three (enforced by ESLint), so tests can play entire runs with bots.
  - `src/render/` — three.js: engine (sky, time of day, shadows, post-FX, quality levels), farm scenery, truck model, critters, particles, chase camera.
  - `src/audio/` — WebAudio synth (engine loop, SFX, adaptive music).
  - `src/input/` — keyboard, gamepad, touch.
  - `src/ui/` — DOM HUD, garage, summary, pause/settings.
  - `src/game.ts` — glue: state machine, and turning simulation events into juice.
- Graphics quality: Low / Med / High (shadows, post-processing, grass density, particle counts, pixel ratio), auto-picked from measured frame time.

## Docs

- [`docs/overhaul/`](docs/overhaul/) — the 2026-11 overhaul: diagnosis of the old game, plan, before/after screenshots, final report.
- [`docs/backlog.md`](docs/backlog.md) — what's next.
- `docs/requirements/`, `docs/architecture/`, `docs/acceptance/` — history of the pre-overhaul game (superseded; kept for reference).
- [`CREDITS.md`](CREDITS.md)
