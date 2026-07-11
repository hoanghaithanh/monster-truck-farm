# Acceptance Report — Pig & Cow Animal Species (issue #48, ADR 0016)

Date: 2026-07-11
Validator: test-engineer
Scope: `docs/requirements/farm-animals-pig-cow.md` AC1-AC12, validated against commit `13b8ceb` (implementation + code review's `dispose()` resource-leak fix), the current tip of `main` at the time of this pass.

## Method

- `npm run test` (Vitest): 530/530 passing (unchanged from the developer/code-reviewer handoff — includes the code review's follow-up material-leak/mixer-stop dispose test).
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4400`.
- Live-driven via `puppeteer-core` against the real system Chrome, following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue #29 farmer acceptance pass's method section). A temporary, read-only QA debug hook was added to `src/main.ts` (`window.__qa` per-frame telemetry: truck position/heading, `store.coins`/`store.hitsRemaining`, and a new `scene.debugAnimals()` introspection helper) and `src/render/scene.ts` (the `debugAnimals()` scene-graph helper itself) for the duration of this pass, mirroring the `debugFarmer()` idiom from the issue #29 pass.
- **Per this project's post-Sprint-4 convention** (`.claude/agents/test-engineer.md`, added after the farmer's orientation bug survived two straight-line-only live passes), the driving method used a **changing path with turns in both directions** (`KeyA`/`KeyD` alternation, pursuit-steering toward whichever animal was nearest), not a single straight approach, and orientation was compared against direction of motion **across multiple independent scatter events with different headings**, not just a static screenshot — see AC11 below for the specific data.
- Two of the required sessions used a **temporary, reverted-after-use tuning override**: `SPECIES_WEIGHTS` in `src/core/spawn/pick-species.ts` was temporarily changed from the real `chicken 0.7 / pig 0.25 / cow 0.05` to `chicken 0.2 / pig 0.4 / cow 0.4` for the duration of two live sessions only, so a short (~45-60s) session would reliably produce enough pig **and** cow spawns/boops to validate AC9-AC11 without an impractically long real-time session (the same "temporarily adjust rare-event weighting, then revert" technique the orchestrator has used elsewhere this project, per the task hand-off). A third session used `manifest.ts`'s `PIG_URL` temporarily pointed at a nonexistent file to force a live load failure for AC12. **All three temporary edits were fully reverted before concluding this pass** — confirmed via `git status`/`git diff` showing a clean working tree on all four touched files (`src/main.ts`, `src/render/scene.ts`, `src/core/spawn/pick-species.ts`, `src/render/assets/manifest.ts`), and `npm run test` (530/530), `npx tsc --noEmit`, and `npm run build` all re-run clean afterward, all reported above.
- Four driving sessions total, each against a real `npm run build` of the current committed code (except for the deliberate, disclosed, reverted-before-concluding temp overrides noted above):
  1. A default-weighting (real `0.7/0.25/0.05`) baseline session (~10s, 9 turning legs) — confirmed chicken spawns/renders correctly under the real production weighting with no override in place, and that `AnimalSystemCallbacks`/`debugAnimals()` telemetry itself works before relying on it for the rest of the pass.
  2. A boosted-weighting pursuit session (45s) — continuous pursuit-steering toward the nearest cow (falling back to pig, then anything), turning left/right as needed each 150ms tick, generating 6 real boop/coin events across chicken, pig, and cow.
  3. A boosted-weighting pursuit session (up to 60s, exited early once enough samples were collected) with 40ms-resolution polling specifically to capture per-frame position/rotation samples during each individual scatter event, for the orientation-vs-motion analysis in AC11.
  4. A boosted-weighting, forced-pig-load-failure session (20s) confirming AC12's fallback behavior live.
- Screenshots and raw telemetry committed under `docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/`.

## AC-by-AC status

### AC1 (tiers defined) — **MET**

Confirmed by direct code read of `src/core/spawn/species.ts` (`ANIMAL_SPECIES`): `chicken` unchanged (small/fast), `pig` = medium/medium, `cow` = large/medium — matches the requirements doc's "Resolved — species tiers" table exactly. `computeCoins` (`src/core/coins/coin-formula.ts`) is untouched (constraint honored — no edits to `BASE_COIN_VALUE`/`SIZE_MULTIPLIER`/`SPEED_MULTIPLIER`).

### AC2 (coin value gap, visibly noticeable) — **MET**

Live-confirmed, not just formula-inspected: session 2's 6 real boop events produced coin deltas of **exactly 20 or 30** every single time (never 15, chicken's unchanged value) — `+20, +20, +30, +30, +30, +20` across the 45s session (`docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/coin-award-events.json`). A cow boop (30) is double chicken's 15 and 50% more than a pig's 20 — a real, on-screen, immediately-visible gap in the coin counter, not just "more on paper."

### AC3 (all three species eligible) — **MET**

`src/systems/animal-system.ts`'s `pickSpecies(this.rng)` call is unconditional on every spawn — no hardcoding to chicken. Live-confirmed: session 1 (real weighting) spawned chickens; sessions 2-4 (boosted weighting, same code path, only the weight constants changed) spawned pig, cow, and chicken all in the same sessions, confirming the same picker code serves all three, not species-specific branches.

### AC4 (reasonable chance to encounter each species in a typical session) — **MET, with a noted tuning judgment call**

The real, committed weighting (`0.7/0.25/0.05`) is unit-tested at `src/core/spawn/pick-species.test.ts` — a 20,000-draw statistical test asserts the realized distribution lands in `chicken (0.6,0.8)`, `pig (0.15,0.35)`, `cow (0.01,0.1)`, which passed as part of the 530/530 suite. This pass additionally live-confirmed the *mechanism* is sound (session 1, unmodified weights, produced chicken spawns as expected in a 10s sample) and, via the disclosed temporary-weighting technique, live-confirmed that **when a cow does spawn, it behaves identically in every respect** (renders correctly, boops for the right coin value, scatters with its own distinct clip and correct orientation) to chicken/pig — i.e., there's no separate cow-specific defect hiding behind its rarity.

**Judgment call flagged for the human, not blocking sign-off:** at the real `0.05` cow weight, `SPAWN_INTERVAL_SECONDS = 4`, and `MAX_CONCURRENT_ANIMALS = 5`, the *expected* number of spawn attempts before a cow appears is 1/0.05 = 20, i.e. roughly **80 seconds of expected wait** (with real variance — sometimes much sooner, sometimes noticeably longer) before a player's first cow. This is very likely fine for a "typical" multi-minute play session (matching the doc's own "no species so rare... a child playing a normal-length session would be unlikely to ever see it" framing) but is genuinely borderline for a *short* session (under a minute), where a player could plausibly see only chicken and pig. This is a tuning/product call already anticipated by the requirements doc itself (Open Question 2, "no strong signal... recommend (a) uniform... unless the human has a preference"), not a defect — noting it here rather than silently treating "eligible to spawn" as fully satisfying the doc's "reasonable chance... in practice" language without comment.

### AC5 (spawn-validity rules apply identically) — **MET**

`src/systems/animal-system.ts`'s spawn-position logic (`pickSpawnPosition` against `SPAWN_KEEPOUTS`/`MIN_SPAWN_DISTANCE_FROM_TRUCK`/`MAX_CONCURRENT_ANIMALS`) runs once, before species is even picked — species selection happens only *after* a valid position is found, so there is no species-conditional branch in the validity path by construction. No spawn-on-obstacle/spawn-on-truck was observed across ~4 minutes of combined live driving.

### AC6 (non-violent boop/scatter/coin/removal, in kind with chicken) — **MET**

Confirmed live for both pig and cow: booping triggers immediate coin award + a scatter reaction (species-appropriate clip, see AC11) + removal ~0.4s later (`SCATTER_DURATION_SECONDS`), then eligible to be replaced by a later spawn — same sequence chicken already had, no new code path. No damage/pain animation, no blood/gore, no "defeat" state observed in any screenshot or telemetry sample across ~15 total boop events this pass.

### AC7 (boop never reduces hits / never contributes to game-over) — **MET**

Confirmed at two levels:
- **Code-level:** `src/systems/animal-system.ts`'s contact-resolution loop (`resolveBoop` -> `this.store.addCoins(coinsAwarded)`) is the *only* store mutation in the entire animal boop path — there is no call into any hits-reducing method anywhere in `animal-system.ts`. Hits are only ever touched by `farmer-system.ts`'s `onBump` path (`src/main.ts` line ~222, `onBump: () => scene.flashTruck()` alongside the farmer system's own internal hit-decrement), a structurally separate system.
- **Live-observed:** session 3's `hits` telemetry dropped from 3 to 2 partway through the session (`docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/03-pig-recognizable-t015000-coins70-hits2.png`) — but this coincides with a **farmer** visibly on-screen in the immediately-preceding frame (`02-cow-and-farmer-t010000-coins20-hits3.png`, farmer running toward the truck), and the coin counter kept climbing independently afterward (70 -> 90 -> ... -> 150) with zero further hits change for the rest of the session, confirming the hits-drop event and the ongoing animal-boop/coin stream are two independent, uncorrelated systems exactly as the code implies.

### AC8 (coin feedback visibly communicated, consistent across species) — **MET**

The on-screen coin counter (top-left HUD) incremented for every one of the 6 boop events in session 2 and further events in session 3, using the same HUD element/format already established for chicken — no species-conditional UI code exists (`src/ui/hud.ts` reads `store.coins` generically). Screenshots in `docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/` show the coin count itself (20, 70, 90, ...) at each captured frame.

### AC9 (pig renders recognizably) — **MET**

`docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/03-pig-recognizable-t015000-coins70-hits2.png` and `04-pig-recognizable-t020000-coins90-hits2.png` (both normal in-scene chase-camera views, not a debug snap) show a clearly recognizable low-poly pig — round body, snout, upright ears, four legs, tail — standing next to the farmhouse and a rock for scale reference, matching the confirmed stylized/low-poly art direction. Not a placeholder box in any of the ~15+ screenshots taken this pass.

### AC10 (cow renders recognizably) — **MET**

`docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/02-cow-and-farmer-t010000-coins20-hits3.png` and the developer's own prior screenshots (`docs/qa/screenshots/issue48-pig-cow-2026-07-10/05-cow-scatter-leg1.png`, `06-cow-scatter-leg2-turned.png`) show a clearly recognizable black-and-white patterned cow — head/muzzle, four legs, visible markings — correctly proportioned larger than the pig and chicken nearby, matching the confirmed art direction. Not a placeholder box in any screenshot this pass.

### AC11 (distinct scatter reaction per species, orientation matches motion across a changing path) — **MET**

This is the AC the process update after issue #57/#29 specifically calls out, so it got the most dedicated verification:

- **Distinct clips confirmed:** live telemetry (`scene.debugAnimals()[].currentActionClip`) showed pig scatter instances always play `Armature|Jump` and cow scatter instances always play `Armature|Run` — never crossed, never `Death`/`Walk`/`WalkSlow` (see the "clip-name safety" check below).
- **Orientation-vs-motion, across a changing path, not a single straight-line approach (the specific gap that survived two prior live passes on the farmer):** session 3 recorded 5 complete scatter events (4 pig, 1 cow with usable sample count — a 2nd cow scatter was captured with only 1 sample as it despawned near session end, excluded) via 40ms-resolution polling, each triggered by the truck approaching from a genuinely different heading (the pursuit-steering controller alternated turn direction throughout the session). For each event, the model's final `rotation.y` was compared against the actual motion heading derived from its own first-vs-last recorded position (`atan2(dx, dz)`, same convention as `computeFarmerHeading`):

  | Animal | Species | Samples | Motion heading (rad) | rotation.y (rad) | Diff |
  |---|---|---|---|---|---|
  | pig-1 | pig | 8 | 2.542 | 2.542 | 0.000 |
  | cow-3 | cow | 9 | -0.207 | -0.207 | 0.000 |
  | pig-2 | pig | 8 | -1.386 | -1.386 | 0.000 |
  | pig-4 | pig | 8 | 3.050 | 3.050 | 0.000 |
  | pig-5 | pig | 9 | 1.927 | 1.927 | 0.000 |

  Full raw samples in `docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/scatter-orientation-logs.json`. Five distinct flee directions spanning nearly the full ±π range, every one an exact match (not just "close") between rendered facing and actual direction of travel — this is the live-driven confirmation that ADR 0016 §7's orientation design (reusing `computeFarmerHeading`'s convention, applied per-species) genuinely fires for pig **and** cow specifically, not just re-trusted from the farmer precedent, and specifically across multiple different approach/flee directions rather than one repeated straight-line case.
- **Clip-name safety:** across every telemetry sample this pass (~15+ boop/scatter events, 4 sessions), only `Armature|Idle`, `Armature|Jump` (pig), and `Armature|Run` (cow) were ever observed as `currentActionClip` — `Death` (cow's 4th real clip, per ADR 0016 §10) was never referenced, consistent with the design's "never referenced by name, unreachable by construction" guarantee.

### AC12 (fallback on load failure) — **MET**

Live-forced via a temporary, disclosed, reverted override (`PIG_URL` pointed at a nonexistent `.glb` for one session only): `AssetRegistry` logged exactly the expected single `console.warn` (`AssetRegistry: failed to load "pig" from .../pig-DOES-NOT-EXIST-....glb SyntaxError: ...`), the game did not crash or hang, and two pig instances (`pig-2`, `pig-4`) stayed on `upgraded: false` (the primitive fallback) for the entire 20s session while a third-party species (cow) unaffected by the override upgraded normally in the same session — confirming the failure is scoped to the one broken key, not global. A boop during this session still correctly awarded coins (`coins: 20` in the final telemetry, `docs/qa/screenshots/issue48-pig-cow-acceptance-2026-07-11/05-fallback-no-crash-boop-still-works.png`), confirming boop/coin mechanics work identically on a still-primitive (never-upgraded) animal instance, not just an upgraded one.

## Regression checks

- **Console errors:** only the pre-existing, previously-disclosed benign favicon 404 across sessions 1-3, matching the exact pattern documented in prior acceptance reports. Session 4's extra `console.warn` (the fallback message) was the deliberate, expected signal of the AC12 test itself, not a regression.
- **Driving/gas/farmer systems:** no interference observed; the farmer's own chase/bump behavior fired correctly and independently of the animal system throughout (see AC7 above).
- **Temp QA hook and temp tuning/fallback overrides fully reverted:** confirmed via `git status`/`git diff` showing a clean working tree on all four touched files. `npm run test` (530/530), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert — these are the exact numbers reported at the top of this document.

## Summary table

| AC | Status |
|---|---|
| AC1 (tiers defined) | **Met** |
| AC2 (coin value gap, noticeable) | **Met** — live coin deltas exactly 20 (pig) / 30 (cow), never 15 |
| AC3 (all three species eligible) | **Met** |
| AC4 (reasonable chance to encounter each species) | **Met** — with a flagged, non-blocking tuning judgment call: ~80s expected wait for a first cow under the real 0.05 weight, borderline for very short sessions |
| AC5 (spawn-validity rules identical) | **Met** |
| AC6 (non-violent boop/scatter/coin/removal) | **Met** |
| AC7 (boop never reduces hits/game-over) | **Met** — code-level (only path to hits is the farmer system) and live-observed (hits drop coincided with a visible farmer, not a boop) |
| AC8 (coin feedback visibly communicated) | **Met** |
| AC9 (pig renders recognizably) | **Met** |
| AC10 (cow renders recognizably) | **Met** |
| AC11 (distinct scatter reaction, orientation matches motion across a changing path) | **Met** — 5 independent scatter events across ~5 different headings, exact facing/motion match every time, for pig and cow specifically |
| AC12 (fallback on load failure) | **Met** — live-forced failure confirms no crash, correct console.warn, scoped to the broken key only |

## Recommendation

I recommend **for** sign-off on issue #48. All 12 acceptance criteria are met, verified through a combination of code-level confirmation and live-driven sessions using the real production build, specifically designed per this project's post-issue-#57/#29 convention to include a changing path (turns, multiple approach headings) and an explicit orientation-vs-motion comparison across several distinct scatter events — not a single straight-line case, and not just re-trusted from the farmer precedent for a species genuinely new to this codebase. The one item worth the human's attention is **not a defect**: AC4's real spawn weighting (cow at 0.05) means a very short (<1 minute) session has a real chance of never showing a cow, which is a tuning call the requirements doc itself already flagged as open (Open Question 2) rather than something this pass is newly raising.

Per this project's convention, I am recommending, not approving — final sign-off is the human's call.
