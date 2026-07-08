# Truck Cosmetic Customization

Status: Draft — **blocked on one human decision** (Open Question 1 below, shared with `vehicle-and-character-art.md` Open Question 2). Do not hand this to the architect until it's answered; acceptance criteria that depend on it are marked accordingly.

Related: `docs/backlog.md` (new row, this doc); `truck-builder-and-upgrades.md` / `docs/architecture/0002-upgrade-tier-data-model.md` (the existing 4-axis functional tier system this feature sits alongside); `vehicle-and-character-art.md` (this doc piggybacks on the same asset pipeline — read that doc's per-axis art scope table and Open Question 1 first, since they determine what's available to skin); `docs/architecture/0006-coin-spend-and-tier-unlock.md` (the existing builder purchase-flow UI this doc's new section sits next to).

## Problem statement

The truck builder currently lets a player pick four *functional* parts (body, wheels, engine, gas tank), each affecting a gameplay stat. There is no way to express personal style — every truck at a given tier combination looks identical. This document specifies letting a player choose cosmetic options (paint color/design, wheel look) independent of, and clearly separated from, the functional tier picks, so the truck feels like *their* truck.

## Goals / Non-goals

**Goals**
- Add a cosmetic customization step/section to the builder screen, using the same asset pipeline established in `vehicle-and-character-art.md` (not a separate art effort).
- Let the player choose a body paint color/design and a wheel look (texture/rim style), scoped to the two axes that `vehicle-and-character-art.md` establishes as having distinct, externally-visible models (body, wheels).
- Keep cosmetic choice clearly, unambiguously separate from the functional tier picker in the builder UI, so a young child never confuses "how it looks" with "what it does."
- Guarantee cosmetic choice never affects any gameplay stat, regardless of how Open Question 1 resolves.

**Non-goals (Sprint 3)**
- Cosmetic options for engine or gas tank — per `vehicle-and-character-art.md`'s per-axis art scope, those axes don't get distinct externally-visible models this sprint (only a small attached cue), so there's nothing meaningful to offer a color/design choice over. Revisit if that scoping changes in a future sprint.
- Any cosmetic unlock/purchase mechanic (spending coins on cosmetics) — this sprint's coin-spend system (`docs/architecture/0006`) governs functional tiers only; whether cosmetics are free-to-pick, unlockable, or purchasable is not addressed here and should be treated as freely selectable by default unless the human says otherwise (see Open Question 2).
- Persisting cosmetic choices across sessions (localStorage) — out of scope project-wide per `CLAUDE.md`.
- Farmer, animal, or environment cosmetic choice — this doc is truck-only.

## Open Question 1 — Is cosmetic choice independent of functional tier, or tier-locked? (BLOCKING)

This is the single decision that determines both the builder UX and the art production scope, and the human explicitly raised it mid-Sprint-3-planning without resolving it — it must not be guessed at.

**Option A — Independent.** Any cosmetic (any color/design, any wheel texture) can be applied on top of any functional tier. A player who has only unlocked Tier 0 wheels can still paint their Tier 0 wheels any available color/texture; upgrading to Tier 1 wheels later keeps their chosen cosmetic if the same option exists for that model, or resets to a default if not.
- *UX:* a genuinely separate customization step — pick function first (or independently, order TBD), then pick look, from a full palette regardless of tier.
- *Art cost:* higher — each cosmetic variant (color/texture) must work as a material/skin applied to *each* of the 3 body models and 3 wheel models independently (a multiplicative but manageable cost if implemented as material swaps rather than new geometry — see `vehicle-and-character-art.md`'s per-axis table, which already assumes color/texture is a material-level change, not new meshes).
- *Player experience:* more choice, more expressive, but slightly more builder-UI complexity to keep from confusing a young child (two "layers" of choice per axis: which tier, then which look).

**Option B — Tier-locked.** Each functional tier comes with its own fixed look; there is no separate color/design choice. Upgrading wheel tier changes both the stat *and* the appearance together, as a single choice, exactly as the current builder already works — this option effectively means "no new cosmetic step; the art pass alone (already scoped in `vehicle-and-character-art.md`) is the full extent of visual variety."
- *UX:* no new builder complexity — the existing 4-axis picker is untouched; the art pass makes the existing tiers look different from each other, and that's the entirety of "customization."
- *Art cost:* lower — no cosmetic-variant assets needed at all beyond the per-tier models already scoped.
- *Player experience:* less individual expression (two players with the same tier picks have identical-looking trucks), but simpler to build and simpler for a young child to reason about.

**This doc's acceptance criteria are written to cover both outcomes explicitly** (see the AC section, split into "Option A" and "Option B" branches) so no work is wasted once the human decides — but no implementation should proceed against a specific branch until this question is answered. If the human picks Option B, this document's scope essentially collapses into "nothing to build here" and the feature is satisfied entirely by `vehicle-and-character-art.md`'s per-tier models — that's a valid, cheap outcome and should not be treated as this doc having failed to find scope.

## User stories

Written for Option A (independent cosmetics); if Option B is chosen, none of these stories exist as separate work — see the note above.

1. As a player, I want to choose a paint color or design for my truck's body, so my truck feels personalized regardless of which body tier I've unlocked.
2. As a player, I want to choose a look for my wheels (texture/rim style), so my truck's appearance matches my style regardless of which wheel tier I've unlocked.
3. As a player, I want the cosmetic choices to be clearly separate from my functional part choices in the builder, so I don't accidentally think a color change affects my truck's stats.

## Acceptance criteria

### Applies regardless of Open Question 1's resolution

- **AC1 (no stat impact — always true):** Given any cosmetic selection (or the lack of a cosmetic system at all, under Option B), the truck's `hitCapacity`, `clearance`, `topSpeed`, and `gasCapacity` are determined solely by the four functional tier selections (`docs/architecture/0002`'s `TruckSpec`) — cosmetic choice, if it exists as a separate concept, never reads into or mutates `TruckSpec`.
- **AC2 (builder UI separation):** If a cosmetic customization UI exists (Option A), it is presented as a visually and structurally distinct section/step from the four-axis functional tier picker — different heading, different visual grouping, not interleaved row-by-row with body/wheels/engine/gas-tank — so the two kinds of choice are never ambiguous to a young child glancing at the screen.
- **AC3 (keyboard-operable):** If a cosmetic customization UI exists, it is reachable and operable with the same keyboard-only input scheme already established for the builder (`truck-builder-and-upgrades.md` Constraints; the existing Up/Down/Left/Right/Space/Enter scheme in `src/ui/builder.ts`) — no mouse-only interaction.
- **AC4 (asset failure fallback):** Given a cosmetic asset (color/texture) fails to load, the truck falls back to its default appearance rather than crashing or rendering broken/missing-texture geometry, consistent with the forgiving design bias and the shared NFR in `vehicle-and-character-art.md` AC13.

### Option A branch (independent cosmetics) — implement only if Open Question 1 resolves to A

- **AC5:** Given a player has selected any body tier, when they open the cosmetic section, then they can choose from the full set of available body paint colors/designs regardless of which body tier is currently equipped or owned.
- **AC6:** Given a player has selected any wheel tier, when they open the cosmetic section, then they can choose from the full set of available wheel looks (texture/rim style) regardless of which wheel tier is currently equipped or owned.
- **AC7:** Given a player has chosen a cosmetic option and then equips a different (owned) functional tier on the same axis, when the tier changes, then the previously chosen cosmetic is re-applied to the new tier's model if a matching variant exists for it, or the cosmetic resets to that tier's default look if it doesn't (exact behavior — carry-over vs. reset — is an open implementation detail, not gated on this doc, since either satisfies "never crashes, never looks broken").
- **AC8:** The cosmetic selection made in the builder is reflected identically on the truck model spawned in the driving scene (same asset-matching guarantee as `vehicle-and-character-art.md` AC4, extended to cosmetics).

### Option B branch (tier-locked look) — implement only if Open Question 1 resolves to B

- **AC9:** No new builder UI section is added. The existing 4-axis tier picker (`src/ui/builder.ts`) is unchanged by this doc; all visual variety comes from `vehicle-and-character-art.md`'s per-tier models, and this document's scope is considered satisfied without further implementation.

## Open questions

**Blocking:** Open Question 1 above (independent vs. tier-locked cosmetics) must be answered before any Option A/B-specific work begins.

Non-blocking (relevant only if Option A is chosen):
1. **Cosmetic unlock model:** freely selectable from the start (mirroring Sprint 1's pre-coin-spend builder baseline), or gated behind coins/unlocks like the functional tiers (`docs/architecture/0006`)? Recommend freely selectable by default, consistent with cosmetics being explicitly *not* a gameplay-power axis — but flagged for human confirmation since it changes builder UI (would need its own "owned"/"locked" visual treatment, mirroring `docs/architecture/0006 §5`, if gated).
2. **How many color/design options and wheel-look options** to offer — an art-production-sizing question, not a requirements question; left to the architect once Open Question 1 and `vehicle-and-character-art.md` Open Question 1 (art direction) are both resolved.
3. **Order of builder steps:** does the player pick function then cosmetics, or are they interleaved/simultaneous per axis (e.g. body tier + body color chosen together in one row)? Either satisfies AC2's "clearly separate" requirement as long as the two *kinds* of choice remain visually distinguishable; left to the architect/developer as a UX design decision.

## Constraints

- Builds on `vehicle-and-character-art.md`'s asset pipeline and per-axis model scope — does not commission a separate art effort. If Open Question 1 resolves to Option A, cosmetic variants must be implementable as material/texture swaps on the existing per-tier models, not as new geometry per combination (keeps the combinatorial cost linear rather than multiplicative — see `vehicle-and-character-art.md`'s per-axis table rationale).
- Must not touch or reinterpret the functional `TruckSpec` contract (`docs/architecture/0002`) — see AC1.
- Keyboard-only input constraint carries over from the existing builder (`truck-builder-and-upgrades.md` Constraints).
- Runs in-browser (Three.js + Vite); shares the perf/loading/fallback NFR budget specified in `vehicle-and-character-art.md` (AC10-AC13) — cosmetic asset variants count against that same combined budget, they are not a separate allowance.
