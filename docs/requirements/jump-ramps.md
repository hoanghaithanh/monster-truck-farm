# Jump Ramps (Cosmetic Hop)

Status: Backlog — low-priority "delight" addition, approved alongside the player's main asks but not itself requested. No dedicated sprint required; fold in whenever convenient.

Related: `docs/architecture/0001-foundation-stack-and-structure.md` §2 (kinematic-only physics, the "truck must never behave unpredictably" design bias this doc must not violate); `docs/architecture/0013-obstacle-climb-visual.md` / `docs/architecture/0014-obstacle-climb-four-corner-sampling.md` (the existing stateless visual-lift technique this feature is expected to reuse); `docs/requirements/truck-obstacle-climbing.md` (the obstacle-climb story this rides on); `src/core/terrain.ts` (`STUB_OBSTACLES` / `StructureInstance` placement patterns).

## Problem statement

Driving over the farm's existing obstacles already gives the truck a visual lift/tilt, but nothing on the map is placed specifically to give the player a bigger, more dramatic "hop" moment — the kind of monster-truck airtime fantasy this game is themed around. This is a small, low-stakes delight addition, not a fix for a reported problem: a few scattered cosmetic ramp props that produce a bigger version of the existing climb hop would make driving around the farm more fun without adding new risk or mechanics.

## Goals / Non-goals

**Goals**
- Place a small number of ramp-like props on the farm terrain that, when driven over, give the truck a visibly bigger lift/hop than the existing bush/rock/derelict-car obstacles produce.
- The hop is achieved using the same stateless, position-derived visual-lift technique already shipped for obstacle climbing (ADR 0013/0014) — this is a locked-in decision, not open for re-litigation in this doc.
- Ramps read clearly as "drive over this for a fun bounce," in keeping with the game's colorful, kid-friendly tone.

**Non-goals**
- Real launch/air-time physics (leaving the ground, projectile motion, mid-air control, landing physics) — explicitly out of scope. This is the one locked decision from this session's planning pass: ramps are cosmetic only, using the existing visual-lift mechanism, not a new physics behavior.
- Any change to the truck's speed, handling, acceleration, or top-speed cap while on or after a ramp.
- Any change to the existing wheel-tier clearance system (`drive-terrain-and-gas.md` AC5-AC9) — ramps are not a fourth tier-gated obstacle class and do not block the truck at any tier.
- Any coin reward, gas effect, or interaction with the farmer/hit-capacity system — a ramp is a pure visual flourish with zero effect on any other game system.
- A bespoke new ramp mechanic/engineering effort — if the existing obstacle-climb system already produces a satisfying bigger hop from a bigger-radius/taller-configured entry, that's an acceptable, even preferred, implementation. This doc does not require new engineering; it may be satisfied by new tuned content alone. That call is the architect's/developer's, not specified here.
- A specific number or exact placement of ramps — "a few, scattered around the map" is the scope; exact count/positions are a developer/design-time call (see Open Questions).

## User stories

1. As a player, I want to drive over a ramp and feel my truck hop up dramatically, so driving around the farm feels more fun and fits the monster-truck fantasy.
2. As a player, I want ramps to be easy to spot while driving, so I can aim for them on purpose instead of hitting them by accident.

## Acceptance criteria

- **AC1 (ramps present):** Given the drivable farm terrain, when a player looks around, then a small number of ramp props (more than one, so it doesn't read as a single one-off gimmick) are visible at scattered locations, clear of existing obstacles/structures/the truck's start position, using the same placement-validity conventions as existing obstacle/structure placement.
- **AC2 (bigger hop than existing obstacles):** Given the truck drives over a ramp's footprint, when the truck's contact point crosses that footprint, then the truck's visible lift is noticeably larger than the lift produced by the largest existing obstacle (the derelict car) — it must read as a distinct, more dramatic "ramp" moment, not just another obstacle bump.
- **AC3 (smooth, not jarring):** The hop eases in and out smoothly — no instant pop/snap at the start or end of the ramp's footprint, no jitter, consistent with the existing climb visual's smooth-entry/exit behavior (ADR 0013 §2). A young child should experience this as a fun surprise, not a startling jolt.
- **AC4 (never blocks or slows):** Driving over a ramp never blocks, slows, or otherwise impedes the truck's forward progress at any wheel tier — every tier can drive over every ramp; a ramp is passable, not tier-gated, unlike the bush/rock/derelict-car clearance system.
- **AC5 (no chaotic motion):** The hop never flips, spins, launches the truck off-screen, or otherwise destabilizes the truck's motion, and never requires precision timing or special input from the player — consistent with ADR 0001 §2's "truck must never behave unpredictably" design bias and the same no-chaos bar already established for obstacle climbing (`truck-obstacle-climbing.md` AC3). This is the one non-negotiable constraint of this doc (see Constraints).
- **AC6 (no mechanical side effects):** Driving over a ramp never counts as a hit against body capacity, never affects gas level, never awards or costs coins, and never interacts with the farmer/game-over system in any way — purely a visual flourish, exactly like passing over a clearable obstacle today (`truck-obstacle-climbing.md` AC4).
- **AC7 (truck lands normally):** After crossing a ramp's footprint, the truck settles back to normal ground height/orientation with no lingering visual offset, and the player retains full, immediate control — no post-ramp "recovery" state of any kind.

## Open questions

1. **Exact ramp count and placement:** How many ramps, and where? This doc specifies "a few, scattered" as the intent; exact number/coordinates are a non-blocking developer/design-time call, same treatment as existing obstacle/structure placement (`environment-dressing.md` Open Question 1 precedent).
2. **Visual asset:** What should a ramp prop look like (a dirt mound, a wooden/metal ramp shape, etc.)? Art/asset decision, not specified here — flag for whoever implements, non-blocking. Given this is explicitly low-priority/"fold in wherever convenient," a simple procedural shape (e.g., reusing the existing obstacle rendering approach with a new configured entry) is an acceptable minimum; a bespoke authored asset is a nice-to-have, not required.
3. **Exact hop magnitude tuning:** AC2 only requires "noticeably larger than the derelict car's lift" — the precise peak-height number is a tuning constant, consistent with how `DEFAULT_CLIMB_CONFIG`'s other values are left as playtest-tunable placeholders (ADR 0013 "Tuning knobs").

## Constraints

- **Non-negotiable:** ramps must never introduce any risk of the truck flipping or behaving unpredictably. This ties directly back to ADR 0001 §2's design intent (kinematic-only arcade movement chosen specifically because "a full rigid-body vehicle would fight us here... a dynamics-driven truck can flip or spin unpredictably") — a real jump/launch mechanic would cut directly against that foundational decision, which is why this doc locks the implementation to a cosmetic hop only. Real air-time physics is explicitly rejected, not merely deferred.
- Must not alter or re-tune the existing wheel-tier clearance system (`drive-terrain-and-gas.md` AC5-AC9) or the existing obstacle-climb visual system's behavior on bush/rock/derelict car (`truck-obstacle-climbing.md` AC1-AC6) — this is additive content/tuning, not a rebalance.
- Runs in-browser (Three.js + Vite), same as every other feature — given constraint, not a decision made here.
- Low-priority, small-scope: this doc should not be over-specified or treated as load-bearing. If the existing obstacle-climb mechanism already satisfies AC2-AC7 with nothing more than a new tuned obstacle/structure entry, that is a fully acceptable — even preferred — way to close this story; no bespoke ramp-specific engineering is required by this doc.
