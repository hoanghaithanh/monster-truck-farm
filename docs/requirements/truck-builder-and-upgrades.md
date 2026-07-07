# Truck Builder & Upgrade Stats

Status: Sprint 1 (core builder + tier data, all four axes selectable directly; no coin-spend gating this sprint — confirmed deferred to Sprint 2).

## Problem statement

Before a player can drive around the farm, they need to assemble a monster truck from parts. Each part choice should visibly and predictably change how the truck performs later (how many hits it can take, what it can drive over, how fast it goes, how long it can go before needing a break). This document specifies the builder screen's part categories and the tier data each part choice maps to, so later gameplay systems (drive, chase, farmer) have a fixed, testable contract to build against.

## Goals / Non-goals

**Goals**
- Define exactly four part categories: body, wheels, engine, gas tank.
- Define what each category controls (its "upgrade axis") and the tier data for each, precisely enough that a developer can implement it and a tester can verify it without guessing.
- Let a player pick one option per category before starting to drive, and again after a hard game over (see `farmer-minimal-bump.md`), since Sprint 1's only way to end a run is the farmer's hit-capacity mechanic, which returns the player here.

**Non-goals (Sprint 1)**
- Farm dressing, terrain detail, animals, and the farmer are covered in separate requirements docs, not here.
- Visual/3D asset design for parts (that's art/architecture's concern, not a requirement of this doc).
- Sound, VFX, animation polish for the builder UI.
- **Spending coins to actually purchase/apply an upgrade tier — confirmed deferred to Sprint 2.** Sprint 1 implements all four upgrade axes as directly selectable tiers in the builder (both for the initial build and for rebuilding after a hard-game-over restart); the coin counter accumulates and is visible to the player, but nothing yet gates tier selection behind spending coins. This is now a settled decision, not a candidate — see Open Questions' resolved-items note.

## User stories

1. As a player, I want to choose a body part when building my truck, so my truck's hit capacity (how many farmer bumps it can take) is set.
2. As a player, I want to choose wheels when building my truck, so the size of obstacle my truck can drive over is set.
3. As a player, I want to choose an engine when building my truck, so my truck's top speed is set.
4. As a player, I want to choose a gas tank when building my truck, so how long I can drive before needing to stop and recharge is set.
5. As a player, after a hard game over I want to return to the truck builder and pick parts again to start a new run, so there's always a clear way back into play (see `farmer-minimal-bump.md` AC6 for the triggering event).

Deferred to Sprint 2 (not a Sprint 1 story, tracked in `docs/backlog.md`): "As a player, I want to spend coins I've earned to buy an upgrade in one of the four categories, so my truck actually gets stronger over time."

## Tier data specification

### Body -> hit capacity

- Base body (Tier 0): 3 hits before the run-ending consequence triggers (see `farmer-minimal-bump.md` AC6 — confirmed hard game over, not a soft recovery).
- Each body upgrade tier: +1 hit capacity over the previous tier (Tier 1 = 4, Tier 2 = 5, etc.).
- Exact number of tiers to implement in Sprint 1 is not fixed by this doc — see Open Question 1 below; implement at least Tier 0 through Tier 2 (3, 4, 5 hits) so the stat is demonstrably tunable.

### Wheels -> obstacle clearance

Three named tiers, each unlocking one additional obstacle class (small -> medium -> large). A truck cannot pass an obstacle above its current tier's clearance — it is blocked (treated as a solid barrier; the truck must steer around it, it does not crash or fail).

| Tier | Name | Can clear | Blocked by |
|---|---|---|---|
| 0 (base) | Base wheels | Small (bushes) | Medium, Large |
| 1 | Off-road wheels | Small, Medium (rocks/boulders) | Large |
| 2 | Monster wheels | Small, Medium, Large (derelict old cars) | — (clears everything defined) |

**Confirmed:** even though full farm dressing (windmill, barn, farmhouse, river, mountains) is deferred, Sprint 1's stub terrain must include one functional instance each of a bush, a rock, and a derelict car, specifically so all three wheel tiers are testable this sprint. This is no longer an open question — see `drive-terrain-and-gas.md` for the corresponding drive-side acceptance criteria.

### Engine -> top speed

- Each engine tier raises the truck's top speed over the previous tier. Exact tier count and speed values (m/s or similar) are not fixed by this doc — see Open Question 2.
- Design link (not a hard requirement, noted for acceptance-criteria awareness in `animal-chase-and-coins.md`): faster animals are worth more coins, so a higher engine tier is expected to help a player catch faster/higher-value animals more often. This is a consequence of the coin formula, not something the engine system itself needs to implement.

### Gas tank -> range

- Assumption (flagged for human confirmation, Open Question 3): each gas tank upgrade tier increases **maximum tank capacity** (more seconds of driving before empty), while the per-second drain rate stays constant across tiers. This was chosen over "same capacity but slower drain" because it's simpler to reason about and test (one number changes per tier, not two). If the human prefers the drain-rate approach instead (or both), say so before this is handed to the architect.
- Full behavior (drain while driving, auto-regen while idle, what happens at empty) is specified in `drive-terrain-and-gas.md`, since it's only observable while driving. This doc only owns the tier -> capacity mapping.

## Acceptance criteria

- **AC1 (part selection):** Given the builder screen, when a player selects one option in each of the four categories (body, wheels, engine, gas tank), then the truck instance used for driving reflects all four choices (hit capacity, obstacle clearance tier, top speed, and gas capacity all match the selected tiers).
- **AC2 (body tiers):** Given a truck built with body Tier N, when the truck takes hits (via the farmer bump mechanic), then it can absorb exactly `3 + N` hits before the hard game over triggers (see `farmer-minimal-bump.md` AC6).
- **AC3 (wheel tiers):** Given a truck built with wheel Tier N, when the truck attempts to drive onto/through an obstacle above its clearance, then the truck is blocked (cannot pass) without any crash, damage, or fail-state penalty; when the obstacle is at or below its clearance, the truck passes over it normally.
- **AC4 (engine tiers):** Given a truck built with engine Tier N, when the player holds full throttle on open terrain, then the truck's measured top speed matches Tier N's defined value and is strictly greater than Tier N-1's.
- **AC5 (gas tank tiers):** Given a truck built with gas tank Tier N, when the truck drives continuously at full throttle from a full tank, then it can drive for the Tier N capacity duration before the tank reaches empty, and Tier N's duration is strictly greater than Tier N-1's.
- **AC6 (all tiers freely selectable in Sprint 1 — finalized):** Given Sprint 1 ships without coin-spend gating (confirmed deferred to Sprint 2), when a player opens the builder — whether for the very first build or after a hard-game-over restart (see `farmer-minimal-bump.md` AC6) — then all implemented tiers in each of the four categories are freely selectable without needing to be "unlocked" by spending coins. This is the intended Sprint 1 baseline behavior, not a temporary/dev-only stand-in.
- **AC7 (coin counter persists visually, not mechanically, across a restart):** Given a hard game over occurs, when the player is returned to the builder, then the coin counter resets to 0 (per `farmer-minimal-bump.md` AC6) and no other builder state (previously selected tiers, etc.) is required to persist, since Sprint 1 has no unlocking to preserve.

## Open questions

The following were resolved by the human and are kept here only for traceability, not because they're still open:
- **Coin-spend/upgrade-purchase UX:** confirmed deferred to Sprint 2 (see Non-goals and AC6 above). Sprint 1 ships with all tiers freely selectable and a visible, non-gating coin counter.
- **Wheel obstacle instances in Sprint 1 terrain:** confirmed included — the stub terrain will contain one bush, one rock, and one derelict car (see Wheels tier data above).

Remaining open questions:
1. **Body tier count:** How many body upgrade tiers should exist in total for Sprint 1 (this doc specifies the +1-hit-per-tier rule and at least 3 tiers, but not a hard ceiling)?
2. **Engine speed values:** Should Sprint 1 define concrete top-speed numbers per tier now, or is it acceptable to ship with relative tiers (e.g., Tier 0/1/2, each some multiplier faster) and tune exact numbers later? (Same question applies to animal speed/size tiers — see `animal-chase-and-coins.md`.)
3. **Gas tank tier axis:** Confirm the assumption above (capacity increases per tier, drain rate constant) versus the alternative (drain rate decreases per tier) or a combination of both.

## Constraints

- Runs in-browser (Three.js + Vite), per existing project decision — noted here only because it constrains "how many tiers/assets" is reasonable for a young child's short session, not as an architecture choice made by this doc.
- Target player is a young child: builder UI must be understandable without reading dense text (large icons/labels, minimal steps) — exact UI/UX design is the architect's/developer's concern, but is called out here as a hard constraint on scope (e.g., don't design a builder that requires comparing numeric stat tables).
- Keyboard-only input is confirmed for Sprint 1 (see `drive-terrain-and-gas.md`); the builder screen itself should therefore be operable via keyboard (e.g., arrow keys + confirm) without assuming mouse/touch, though mouse support as an addition is not precluded.
