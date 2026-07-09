# Truck Cosmetic Customization

Status: Sprint 3 — **finalized.** Open Question 1 (cosmetic scope) resolved by the human on 2026-07-08: independent-of-tier confirmed (see below). Ready to hand to the architect.

**Post-ship update (2026-07-09):** the human reviewed the shipped feature running in-game and found the body-color tinting made the truck look bad. Direct human decision: body color was removed entirely (the picker and its tinting logic) — the body always renders its native/untinted loaded appearance now. This doc's body-color-related ACs (part of AC5) are no longer implemented; body *design* (decals) and wheel *look* are unaffected and remain as specified below. See `src/render/cosmetics/cosmetic-manifest.ts`'s header for the implementation-side removal note.

**Post-ship update 2 (2026-07-09):** the human directly playtested the game again and reported the body-design decal ("Racing stripe" / "Flame accent") also looks weird. Direct human decision, same pattern as the body-color removal above: the body-design decal cosmetic is removed entirely — `buildDesignDecal()`/`buildStripeDecal()`/`buildFlameDecal()`, the `BODY_DESIGN_OPTIONS` list (`src/render/cosmetics/cosmetic-manifest.ts`), the "Body design" row in the builder's cosmetics section (`src/ui/builder.ts`), and the `cosmetics.bodyDesign` field on `TruckCosmetics` (`src/core/types.ts`) are all to be deleted, not disabled — no dead code/feature flag left behind, mirroring exactly how the body-color removal above was handled. The body renders with no design decal, same untinted native appearance the previous update already established.

**Net effect of both post-ship updates: "Wheel look" (AC6, standard/red rim/chrome) is now the *only* surviving cosmetic axis.** Body color and body design are both gone. This changes what "Paint & style"/the cosmetic customization section means going forward — it is now a single wheel-look picker, not a multi-axis paint studio. This is called out explicitly here because it may warrant a UI/copy pass (e.g. is a whole dedicated "Paint & style" section still the right presentation for a single picker, or should it fold into a smaller UI element?) — left as an implementation/UX decision for the architect or developer, not resolved in this doc, but flagged so it isn't missed. If a future sprint reintroduces a second cosmetic axis (e.g. new decals with a different art direction, or body color revisited with a different technique), this doc's general ACs (AC1-AC4) and its "independent of functional tier" resolution still apply to that new axis without needing to be re-derived.

Related: `docs/backlog.md` (row 19); `truck-builder-and-upgrades.md` / `docs/architecture/0002-upgrade-tier-data-model.md` (the existing 4-axis functional tier system this feature sits alongside); `vehicle-and-character-art.md` (this doc piggybacks on the same asset pipeline — read that doc's per-axis art scope table and "Resolved — Art direction" section first, since they determine what's available to skin); `docs/architecture/0006-coin-spend-and-tier-unlock.md` (the existing builder purchase-flow UI this doc's new section sits next to).

## Problem statement

The truck builder currently lets a player pick four *functional* parts (body, wheels, engine, gas tank), each affecting a gameplay stat. There is no way to express personal style — every truck at a given tier combination looks identical. This document specifies letting a player choose cosmetic options independent of, and clearly separated from, the functional tier picks, so the truck feels like *their* truck. **Post-ship, the only cosmetic option remaining in scope is wheel look** (see the two post-ship update notes above) — body paint color and body design/decal were both tried, both reported by the human as looking wrong once seen running in-game, and both were removed rather than iterated on further within this sprint.

## Goals / Non-goals

**Goals**
- Add a cosmetic customization step/section to the builder screen, using the same asset pipeline established in `vehicle-and-character-art.md` (not a separate art effort).
- Let the player choose a wheel look (texture/rim style), scoped to the wheel axis, independently of which functional wheel tier is equipped. ~~Let the player choose a body paint color/design~~ (removed post-ship — see notes above).
- Keep cosmetic choice clearly, unambiguously separate from the functional tier picker in the builder UI, so a young child never confuses "how it looks" with "what it does."
- Guarantee cosmetic choice never affects any gameplay stat.

**Non-goals (Sprint 3)**
- Cosmetic options for engine or gas tank — per `vehicle-and-character-art.md`'s per-axis art scope, those axes don't get distinct externally-visible models this sprint (only a small attached cue), so there's nothing meaningful to offer a color/design choice over. Revisit if that scoping changes in a future sprint.
- Body paint color or body design/decal cosmetics of any kind — both were shipped and then removed post-ship at the human's direct request (see the two post-ship update notes above). Not a Sprint-3-only deferral; treat as removed pending a future sprint deliberately revisiting body cosmetics with a different art approach, not as a standing gap to silently fill back in.
- Any cosmetic unlock/purchase mechanic (spending coins on cosmetics) — this sprint's coin-spend system (`docs/architecture/0006`) governs functional tiers only; whether cosmetics are free-to-pick, unlockable, or purchasable is not addressed here and should be treated as freely selectable by default unless the human says otherwise (see Open Question 1 below).
- Persisting cosmetic choices across sessions (localStorage) — out of scope project-wide per `CLAUDE.md`.
- Farmer, animal, or environment cosmetic choice — this doc is truck-only.

## Resolved — Cosmetic scope (2026-07-08)

**Confirmed: independent of functional tier.** Any color/design/texture combination can be applied to any owned functional tier — this is the richer, more-expressive option (not the cheaper tier-locked alternative). The human raised this mid-Sprint-3-planning without resolving it; it was surfaced as a blocking question rather than guessed at, and is now settled. This principle is unaffected by the post-ship removals above — it still governs the one surviving axis (wheel look): a player who has only unlocked Tier 0 wheels can still apply any available wheel look to their Tier 0 wheels; upgrading to Tier 1/2 wheels later keeps their chosen look if a matching variant exists, or resets to the tier's default if not (AC7).

Rejected alternative, kept here only for traceability:
- **Tier-locked look.** Each functional tier would have come with its own fixed look, with no separate color/design choice — cheaper to produce (no cosmetic-variant assets needed beyond the per-tier models already scoped in `vehicle-and-character-art.md`) but less expressive (two players with the same tier picks would have identical-looking trucks). Rejected by the human in favor of the richer independent option above.

## User stories

1. ~~As a player, I want to choose a paint color for my truck's body, so my truck feels personalized regardless of which body tier I've unlocked.~~ **(Removed post-ship 2026-07-09 — see note above.)** ~~As a player, I want to choose a design (decal) for my truck's body, so my truck feels personalized regardless of which body tier I've unlocked.~~ **(Also removed post-ship 2026-07-09 — see note 2 above; no body-cosmetic story remains.)**
2. As a player, I want to choose a look for my wheels (texture/rim style), so my truck's appearance matches my style regardless of which wheel tier I've unlocked.
3. As a player, I want the cosmetic choices to be clearly separate from my functional part choices in the builder, so I don't accidentally think a color change affects my truck's stats.

## Acceptance criteria

### General

- **AC1 (no stat impact):** Given any cosmetic selection, the truck's `hitCapacity`, `clearance`, `topSpeed`, and `gasCapacity` are determined solely by the four functional tier selections (`docs/architecture/0002`'s `TruckSpec`) — cosmetic choice never reads into or mutates `TruckSpec`.
- **AC2 (builder UI separation):** The cosmetic customization UI is presented as a visually and structurally distinct section/step from the four-axis functional tier picker — different heading, different visual grouping, not interleaved row-by-row with body/wheels/engine/gas-tank — so the two kinds of choice are never ambiguous to a young child glancing at the screen.
- **AC3 (keyboard-operable):** The cosmetic customization UI is reachable and operable with the same keyboard-only input scheme already established for the builder (`truck-builder-and-upgrades.md` Constraints; the existing Up/Down/Left/Right/Space/Enter scheme in `src/ui/builder.ts`) — no mouse-only interaction.
- **AC4 (asset failure fallback):** Given a cosmetic asset (color/texture) fails to load, the truck falls back to its default appearance rather than crashing or rendering broken/missing-texture geometry, consistent with the forgiving design bias and the shared NFR in `vehicle-and-character-art.md` AC13.

### Cosmetic customization (independent of functional tier)

- **AC5:** ~~Given a player has selected any body tier, when they open the cosmetic section, then they can choose from the full set of available body paint colors/designs regardless of which body tier is currently equipped or owned.~~ **(Fully removed post-ship — both body color, 2026-07-09, and body design/decal, 2026-07-09, are gone. There is no body-cosmetic AC remaining; the builder's cosmetic section offers no body-related picker.)**
- **AC6:** Given a player has selected any wheel tier, when they open the cosmetic section, then they can choose from the full set of available wheel looks (texture/rim style) regardless of which wheel tier is currently equipped or owned.
- **AC7:** Given a player has chosen a cosmetic option and then equips a different (owned) functional tier on the same axis, when the tier changes, then the previously chosen cosmetic is re-applied to the new tier's model if a matching variant exists for it, or the cosmetic resets to that tier's default look if it doesn't (exact behavior — carry-over vs. reset — is an open implementation detail, not gated on this doc, since either satisfies "never crashes, never looks broken"). Only applicable to wheel look now, per the removals above.
- **AC8:** The cosmetic selection made in the builder is reflected identically on the truck model spawned in the driving scene (same asset-matching guarantee as `vehicle-and-character-art.md` AC4, extended to cosmetics).

## Open questions

No blocking questions remain. Non-blocking items for the architect to decide at design time:

1. **Cosmetic unlock model:** freely selectable from the start (mirroring Sprint 1's pre-coin-spend builder baseline), or gated behind coins/unlocks like the functional tiers (`docs/architecture/0006`)? Recommend freely selectable by default, consistent with cosmetics being explicitly *not* a gameplay-power axis — but flagged for human confirmation since it changes builder UI (would need its own "owned"/"locked" visual treatment, mirroring `docs/architecture/0006 §5`, if gated).
2. **How many wheel-look options** to offer — an art-production-sizing question, not a requirements question; left to the architect now that both the art direction (`vehicle-and-character-art.md`) and cosmetic scope are resolved. (Previously also asked about body color/design option counts; moot now that both are removed.)
3. **Builder UI presentation of a single-axis cosmetic section:** now that wheel look is the only cosmetic axis (see the post-ship update notes above), should the builder still present a full "Paint & style"-style section, or fold the wheel-look picker into a smaller UI element? Either satisfies AC2's "clearly separate" requirement; left to the architect/developer as a UX decision, not gating implementation of the removal itself.

## Constraints

- Builds on `vehicle-and-character-art.md`'s asset pipeline and per-axis model scope — does not commission a separate art effort. Cosmetic variants must be implementable as material/texture swaps on the existing per-tier models, not as new geometry per combination (keeps the combinatorial cost linear rather than multiplicative — see `vehicle-and-character-art.md`'s per-axis table rationale).
- Must not touch or reinterpret the functional `TruckSpec` contract (`docs/architecture/0002`) — see AC1.
- Keyboard-only input constraint carries over from the existing builder (`truck-builder-and-upgrades.md` Constraints).
- Runs in-browser (Three.js + Vite); shares the perf/loading/fallback NFR budget specified in `vehicle-and-character-art.md` (AC10-AC13) — cosmetic asset variants count against that same combined budget, they are not a separate allowance.
- **Removal work (post-ship update 2) must delete, not disable:** the decal-building functions, the `BODY_DESIGN_OPTIONS` list, the builder UI row, and the `cosmetics.bodyDesign` type field — no dead code or feature flag left behind, mirroring the body-color removal precedent (`src/render/cosmetics/cosmetic-manifest.ts`'s header comment).
