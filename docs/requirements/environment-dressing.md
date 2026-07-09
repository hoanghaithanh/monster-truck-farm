# Environment Dressing — Windmill, Barn, Farmhouse, River, Mountains

Status: Sprint 3 art direction — **finalized** (2026-07-08, see `vehicle-and-character-art.md` "Resolved — Art direction"). Sprint 4 scope split (2026-07-09): this row was carried as one bundled issue (#26) and has been split into two independently trackable issues, since the five structures are two genuinely independent deliverables with no shared implementation dependency — same rationale as the row 18 split (truck/chicken/farmer art → #27/#28/#29). See "Scope split" below.

Related: `docs/backlog.md` row 16; `drive-terrain-and-gas.md` (terrain bounds, soft boundary, existing obstacle-clearance system); `truck-builder-and-upgrades.md` / `docs/architecture/0002-upgrade-tier-data-model.md` (the wheel-tier clearance system this doc must not disturb); `vehicle-and-character-art.md` (shared art-direction decision and perf/loading NFRs — read that doc's "Resolved — Art direction" section and Non-functional section first, they apply here too); `docs/architecture/0012-environment-dressing-and-terrain-features.md` (design for both halves).

## Scope split (2026-07-09)

This single requirements doc still covers the whole row 16 "make the farm look like a farm" story — the problem statement, goals, art direction, and cross-cutting rules below are shared and should not diverge between the two halves. But the work is filed and delivered as **two independent issues**, so each can be scoped, built, tested, and reported on without waiting on the other:

- **Structures** — windmill, barn, farmhouse (AC1, AC2 + applicable cross-cutting ACs). Three always-solid, tier-independent man-made buildings.
- **Terrain features** — river, mountains (AC3, AC4 + applicable cross-cutting ACs). Two non-collidable, purely decorative terrain elements.

Rationale for this split (approved by the human 2026-07-09): the two halves have no implementation dependency on each other (different asset sources, different rendering approach per ADR 0012 — authored `.glb` + simplified collider for structures vs. procedural ribbon / instanced backdrop for terrain features), and bundling them into one L-sized issue meant either half being blocked or slow (e.g. sourcing a good farmhouse model) would silently stall reporting on the other half's progress too. Splitting makes partial progress visible and each half independently shippable, matching this project's general preference for small vertical slices.

The five structures continue to share one art-direction decision, one set of cross-cutting rules (AC5-AC9), and one ADR (0012) — this is a scope/tracking split, not a design fork.

## Problem statement

The farm world currently renders as a bare green plane with three primitive-shape obstacles (bush/rock/derelict car) standing in for terrain variety. Sprints 1-2 deliberately deferred all farm dressing to keep gameplay logic the focus. Now that the core loop (build → drive → chase → gas → farmer → upgrade → fuel pickups) is stable, the world needs to look like an actual farm — a windmill, barn, farmhouse, river, and mountains — so play sessions feel like they're happening somewhere, not on an abstract test plane.

## Goals / Non-goals

**Goals**
- Add visible windmill, barn, and farmhouse structures to the drivable scene ("structures" half).
- Add a river and mountains that establish the farm's sense of place and give the terrain's edges a visual identity ("terrain features" half; mountains double as the answer to `drive-terrain-and-gas.md` Open Question 3 — a visible horizon rather than an invisible wall).
- Define, per structure, whether it is a physical obstacle or pure backdrop, so the developer/architect has an unambiguous rule to implement against rather than discovering it mid-build.
- Keep the existing wheel-tier clearance system (bush/rock/derelict car, drive AC5-AC9) completely untouched — this doc is additive dressing, not a rebalance. This applies equally to both halves.
- Let the two halves ship independently — neither should block or be blocked by the other (see "Scope split" above).

**Non-goals (Sprint 3/4)**
- No new obstacle *class* tied to wheel tiers. None of these five structures becomes a fourth tier-gated obstacle type. (See AC5.)
- No new gameplay mechanic tied to the river (no swimming, no fording penalty, no boat) or the mountains (not a driveable slope) this sprint.
- No sound design for the environment (ambient farm audio, windmill creak, river flow) — out of scope, project-wide sound design is deferred per `CLAUDE.md`.
- No animation requirement for the windmill blades or river flow beyond what's cheap/free from the chosen art asset — a static windmill is acceptable; a subtle spin is a nice-to-have, not a requirement (see AC8).

## User stories

1. As a player, I want to see a windmill, barn, and farmhouse somewhere on the farm, so the world looks like a real place instead of a blank test plane. *(structures)*
2. As a player, I want mountains visible at the edges of the drivable area, so the world feels bounded by scenery rather than an invisible wall or a void. *(terrain features)*
3. As a player, I want a river somewhere on the farm, so the terrain has natural variety beyond flat green ground. *(terrain features)*
4. As a player, I want driving into a barn/farmhouse/windmill to behave sensibly (I'm blocked, not crashed or glitched), so these landmarks feel solid without punishing me. *(structures)*

## Design decisions made by this doc (not open questions — see rationale)

These are scope calls this doc makes directly, with rationale, rather than escalating — they're reversible/low-stakes relative to the two blocking questions that were tracked in `vehicle-and-character-art.md` (now both resolved). Architect/developer may revisit if a better approach emerges during design.

- **Windmill, barn, farmhouse → always-solid scenery, not tier-gated obstacles.** *(structures)* If placed within the drivable bounds, each acts as a simple solid collider that blocks the truck regardless of wheel tier (unlike bush/rock/derelict car, which are tier-gated per `truck-builder-and-upgrades.md`'s wheel table). Rationale: these are large man-made structures — a truck plausibly can't drive through a barn wall no matter how monstrous its wheels are — and folding them into the tiered clearance system would mean either inventing a fourth obstacle class (disproportionate production cost for a purely decorative sprint) or overloading the existing "large" class (which would silently change derelict-car-tier balance tuned in Sprint 1). Being blocked by these structures follows the same no-fail-state pattern as existing obstacle blocking (drive AC9): no damage, no hit, purely a movement constraint.
- **Mountains → non-collidable backdrop, placed beyond the drivable terrain bounds.** *(terrain features)* Never reachable, never blocks the truck's path; visible from anywhere in the drivable area as a horizon feature. This is the recommended resolution to `drive-terrain-and-gas.md` Open Question 3 (soft boundary should have a visible edge given the farm setting) — the mountains *are* that visible edge treatment.
- **River → non-collidable decorative terrain feature.** *(terrain features)* Placed within or at the edge of the drivable bounds but does not block, slow, or otherwise affect truck movement, gas, or coins this sprint. Rationale: fording/bridging mechanics are a real gameplay feature, not a dressing task, and inventing one this sprint risks scope creep into physics/movement rules that belong in a dedicated requirements pass if the human wants the river to matter mechanically later.

If the human disagrees with any of these three calls (e.g., wants the windmill drivable-through, or the river to be a real barrier), flag that back before design — but absent a stated objection, the acceptance criteria below assume these defaults.

## Acceptance criteria

### Structures — windmill, barn, farmhouse

- **AC1 (structures present):** Given the drivable farm scene, when a player looks around, then a windmill, a barn, and a farmhouse are each visible somewhere on or near the terrain.
- **AC2 (solid-scenery blocking, no tier gating):** Given a structure (windmill/barn/farmhouse) placed within the drivable bounds, when the truck attempts to drive into it, then the truck is blocked (cannot pass through) regardless of its wheel tier, with no damage, no hit against body capacity, and no fail-state penalty — purely a movement constraint, consistent with drive AC9's existing no-fail-state pattern for obstacle blocking.

### Terrain features — river, mountains

- **AC3 (mountains as backdrop):** Given the drivable terrain bounds (`TERRAIN_BOUNDS`), when mountains are rendered, then they sit outside those bounds, are visible as a horizon/edge feature from anywhere inside the drivable area, and are never collidable and never reachable by the truck.
- **AC4 (river is decorative, non-blocking):** Given a river placed on or near the terrain, when the truck drives across or along it, then truck movement, top speed, gas drain/regen, and coin systems are completely unaffected — the river has zero mechanical effect this sprint.

### Cross-cutting — applies to both halves

- **AC5 (existing clearance system unchanged):** None of the five new structures introduces a new entry in the wheel-tier clearance table (`ObstacleClass`) or changes the existing bush/rock/derelict-car behavior specified in `drive-terrain-and-gas.md` AC5-AC9. Those acceptance criteria continue to pass unmodified. Applies identically to both halves — neither the structures nor the terrain features may touch this system (ADR 0012 §1 protects this structurally: `StructureInstance` never enters `partitionObstacles`).
- **AC6 (spawn-avoidance respects new solid structures):** Given the windmill/barn/farmhouse now occupy space with solid colliders, when the animal spawn system (`animal-chase-and-coins.md` AC1), the farmer spawn system (`farmer-minimal-bump.md` AC1), or the fuel-pickup spawn system (`fuel-pickups.md`) pick a random valid location, then none of them spawn an entity inside/overlapping a new structure's collider — the existing "not inside an obstacle" rule is extended to cover these new solid obstacles, not bypassed. **Structures-only in practice**: only windmill/barn/farmhouse are collidable, so only they need keep-out entries; the river and mountains are deliberately excluded from keep-out (river is non-mechanical and spawnable-over by design, mountains sit outside bounds and are never selected). The terrain-features issue does not need to touch spawn keep-out at all.
- **AC7 (asset load never crashes the game):** Given any of the five structures' art assets fails to load (network error, malformed file, etc.), when the scene initializes, then the game does not crash or hang — it falls back to a simple placeholder (e.g., a primitive-geometry stand-in, or simply omitting that structure) and logs a warning, consistent with the project's forgiving design bias. (Shared NFR — see `vehicle-and-character-art.md` Non-functional section for the full perf/loading budget this sits under.) Applies to both halves, including the river's procedural-geometry path (ADR 0012 §3) which has no external asset to fail but should still degrade gracefully if e.g. terrain data is malformed.
- **AC8 (no required animation):** A static windmill (non-spinning blades) and static river (non-animated water) fully satisfy this doc's acceptance criteria; animated blades/water are an allowed enhancement, not a pass/fail condition. Note the windmill half of this AC belongs to the structures issue and the river half belongs to the terrain-features issue.
- **AC9 (art direction):** All five structures are sourced/authored in the confirmed stylized/low-poly-but-recognizable art direction (see `vehicle-and-character-art.md` "Resolved — Art direction") — silhouette-recognizable as "windmill", "barn", "farmhouse", etc. at a glance, consistent in style with the truck/character art from that same doc, not photorealistic. Applies to both halves; the two issues must still read as one consistent world when both land, regardless of delivery order.

## Open questions

No blocking questions remain — the art-direction question that was tracked centrally in `vehicle-and-character-art.md` is resolved (Option A: stylized/low-poly, see AC9). If the human objects to any of the three design decisions above (windmill/barn/farmhouse drivable-through, or river as a real barrier), say so before this doc is handed to the architect — those are reversible defaults, not confirmed-locked decisions like the wheel-tier table was.

Non-blocking, lower-stakes items the architect/developer can decide at design time:
1. **Exact placement** of each structure (how many of each, where on/around the terrain) — this doc specifies presence and behavior, not a level layout.
2. **Whether the river doubles as part of the mountain-backdrop edge treatment** (e.g., river flows along one boundary edge, mountains ring the rest) or is placed independently inside the play area — either satisfies AC3/AC4 as written. Note this is a design-time coupling between the two issues' visual layout even though they're tracked/built independently; if one half lands before the other, the later half should be placed with the already-shipped half's layout in mind (e.g. don't run the river through where the barn already sits).
3. **Delivery order between the two issues** is a scheduling call, not a requirements one — either half can ship first with no functional dependency.

## Constraints

- Must not alter or re-tune the existing wheel-tier clearance system (`drive-terrain-and-gas.md` AC5-AC9, `truck-builder-and-upgrades.md` wheel table) — see AC5. Applies to both halves.
- Runs in-browser (Three.js + Vite); glTF is the established long-term asset format (`docs/architecture/0001-foundation-stack-and-structure.md` §"module layout", `assets/`). Perf budget and loading behavior are specified centrally in `vehicle-and-character-art.md`'s Non-functional section — this doc's assets count against that shared budget, not a separate one, regardless of which issue delivers them.
- Target player is a young child: structures should read clearly as "windmill", "barn", "farmhouse" at a glance (silhouette-recognizable), not abstract/ambiguous shapes — matches the confirmed stylized/low-poly art direction (`vehicle-and-character-art.md`).
