# Vehicle & Character Art Pass

Status: Sprint 3 — **finalized.** Both blocking open questions resolved by the human on 2026-07-08 (see below); ready to hand to the architect.

Related: `docs/backlog.md` (row 18); `truck-builder-and-upgrades.md` / `docs/architecture/0002-upgrade-tier-data-model.md` (the 4-axis tier system this art sits on top of, without changing); `farmer-minimal-bump.md` / `docs/architecture/0007-farmer-full-chase-timer-and-dynamic-speed.md` (farmer FSM states this doc gives visual form to); `animal-chase-and-coins.md` (animal species); `environment-dressing.md` (shares this doc's art-direction decision and Non-functional section); `truck-cosmetics.md` (shares this doc's cosmetic-scope decision).

## Problem statement

Every character and vehicle in the game is currently a primitive Three.js shape: the truck is a single box, the farmer a capsule, the (one implemented) animal a small box, obstacles are spheres/icosahedra/boxes. This was a deliberate placeholder choice through Sprints 1-2 so gameplay logic could be built and tuned first. That logic has now stabilized (build → drive → chase → gas → farmer FSM → coin-spend upgrades → fuel pickups all shipped). This document specifies what real art needs to exist for the truck, its parts, the animals, and the farmer — including which of the existing tiers/states actually need visually distinct art versus a shared model with cosmetic variation.

## Goals / Non-goals

**Goals**
- Replace the truck body, wheels, farmer, and animal(s) primitive-shape placeholders with real models/textures.
- Define, per upgrade axis (body/wheels/engine/gas tank), whether that axis needs a visually distinct model per tier, so the art budget is sized correctly instead of guessed at.
- Give the farmer's PURSUING/TIRED/LEAVING states (added in Sprint 2, `docs/architecture/0007`) visual form beyond the current placeholder color-tint (`FARMER_TIRED_COLOR` swap in `render/scene.ts`), since a young child shouldn't need to read a subtle color shift to know the farmer gave up.
- Establish a shared perf/loading/fallback budget that this doc, `environment-dressing.md`, and `truck-cosmetics.md` all draw against (glTF assets are additive to an already-flagged ~2.5MB gzipped bundle).

**Non-goals (Sprint 3)**
- **New animal species.** Only one species (chicken) is actually implemented in code today (`src/core/spawn/species.ts`) — `animal-chase-and-coins.md`'s mention of "cows, chickens, pigs" describes the eventual roster from `CLAUDE.md`'s project intent, but cows and pigs were never built; only the chicken shipped in Sprint 1's reduced end-to-end slice, and nothing since has added the others. Adding new species is a core-logic change (new spawn-table entries, size/speed tier assignment, coin-formula interaction), not a pure art swap, and doesn't fit "this sprint is about visual assets rather than gameplay logic." **Confirmed by the human (2026-07-08): cow/pig are explicitly not in scope for Sprint 3.** This doc's art scope is the chicken only. If the human wants cow/pig actually implemented later, that needs its own requirements pass and belongs in a future sprint's backlog (noted as a known gap in `docs/backlog.md`).
- Truck cosmetic customization (color/design/texture choice) — specified separately in `truck-cosmetics.md`, which depends on this doc's per-axis model decisions below.
- Sound design, particle VFX beyond what's already specified (bump flash, fuel glow) — out of scope.
- New animations beyond what's needed to make existing states (driving, farmer PURSUING/TIRED/LEAVING, animal scatter) read clearly — no idle-fidget animations, no cutscenes.

## Resolved — Art direction (2026-07-08)

**Confirmed: Option A — stylized/low-poly, but reads as real objects.** The human's original phrasing when raising this topic was "realistic visual," which was in tension with the project's established design bias (`CLAUDE.md`: forgiving, colorful, kid-friendly, not realism-first). Surfaced as a blocking question rather than assumed either way; the human has now confirmed Option A, which matches the existing design bias: recognizable, solid-feeling objects (a barn that reads as a barn, a chicken that's clearly a chicken, simplified/rounded forms), colorful and forgiving in tone, no gore/realistic injury detail anywhere — not an abstract-shapes look, but not photoreal either.

Rejected alternatives, kept here only for traceability:
- *(B) As photorealistic as feasible* — rejected as a genuine tonal shift away from the project's established bias, which the human did not intend.
- *(C) Something else* — no alternative reference style was raised; not applicable.

This applies to every asset in this doc, and to `environment-dressing.md`'s structures — one art direction across the whole world, not per-asset.

## Resolved — Cosmetic customization scope (2026-07-08, shared with `truck-cosmetics.md`)

**Confirmed: independent of functional tier.** Cosmetic choice (color/design/texture) can be applied to any owned functional tier, not locked to a fixed per-tier look — the richer, more-variants option, not the cheaper tier-locked alternative. Full specification and acceptance criteria live in `truck-cosmetics.md`; this note exists here because the decision also fixes the total art-variant count this doc's per-axis table (below) needs to support: cosmetic variants multiply *within* an axis via material/color swaps applied to the tier models already scoped below, not via new geometry per combination (see `truck-cosmetics.md` Constraints).

## Per-axis art scope

This is the concrete answer to "does each tier need a visually distinct model," made as a design call (not escalated — see rationale) so art production isn't sized against an open-ended "make everything distinct" assumption. Reversible if the human disagrees.

| Axis | Distinct model per tier? | Rationale |
|---|---|---|
| **Body** (3 tiers) | **Yes — 3 distinct body models.** | Body tier is the truck's primary silhouette and the stat most likely to matter visually to a child ("my truck looks tougher now"). It's also the natural anchor for cosmetic paint/design (`truck-cosmetics.md`). |
| **Wheels** (3 tiers) | **Yes — 3 distinct wheel/tire models.** | Wheels are externally visible and the tier names already imply visual difference (Base → Off-road → Monster) — a bigger, knobbier tire is exactly the kind of change a child can *see* and connect to "I can drive over bigger things now." Wheels are also the natural anchor for wheel-texture cosmetics. |
| **Engine** (3 tiers) | **No — one shared visual per body, differentiated by a small attached cue** (e.g. a hood scoop, exhaust stack, or badge/decal), not a full remodel. | The engine isn't externally visible on a monster truck in any style; a full distinct chassis per engine tier would ~triple body-model production cost for a stat (top speed) that isn't primarily about appearance. A small attached prop is enough to let a player glance-check their engine tier without inflating scope. |
| **Gas tank** (3 tiers) | **No — one shared visual per body, differentiated by a small visible tank prop** (size/color cue on a fuel-tank attachment), not a full remodel. | Same reasoning as engine: not the primary visual identity axis, doesn't warrant full-body variants. |

Net model count this sprint: **3 body models + 3 wheel models + small engine/gas-tank attachment cue sets**, each with material/color variants layered on top per the confirmed independent-cosmetics decision above — versus a naive "distinct model per tier per axis per cosmetic combination" reading, which this scoping deliberately avoids (see `truck-cosmetics.md` Constraints for how cosmetic variants stay additive rather than multiplicative in geometry terms).

## User stories

1. As a player, I want my truck's body to look different depending on which body tier I've built, so upgrading feels visually rewarding, not just numeric.
2. As a player, I want my truck's wheels to look different depending on which wheel tier I've built, so I can tell at a glance what my truck can drive over.
3. As a player, I want the chicken I'm chasing to look like a real chicken instead of a floating box, so the world feels alive.
4. As a player, I want the farmer to look like an actual person, so the chase feels like a character, not an abstract capsule.
5. As a player, I want to be able to tell whether the farmer is actively chasing me, tired and giving up, or leaving, just by looking at him, so I understand the encounter without reading a HUD element.

## Acceptance criteria

### Truck body & wheels

- **AC1 (body models):** Given a truck built with body Tier N (0/1/2), when the truck is rendered in the builder preview and the driving scene, then it uses the model corresponding to Tier N, visually distinct from the other two tiers.
- **AC2 (wheel models):** Given a truck built with wheel Tier N (0/1/2), when the truck is rendered, then its wheels use the model corresponding to Tier N, visually distinct from the other two tiers.
- **AC3 (engine/gas-tank cue):** Given a truck built with a given engine tier and gas-tank tier, when the truck is rendered, then a small attached visual cue (not a full remodel) differs per tier, per the "Per-axis art scope" table above.
- **AC4 (builder preview matches driving scene):** The truck model shown in the builder screen's preview and the model spawned in the driving scene are the same asset per selected tier combination — no mismatch between what a player picks and what they drive.

### Animal (chicken only — see Non-goals)

- **AC5 (chicken model):** Given the driving scene, when a chicken spawns, then it renders as a recognizable chicken model/texture in the confirmed stylized/low-poly-but-recognizable style (see "Resolved — Art direction" above) instead of the current placeholder box.
- **AC6 (non-violent framing preserved):** The chicken's scatter animation (on boop) remains non-violent per `animal-chase-and-coins.md`'s hard constraint — a hop/run-away reaction, no damage/pain animation.

### Farmer

- **AC7 (farmer model):** Given the driving scene, when the farmer appears (`ABSENT → PURSUING`), then he renders as a recognizable human-farmer character model, in the confirmed stylized/low-poly style, instead of the current capsule placeholder.
- **AC8 (state-distinguishable art):** Given the farmer's FSM state (`PURSUING`, `TIRED`, or `LEAVING` per `docs/architecture/0007`), when the player looks at the farmer, then the state is visually distinguishable through pose and/or animation (e.g. a running/chasing pose for PURSUING, a winded/hands-on-knees pose for TIRED, a walking-away pose for LEAVING) — not solely through the current color-tint mechanism, which is a placeholder-era shortcut too subtle to rely on as the only signal for a young child. Color may remain as a *supplementary* cue.
- **AC9 (tone preserved):** All farmer states remain kid-appropriate per `farmer-minimal-bump.md` AC5/AC7 — TIRED and LEAVING read as friendly/comedic ("giving up," "walking off"), never as pain, injury, or distress.

### Non-functional (shared budget — also applies to `environment-dressing.md` and `truck-cosmetics.md`)

- **AC10 (perf budget — flagged assumption, confirm before locking):** The combined additional glTF/texture payload introduced by this doc, `environment-dressing.md`, and `truck-cosmetics.md` together should not push the site's total initial-load payload past roughly **5MB gzipped** (on top of the already-flagged ~2.5MB gzipped bundle, mostly Rapier's WASM). This number is a starting budget, not a hard-researched ceiling — flagged for the architect/human to confirm or adjust once real asset sizes are known, the same way gas-drain-rate and spawn-cadence constants were shipped as tunable placeholders in earlier sprints.
- **AC11 (no blocking first paint):** The builder screen (which has minimal 3D asset needs — one truck preview) must remain fast to reach; heavier driving-scene assets (environment structures, farmer, chicken) may load asynchronously and are not required to block the builder screen's first paint.
- **AC12 (loading indicator before driving starts):** Given the player confirms the builder and requests to start driving, when any required glTF asset for the driving scene has not finished loading, then a simple, kid-friendly loading indicator is shown until assets are ready, or — if loading exceeds a bounded timeout (proposed: 5s, tunable) — the scene proceeds using placeholder/fallback geometry for whatever hasn't finished loading, rather than blocking indefinitely. Never a silent freeze.
- **AC13 (asset failure never crashes the game):** Given any character/vehicle art asset fails to load (network error, malformed file, missing file), when the scene initializes or a build is confirmed, then the game does not crash or hang — it falls back to a simple placeholder (reusing an existing primitive-geometry shape is an acceptable fallback) and logs a console warning, consistent with the project's forgiving design bias. This applies per-asset — one failed load must not take down unrelated working assets.

## Open questions

Both previously-blocking questions are resolved (see "Resolved" sections above, 2026-07-08). Remaining items are non-blocking and can be decided at design time:

1. **Exact perf budget number (AC10)** — 5MB gzipped combined is a starting proposal, not confirmed. Revisit once real asset candidates are sourced.
2. **Loading-indicator visual design and the exact timeout value (AC12)** — left to the architect/developer; the requirement is only that one exists and that it's bounded, not indefinite.

## Constraints

- glTF is the established long-term asset format (`docs/architecture/0001-foundation-stack-and-structure.md` §"module layout" — `render/` already owns "glTF loading" as a named responsibility, `assets/` is an existing top-level module).
- Must not change any of the four axes' underlying stats (`hitCapacity`, `clearance`, `topSpeed`, `gasCapacity`) — this is a pure rendering/asset pass on top of the existing `TruckSpec` contract (`docs/architecture/0002`), not a rebalance.
- Must preserve the non-violence framing constraint (`animal-chase-and-coins.md` Constraints) and the farmer's kid-appropriate tone constraint (`farmer-minimal-bump.md` Constraints).
- All assets (this doc and `environment-dressing.md`) must be sourced/authored in the confirmed stylized/low-poly art direction — a consistent world, not a mix of styles.
- Runs in-browser (Three.js + Vite), static-site deployed — asset hosting/CDN choice is an architect/devops concern, not specified here.
