# Truck Obstacle Climbing (Realistic Clearance Interaction)

Status: Done (Sprint 4) — issue [#42](https://github.com/hoanghaithanh/monster-truck-farm/issues/42) closed 2026-07-09. Implemented per `docs/architecture/0013-obstacle-climb-visual.md` (stateless position-derived lift/tilt), then revised to four-corner per-wheel sampling via `docs/architecture/0014-obstacle-climb-four-corner-sampling.md` after acceptance testing found single-center-point sampling let the rock obstacle visually clip through the cab. Acceptance: `docs/acceptance/sprint-4-adr0014-obstacle-climb-four-corner-2026-07-09.md`, AC1-AC6 Met.

Related: `docs/architecture/0001-foundation-stack-and-structure.md` §2 (the arcade kinematic-only physics decision this touches), `docs/requirements/drive-terrain-and-gas.md` (AC5-AC9, the existing clearance rule this doc modifies the *feel* of, not the *rule* of), `src/core/clearance.ts`, `src/physics/world.ts`.

## Problem statement

Direct human playtest feedback (2026-07-09): obstacles the truck's wheel tier is rated to clear (per `drive-terrain-and-gas.md` AC6-AC8 — a bush, rock, or derelict car at or below the truck's clearance) are currently driven straight *through* at a constant height, with zero physical interaction, because "passable" obstacles get no collider at all (`src/physics/world.ts`'s `createObstacleColliders()` only builds colliders for `blocking` obstacles). The truck itself has no vertical (Y) axis in its movement whatsoever — height is a hardcoded constant everywhere (`TRUCK_HALF_HEIGHT`) — so even obstacles it's rated to clear produce no visible response. The human wants the truck to *look and feel* like it's realistically climbing over a clearable obstacle, not phasing through it.

## Goals / Non-goals

**Goals**
- When the truck drives over an obstacle its wheel tier can clear (the existing `passable` partition from `src/core/clearance.ts`), the player should see and feel some convincing physical response — at minimum, the truck's silhouette visibly reflects the obstacle's presence as it passes over, rather than gliding through at a perfectly flat, unchanged height.
- Preserve the existing, already-shipped clearance *rule* (`drive-terrain-and-gas.md` AC6-AC9: wheel tier determines which obstacles block vs. pass, no damage/penalty for being blocked) — this doc is about how passing *looks and feels*, not about changing which obstacles are passable to which tier.
- Preserve the target player experience: forgiving, predictable, never chaotic or flip-inducing (ADR 0001's "young child" design bias applies here as much as anywhere else in the game).

**Non-goals**
- Changing which obstacles are blocking vs. passable, or the wheel-tier/obstacle-class rule itself (`canClear()` in `src/core/clearance.ts`) — untouched by this doc.
- Any change to how `blocking` obstacles behave (the truck already correctly stops/slides around those; not reported as a problem).
- General ramps, hills, or uneven terrain elsewhere in the world — this doc is scoped to the existing discrete obstacle instances (bush/rock/derelict car and any future obstacle instances of the same kind), not a terrain-heightmap system.
- Suspension simulation, wheel-independent ground contact, or vehicle body roll/pitch physics as a general-purpose system — see Open Question 1; a full physical simulation is one candidate solution, not a stated goal in itself. The goal is the player-visible outcome, not a specific technique.

## User stories

1. As a player, I want my truck to visibly rise up and over an obstacle it's rated to clear (like a real monster truck driving over a rock), instead of driving straight through it as if it wasn't there, so obstacles feel real and my wheel-tier upgrades feel like they matter even for obstacles I *can* clear, not just ones I can't.

## Acceptance criteria

These describe the required *player-visible outcome*. They deliberately do not specify a technique (full physics vs. a visual approximation) — that tradeoff is Open Question 1, for the architect and human to resolve, not assumed here.

- **AC1 (visible height/silhouette response):** Given a truck driving over an obstacle at or below its wheel clearance (the existing `passable` set), when the truck's contact point crosses the obstacle's footprint, then the truck's rendered body visibly rises to pass over the obstacle's silhouette (and descends again after), rather than maintaining a perfectly flat, unchanged height throughout — the obstacle must read as physically "underneath" the truck at the moment of crossing, not as a see-through decoration.
- **AC2 (no false blocking):** The visible climb response never prevents or measurably slows the truck's forward progress in a way that makes a `passable` obstacle feel like it's blocking — it must still clearly read as "drove over it," consistent with the existing clearance rule (`drive-terrain-and-gas.md` AC6-AC8), not as a new soft obstacle.
- **AC3 (no chaotic motion):** The climb response never flips, spins, launches, or otherwise destabilizes the truck, and never requires precision timing/input from the player to execute correctly — consistent with the young-child-friendly, forgiving design bias already established project-wide (ADR 0001 §1).
- **AC4 (still no damage/penalty):** Passing over a clearable obstacle, climb visual included, never counts as a hit against body capacity and never triggers any fail state — this carries over `drive-terrain-and-gas.md` AC9 unchanged.
- **AC5 (works across all three wheel tiers and obstacle classes within a tier's clearance):** The visible climb response applies consistently for every truck/obstacle pairing already covered by `drive-terrain-and-gas.md` AC6-AC8 (e.g. Tier 0 over a bush; Tier 2 over a bush, rock, or derelict car) — not just a single hand-picked case.
- **AC6 (blocking obstacles unaffected):** Obstacles above the truck's clearance continue to behave exactly as they do today (stop/slide, no climb attempt) — this doc does not change `blocking`-obstacle behavior in any way.

## Open questions

1. ~~**(Blocking — needs both human and architect input) Visual approximation vs. full physical simulation.**~~ **Resolved by the human (2026-07-09): approach (a), lightweight visual approximation.** Procedurally lift/tilt the truck body over a known obstacle footprint using a scripted curve/height-sample keyed to the obstacle's position and the truck's speed, without a genuine vertical physics axis — stays within the existing arcade-kinematic architecture (ADR 0001 §2), lower risk of destabilizing the "never flips, always predictable" design bias. Explicitly rejected: (b) real vertical physics (ground-follow/ramp/suspension-style movement) — a materially larger change touching the truck's collider, the kinematic controller, every hardcoded `TRUCK_HALF_HEIGHT` reference, and ADR 0001 §2's foundational kinematic-only decision; not pursued given this project's arcade/forgiving design bias and the risk to already-hardened physics code (issues #18/#21/#31).
2. ~~**(Non-blocking — architect's design question) Mechanism.**~~ **Resolved via `docs/architecture/0013-obstacle-climb-visual.md`, then revised via `docs/architecture/0014-obstacle-climb-four-corner-sampling.md`**: a raised-cosine height field sampled at the truck's four wheel corners (not a single truck-center point, per ADR 0014's fix for the rock-clipping defect ADR 0013's single-point sampling couldn't avoid), tuned per obstacle `sizeClass` via `DEFAULT_CLIMB_CONFIG`, integrated into `setTruckTransform()` as an optional `climb` argument.
3. ~~**(Non-blocking) Sprint sizing.**~~ **Resolved**: shipped in Sprint 4 as a single S-M-sized story (issue #42), in line with the original estimate once the mechanism was designed.

## Constraints

- Must not change the existing wheel-tier/obstacle-class clearance *rule* (`src/core/clearance.ts`'s `canClear()`/`partitionObstacles()`) — this is purely about how a `passable` crossing looks and feels.
- Whatever approach is chosen must not regress ADR 0001's target-player design bias (forgiving, predictable, never chaotic, never a fail state from terrain interaction) — this is a hard constraint, not a nice-to-have, given the young-child audience.
- Runs in-browser (Three.js + Vite + Rapier3D-compat, per ADR 0001) — any physics-model change stays within the existing Rapier adapter seam (`src/physics/world.ts`) per ADR 0001 §4's `core/` purity boundary.
- **Timeline/sizing constraint (explicit):** do not treat this as a small follow-on fix alongside the other three playtest issues in this batch. It is architecturally the largest of the four by a wide margin and its size is not knowable until Open Question 1 is answered — flagged so it isn't accidentally pulled into a sprint at the same size/confidence as the wheel-motion or cosmetic-removal items above.
