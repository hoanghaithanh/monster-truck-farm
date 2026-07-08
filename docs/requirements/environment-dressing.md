# Environment Dressing — Windmill, Barn, Farmhouse, River, Mountains

Status: Sprint 3 (draft — depends on Open Question 1 in this doc's parent art-direction decision, tracked centrally in `vehicle-and-character-art.md` Open Question 1; do not finalize art sourcing until that's answered).

Related: `docs/backlog.md` row 16; `drive-terrain-and-gas.md` (terrain bounds, soft boundary, existing obstacle-clearance system); `truck-builder-and-upgrades.md` / `docs/architecture/0002-upgrade-tier-data-model.md` (the wheel-tier clearance system this doc must not disturb); `vehicle-and-character-art.md` (shared art-direction and perf/loading NFRs — read that doc's Open Question 1 and Non-functional section first, they apply here too).

## Problem statement

The farm world currently renders as a bare green plane with three primitive-shape obstacles (bush/rock/derelict car) standing in for terrain variety. Sprints 1-2 deliberately deferred all farm dressing to keep gameplay logic the focus. Now that the core loop (build → drive → chase → gas → farmer → upgrade → fuel pickups) is stable, the world needs to look like an actual farm — a windmill, barn, farmhouse, river, and mountains — so play sessions feel like they're happening somewhere, not on an abstract test plane.

## Goals / Non-goals

**Goals**
- Add visible windmill, barn, and farmhouse structures to the drivable scene.
- Add a river and mountains that establish the farm's sense of place and give the terrain's edges a visual identity (mountains double as the answer to `drive-terrain-and-gas.md` Open Question 3 — a visible horizon rather than an invisible wall).
- Define, per structure, whether it is a physical obstacle or pure backdrop, so the developer/architect has an unambiguous rule to implement against rather than discovering it mid-build.
- Keep the existing wheel-tier clearance system (bush/rock/derelict car, drive AC5-AC9) completely untouched — this doc is additive dressing, not a rebalance.

**Non-goals (Sprint 3)**
- No new obstacle *class* tied to wheel tiers. None of these five structures becomes a fourth tier-gated obstacle type. (See AC5.)
- No new gameplay mechanic tied to the river (no swimming, no fording penalty, no boat) or the mountains (not a driveable slope) this sprint.
- No sound design for the environment (ambient farm audio, windmill creak, river flow) — out of scope, project-wide sound design is deferred per `CLAUDE.md`.
- No animation requirement for the windmill blades or river flow beyond what's cheap/free from the chosen art asset — a static windmill is acceptable; a subtle spin is a nice-to-have, not a requirement (see AC8).

## User stories

1. As a player, I want to see a windmill, barn, and farmhouse somewhere on the farm, so the world looks like a real place instead of a blank test plane.
2. As a player, I want mountains visible at the edges of the drivable area, so the world feels bounded by scenery rather than an invisible wall or a void.
3. As a player, I want a river somewhere on the farm, so the terrain has natural variety beyond flat green ground.
4. As a player, I want driving into a barn/farmhouse/windmill to behave sensibly (I'm blocked, not crashed or glitched), so these landmarks feel solid without punishing me.

## Design decisions made by this doc (not open questions — see rationale)

These are scope calls this doc makes directly, with rationale, rather than escalating — they're reversible/low-stakes relative to the two blocking questions flagged in `vehicle-and-character-art.md`. Architect/developer may revisit if a better approach emerges during design.

- **Windmill, barn, farmhouse → always-solid scenery, not tier-gated obstacles.** If placed within the drivable bounds, each acts as a simple solid collider that blocks the truck regardless of wheel tier (unlike bush/rock/derelict car, which are tier-gated per `truck-builder-and-upgrades.md`'s wheel table). Rationale: these are large man-made structures — a truck plausibly can't drive through a barn wall no matter how monstrous its wheels are — and folding them into the tiered clearance system would mean either inventing a fourth obstacle class (disproportionate production cost for a purely decorative sprint) or overloading the existing "large" class (which would silently change derelict-car-tier balance tuned in Sprint 1). Being blocked by these structures follows the same no-fail-state pattern as existing obstacle blocking (drive AC9): no damage, no hit, purely a movement constraint.
- **Mountains → non-collidable backdrop, placed beyond the drivable terrain bounds.** Never reachable, never blocks the truck's path; visible from anywhere in the drivable area as a horizon feature. This is the recommended resolution to `drive-terrain-and-gas.md` Open Question 3 (soft boundary should have a visible edge given the farm setting) — the mountains *are* that visible edge treatment.
- **River → non-collidable decorative terrain feature.** Placed within or at the edge of the drivable bounds but does not block, slow, or otherwise affect truck movement, gas, or coins this sprint. Rationale: fording/bridging mechanics are a real gameplay feature, not a dressing task, and inventing one this sprint risks scope creep into physics/movement rules that belong in a dedicated requirements pass if the human wants the river to matter mechanically later.

If the human disagrees with any of these three calls (e.g., wants the windmill drivable-through, or the river to be a real barrier), flag that back before design — but absent a stated objection, the acceptance criteria below assume these defaults.

## Acceptance criteria

- **AC1 (structures present):** Given the drivable farm scene, when a player looks around, then a windmill, a barn, and a farmhouse are each visible somewhere on or near the terrain.
- **AC2 (solid-scenery blocking, no tier gating):** Given a structure (windmill/barn/farmhouse) placed within the drivable bounds, when the truck attempts to drive into it, then the truck is blocked (cannot pass through) regardless of its wheel tier, with no damage, no hit against body capacity, and no fail-state penalty — purely a movement constraint, consistent with drive AC9's existing no-fail-state pattern for obstacle blocking.
- **AC3 (mountains as backdrop):** Given the drivable terrain bounds (`TERRAIN_BOUNDS`), when mountains are rendered, then they sit outside those bounds, are visible as a horizon/edge feature from anywhere inside the drivable area, and are never collidable and never reachable by the truck.
- **AC4 (river is decorative, non-blocking):** Given a river placed on or near the terrain, when the truck drives across or along it, then truck movement, top speed, gas drain/regen, and coin systems are completely unaffected — the river has zero mechanical effect this sprint.
- **AC5 (existing clearance system unchanged):** None of the five new structures introduces a new entry in the wheel-tier clearance table (`ObstacleClass`) or changes the existing bush/rock/derelict-car behavior specified in `drive-terrain-and-gas.md` AC5-AC9. Those acceptance criteria continue to pass unmodified.
- **AC6 (spawn-avoidance respects new solid structures):** Given the windmill/barn/farmhouse now occupy space with solid colliders, when the animal spawn system (`animal-chase-and-coins.md` AC1), the farmer spawn system (`farmer-minimal-bump.md` AC1), or the fuel-pickup spawn system (`fuel-pickups.md`) pick a random valid location, then none of them spawn an entity inside/overlapping a new structure's collider — the existing "not inside an obstacle" rule is extended to cover these new solid obstacles, not bypassed.
- **AC7 (asset load never crashes the game):** Given any of the five structures' art assets fails to load (network error, malformed file, etc.), when the scene initializes, then the game does not crash or hang — it falls back to a simple placeholder (e.g., a primitive-geometry stand-in, or simply omitting that structure) and logs a warning, consistent with the project's forgiving design bias. (Shared NFR — see `vehicle-and-character-art.md` Non-functional section for the full perf/loading budget this sits under.)
- **AC8 (no required animation):** A static windmill (non-spinning blades) and static river (non-animated water) fully satisfy this doc's acceptance criteria; animated blades/water are an allowed enhancement, not a pass/fail condition.

## Open questions

None specific to this doc are blocking beyond the two centrally-tracked in `vehicle-and-character-art.md` (art direction/realism level applies to these assets too — the windmill/barn/farmhouse/river/mountains should be sourced in whatever style that question resolves to). If the human objects to any of the three design decisions above (windmill/barn/farmhouse drivable-through, or river as a real barrier), say so before this doc is handed to the architect — those are reversible defaults, not confirmed-locked decisions like the wheel-tier table was.

Non-blocking, lower-stakes items the architect can decide at design time:
1. **Exact placement** of each structure (how many of each, where on/around the terrain) — this doc specifies presence and behavior, not a level layout.
2. **Whether the river doubles as part of the mountain-backdrop edge treatment** (e.g., river flows along one boundary edge, mountains ring the rest) or is placed independently inside the play area — either satisfies AC3/AC4 as written.

## Constraints

- Must not alter or re-tune the existing wheel-tier clearance system (`drive-terrain-and-gas.md` AC5-AC9, `truck-builder-and-upgrades.md` wheel table) — see AC5.
- Runs in-browser (Three.js + Vite); glTF is the established long-term asset format (`docs/architecture/0001-foundation-stack-and-structure.md` §"module layout", `assets/`). Perf budget and loading behavior are specified centrally in `vehicle-and-character-art.md`'s Non-functional section — this doc's assets count against that shared budget, not a separate one.
- Target player is a young child: structures should read clearly as "windmill", "barn", "farmhouse" at a glance (silhouette-recognizable), not abstract/ambiguous shapes — ties into the art-direction open question in `vehicle-and-character-art.md`.
