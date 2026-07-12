# Monster Truck Farm

A simple 3D browser game built for the developer's son. Build a monster truck, drive it around a farm, boop animals for coins, and upgrade your truck to take on bigger obstacles and a chase-happy farmer.

Runs entirely in the browser — nothing to install for the player.

## Core gameplay loop

1. **Build** — pick a body, wheels, an engine, and a gas tank for your truck. Each part is its own upgrade axis: body = how many hits you can take from the farmer, wheels = how big an obstacle you can clear, engine = top speed, gas tank = how long you can drive before needing to stop and refuel.
2. **Drive** — the truck spawns on a farm map with hills, a river, a landmark mountain, and farm structures (windmill, barn, farmhouse, silo, chicken coop, fences, fields).
3. **Chase** — cows, chickens, and pigs spawn around the farm and wander or flee.
4. **Reward** — booping an animal (they aren't harmed — just scatter) awards coins. Bigger, faster animals pay out more.
5. **Upgrade** — spend coins in the builder on better parts, looping back into the build step.
6. **Gas** — driving continuously drains a gas meter, which regenerates while stopped or idle. Running out just limits the truck; it doesn't end the run.
7. **Farmer chase** — an angry farmer occasionally shows up, chases the truck, and can bump it, draining one hit from the body's capacity. The farmer's top speed is capped at a third of the truck's.
8. **Game over** — if the farmer drains the body's hits to zero, it's a hard game over: rebuild your truck and start again. That's a deliberate exception to the game's otherwise-forgiving design, since starting over is part of the challenge for this player.

Target player is a young child, so the game favors forgiving mechanics, bright colors, no violence framing, short sessions, and simple keyboard-only controls.

For the full design rationale, requirements, and technical decisions, see [`docs/`](docs/) — in particular [`docs/requirements/`](docs/requirements/) for acceptance criteria per feature, [`docs/architecture/`](docs/architecture/) for ADRs, [`docs/backlog.md`](docs/backlog.md) for the prioritized backlog, and [`docs/retrospectives.md`](docs/retrospectives.md) for sprint retros.

## Tech stack

- [Three.js](https://threejs.org/) for 3D rendering
- [Rapier](https://rapier.rs/) (via `@dimforge/rapier3d-compat`) for physics/collision
- [Vite](https://vitejs.dev/) for dev server/bundling
- TypeScript, [Vitest](https://vitest.dev/) for tests, ESLint for linting
- glTF models for truck parts, animals, and farm structures (see [`CREDITS.md`](CREDITS.md) for sourcing/licensing)
- Deployed as a static site

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in a browser.

### Other scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm run build` | Typecheck, then produce a production build |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Run TypeScript in `--noEmit` mode |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Controls

Keyboard only — no mouse required to play (a couple of buttons, like the in-HUD Shop button, are also mouse-clickable, but every action has a keyboard equivalent).

**Driving:**

| Key | Action |
| --- | --- |
| `Arrow Up` / `W` | Accelerate forward |
| `Arrow Down` / `S` | Reverse/brake |
| `Arrow Left` / `A` | Steer left |
| `Arrow Right` / `D` | Steer right |

**Builder screen:**

| Key | Action |
| --- | --- |
| `Arrow Up` / `Arrow Down` | Move focus between rows (body, wheels, engine, gas tank, wheel look) |
| `Arrow Left` / `Arrow Right` | Move the highlight within the focused row |
| `Space` | Buy/equip the highlighted option |
| `Enter` | Confirm and start driving (or resume, if this is a mid-run pause) |

**Game over screen:**

| Key | Action |
| --- | --- |
| `Enter` / `Space` | Restart (back to the builder) |

## Project structure

- `src/core/` — pure game logic (physics-adjacent math, state machines, systems) kept framework-agnostic and easy to unit test
- `src/render/` — Three.js scene setup, truck rig assembly, asset loading
- `src/ui/` — DOM-based overlay screens (builder, HUD, game over)
- `src/input/` — keyboard input handling
- `src/systems/` — cross-cutting gameplay systems (e.g. gas)
- `src/main.ts` — wires everything together and drives the frame loop

## Contributing

This project is developed using a small pipeline of specialized Claude Code subagents (requirements-analyst, architect, developer, test-engineer, code-reviewer, security-auditor, tech-writer, project-manager) — see `CLAUDE.md` for how that pipeline is orchestrated if you're picking up work here.
