# Farm Animals: Add Pig and Cow Species

Status: Backlog (unscheduled) — new, not yet pulled into a sprint. Tier assignment (Open Question 1) resolved 2026-07-10 — see "Resolved — species tiers" below.

Related: `docs/requirements/animal-chase-and-coins.md` (original AC3 called for "at least cows, chickens, and pigs"; only chicken shipped in Sprint 1's reduced end-to-end slice — this doc closes that gap, and its Open Question 2 illustrative tiers, cow = large/slow, pig = medium/medium, are re-examined below rather than assumed); `docs/requirements/vehicle-and-character-art.md` (explicitly deferred cow/pig again in Sprint 3, confirmed by the human 2026-07-08, noting this needs "its own requirements pass" — this is that pass; also the source of the confirmed stylized/low-poly art direction this doc's art AC reuses without re-litigating); `docs/backlog.md` row 9-11, 18.

## Problem statement

The game's own roadmap and the target player's direct feedback ("I want more animals, like pig, cow, bigger animals give more coin") both call for a small roster of chaseable animals, not just one. Today only the chicken exists in code — every other animal mentioned in `CLAUDE.md`'s project intent and in two prior requirements docs has been deferred twice. This leaves the core chase-and-reward loop visually and mechanically repetitive (one species, one silhouette, one coin value) and leaves the player's own explicit ask unmet. This document specifies adding pig and cow as two additional animal species, sized and paced so that catching a bigger animal is a distinct, recognizable event worth chasing.

## Goals / Non-goals

**Goals**
- Add pig and cow as two new, fully playable animal species alongside the existing chicken: they spawn, wander/flee, can be booped, and award coins, using the same mechanics already built for chicken (no new interaction model).
- Assign each new species a size tier and speed tier (per the existing `SizeTier`/`SpeedTier` vocabulary) that produce a coin payout consistent with "bigger/faster animals are worth more," per `animal-chase-and-coins.md` AC7 and the player's own stated expectation.
- All three species (chicken, pig, cow) can appear in the same play session, spawned with a reasonable mix so a session doesn't feel dominated by one species or starved of the new ones.
- Real art (recognizable pig and cow models/textures) in the already-confirmed stylized/low-poly art direction (`vehicle-and-character-art.md`, "Resolved — Art direction," 2026-07-08) — not a re-decision of style, just applying it to two more species.

**Non-goals**
- Any species beyond pig and cow (e.g. sheep, horses, ducks) — not requested, not in scope.
- Sound design / SFX for animals — out of scope per `CLAUDE.md` ("sound design beyond basic SFX" is out of scope for v1) and not mentioned in the player's ask.
- Per-species behavioral differences beyond size/speed/coin value and their derived effects (e.g. no unique AI, no herding, no special animations beyond the existing scatter reaction, no per-species scatter speed distinct from what the species' own speed tier already implies) — see Open Question 3 for the one place this needs an explicit confirmation.
- Changing the coin formula's mechanics or multiplier values (`core/coins/coin-formula.ts`) — the formula is already generic and correct for any tier combination; this doc only picks which tiers pig and cow use, it does not touch `BASE_COIN_VALUE`, `SIZE_MULTIPLIER`, or `SPEED_MULTIPLIER`.
- Changing chicken's existing size/speed tier or coin value — chicken ships unchanged; only two rows are added, not the existing one modified.
- Any change to the boop/scatter interaction model, the non-violence framing, or the spawn-position validity rules (obstacle/structure/truck keep-out) — these are already fully generic across species and require no changes for this feature.
- Max-concurrent-animal cap or spawn-cadence tuning as a general mechanic — that's `animal-chase-and-coins.md` Open Question 1's territory; this doc only concerns itself with the *mix* of species among whatever spawns, not the overall rate/cap.
- New UI (e.g. a species counter, a "farm dex") — not requested.

## User stories

1. As a player, I want to see pigs and cows on the farm, not just chickens, so the world feels varied and matches what I asked for.
2. As a player, I want bigger animals like cows to be worth noticeably more coins than a chicken, so chasing them down feels like a rewarding, bigger accomplishment.
3. As a player, I want to encounter a mix of chickens, pigs, and cows during a play session — not overwhelmingly one species — so the variety is actually something I experience, not just something that technically exists.
4. As a player, I want pigs and cows to look like a real pig and a real cow (in the game's simple, colorful art style), so I can immediately tell what I'm chasing.

## Acceptance criteria

### Species definition & tiers

- **AC1:** Pig and cow are each defined with a size tier and a speed tier, per the tier assignment resolved in this doc (see "Resolved — species tiers" below or Open Question 1 if unresolved at hand-off). Chicken's existing tier assignment (small/fast) is unchanged.
- **AC2:** Given the resolved size/speed tiers for chicken, pig, and cow, the coin formula (unchanged, `computeCoins(sizeTier, speedTier)`) produces a coin value for each species; a young child booping a cow should, in the common/typical case, earn visibly more coins than booping a chicken — not just "more on paper" via a formula a child can't inspect, but a value gap large enough to notice in the on-screen coin count (see Open Question 1 for why this needs explicit tier confirmation rather than reusing the old draft tiers as-is).

### Spawning & mix

- **AC3:** Given an active play session, all three species (chicken, pig, cow) are eligible to spawn — species selection is not hardcoded to a single species.
- **AC4:** Given repeated spawns over a typical play session, a player has a reasonable chance of encountering each of the three species — no species is so rare in practice that a child playing a normal-length session would be unlikely to ever see it, and no species so dominant that the other two are rarely seen. (Exact spawn weighting is an implementation/tuning detail, not fixed by this doc — see Open Question 2.)
- **AC5:** Existing spawn-validity rules (not on an obstacle/structure, not on top of the player, respecting the max-concurrent cap) apply identically to pig and cow spawns — no species-specific exception.

### Boop, coins, and non-violent framing

- **AC6:** Booping a pig or a cow behaves identically in kind to booping a chicken: a non-violent scatter reaction (hop/run/trot away, no damage/pain animation, no blood/gore/ragdoll), coins awarded per AC2, the animal removed/relocated shortly after, and eligible to be replaced by a later spawn — per `animal-chase-and-coins.md` AC4-AC6, unchanged.
- **AC7:** Booping a pig or a cow never reduces the truck's hit capacity and never contributes to the hard-game-over condition, identically to chicken (`animal-chase-and-coins.md` AC5).
- **AC8:** The coin award for booping a pig or a cow is visibly communicated the same way as for chicken (coin count increments / on-screen effect), so the feedback is consistent across species.

### Art

- **AC9:** Given the driving scene, when a pig spawns, it renders as a recognizable pig model/texture in the confirmed stylized/low-poly-but-recognizable style (`vehicle-and-character-art.md`, "Resolved — Art direction"), not a placeholder box.
- **AC10:** Given the driving scene, when a cow spawns, it renders as a recognizable cow model/texture in the same confirmed art direction.
- **AC11:** Pig and cow each have their own distinct scatter animation/reaction appropriate to the species (e.g. a trot vs. a hop) but both remain within the non-violent framing constraint — no requirement for unique behavior beyond this cosmetic variation (see Non-goals).
- **AC12:** Asset-loading failure handling for pig/cow art follows the same fallback rule already established for other characters (`vehicle-and-character-art.md` AC13): a failed load falls back to a placeholder shape and logs a console warning rather than crashing or hanging the game.

## Resolved — species tiers (confirmed by the human 2026-07-10)

| Species | Size tier | Speed tier | Coin value (formula: `5 × size × speed`) |
|---|---|---|---|
| Chicken (existing, unchanged) | small (×1) | fast (×3) | 15 |
| Pig | medium (×2) | medium (×2) | 20 |
| Cow | large (×3) | medium (×2) | 30 |

Cow strictly outpays both chicken and pig, matching the player's plain-language "bigger animals give more coin" ask directly and unambiguously — the size/speed tradeoff that made the old draft tiers (cow large/slow = 15, tied with chicken) read as "wrong" to a child is resolved by moving cow to medium speed rather than slow. This is a tier-assignment choice only; `core/coins/coin-formula.ts`'s constants are unchanged, per Constraints below.

## Open questions

1. ~~Tier assignment — does cow need to strictly outpay chicken and pig?~~ **Resolved 2026-07-10, see "Resolved — species tiers" above.**
2. **Spawn weighting across species — equal chance, or weighted toward the existing/simpler species?** AC4 requires "a reasonable mix" but doesn't fix numbers. Options: (a) uniform random pick among the three species per spawn, (b) weighted so chicken (the established species) spawns somewhat more often than the two new ones, (c) weighted by some other rule (e.g. inversely by size, so the field doesn't feel crowded with large models). No strong signal from the player's ask or prior docs on this — recommend (a) uniform as the simplest default unless the human has a preference, but flagging as open rather than assuming.
3. **Any behavioral difference beyond size/speed/coins?** Confirmed out of scope by default in this doc (see Non-goals) — pig and cow get the same AI/interaction model as chicken, just different tiers and art. Flagging once more here in case the human actually wants something like cows being harder to startle (slower flee reaction) or pigs wandering in small groups — none of that was requested, so this doc does not include it, but it's cheap to raise now rather than after implementation.
4. **Max-concurrent-animal cap interaction:** `animal-chase-and-coins.md` Open Question 1 (spawn cadence/cap) is still unresolved. Adding two more species doesn't require resolving it, but if the cap is small (e.g. 2-3 concurrent animals), AC4's "reasonable mix" may be harder to satisfy in practice — worth the human/architect keeping in mind together rather than tuning species-mix weighting in isolation from the cap.

## Constraints

- Must not modify `core/coins/coin-formula.ts`'s constants (`BASE_COIN_VALUE`, `SIZE_MULTIPLIER`, `SPEED_MULTIPLIER`) or its function signature — this feature is scoped to be a pure data addition (new `AnimalSpeciesDef` rows) against the existing generic formula, per the codebase's own doc comment in `core/spawn/species.ts` describing cow/pig as "an additive follow-up (append a row here + the render/physics asset, no core logic changes needed)."
- Must preserve the non-violence framing constraint (`animal-chase-and-coins.md` Constraints, hard constraint, not a preference): no damage numbers, no pain/hurt animations, no blood, no animal "defeat" state, for pig and cow exactly as for chicken.
- Art must be sourced/authored in the confirmed stylized/low-poly art direction already resolved in `vehicle-and-character-art.md` — not re-opened here.
- Runs in-browser (Three.js + Vite), static-site deployed — given constraint, not a decision made here. New glTF assets for pig/cow count against the same shared perf budget flagged in `vehicle-and-character-art.md` AC10 (~5MB gzipped combined additional payload, not a hard-researched ceiling).
- `AnimalSpecies` is currently a closed TypeScript union (`'chicken'` only, `core/types.ts`) and species information does not currently reach the render layer's spawn/scatter callbacks — both are known, real engineering gaps that must be closed to implement this feature, but *how* (type widening, callback signature changes, render-layer generalization) is architecture/implementation, not specified here.

