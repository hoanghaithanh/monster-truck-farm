# Acceptance Report — Truck Scale & Hitbox Growth (issue #62, ADR 0018 §1)

Date: 2026-07-11
Validator: test-engineer
Scope: `docs/requirements/truck-scale-and-suspension.md` AC1-AC5, validated against the current tip of `main` at the time of this pass (implementation + unit tests (569/569) + code review already complete and clean per the hand-off). AC6-AC12 (per-wheel suspension) are the separate sibling issue #63, not built yet, out of scope here. This pass also settles several tuning/attribution questions the ADR and code review explicitly deferred to a live playtest.

## Method

- `npm run test` (Vitest): 569/569 passing, unchanged from the hand-off.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4402`.
- Live-driven via `puppeteer-core` against the real system Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless), following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue #29/#48/#49 acceptance passes' method sections).
- A temporary, read-only QA debug hook was added to `src/main.ts` (`window.__qa`: per-frame telemetry of truck position/heading/climb `{lift,pitch,roll}`; `window.__qaStore`: direct reference to the live `GameStore` for `addCoins`/reading `coins`/`gas`/`hitsRemaining`/`screen`; `window.__qaSpawnLog`: an array logging animal/fuel/farmer spawn, farmer-bump, and fuel-collect events with truck-relative position, used for the spawn-keep-out and regression checks). **The hook was fully reverted before concluding this pass** — confirmed via `git diff --stat src/main.ts src/render/scene.ts` showing no diff on `main.ts` (the `scene.ts` diff present is the hand-off's own pre-existing implementation change, not this pass's), and `npm run test` (569/569), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert (numbers reported above are the post-revert re-run).
- An early attempt used a `teleport(x, z)` helper (same pattern as the #49 pass: `TruckController.setPosition` + a manual `world.step()`) to jump to distant map regions. **This crashed Rapier's WASM state** (`RuntimeError: unreachable` inside `setNextKinematicTranslation`) when called during a live driving session — see the "Method finding" note below. It was abandoned in favor of real keyboard-driven navigation (a simple bang-bang steering controller polling `window.__qa.position/heading` and toggling `KeyW`/`KeyA`/`KeyD` key events) for all movement in this pass, including the barn approach.
- Five driving sessions against the real build:
  1. Builder-screen tier comparison: purchased and equipped body tiers 0/1/2 in turn (via `addCoins` + real button clicks — tier purchases are sequential-unlock gated, so tier1 had to be bought before tier2), screenshotting the live 3D preview panel for each (AC1/AC2).
  2. A "max-tier" driving session (body/wheels/engine/gasTank all tier 2 — Monster wheels needed to clear all three obstacle classes) driving real routes to each of the 3 stub obstacles (bush, rock, derelict car) via the bang-bang steering controller, with per-frame `climb` telemetry captured across each crossing (AC4 climb re-tune).
  3. The same session continued into a sustained, close, multi-leg circling drive around the barn structure, specifically to try to reproduce the code-reviewer's flagged camera-clip-into-roof question.
  4. A loose, varied-heading ~28-second drive (12 legs) to observe live animal/fuel/farmer spawn placement relative to the truck (AC4 spawn keep-out feel).
  5. A dedicated animal-chase and fuel-chase session (poll for a spawn event, then bang-bang-drive to its live position) to positively confirm coin award and gas refill still fire correctly with the bigger truck (regression sanity check).
- Screenshots and raw telemetry/spawn logs committed under `docs/qa/screenshots/issue62-truck-scale-acceptance-2026-07-11/`.

### Method finding: `world.step()` teleport helper is unsafe during a live session

The #49 pass's teleport helper (`TruckController.setPosition` + a manual `world.step()` call from outside the frame loop) crashed this pass's session with a Rapier WASM `unreachable` panic the first time it was invoked mid-drive. `physics/world.ts`'s own doc comments (on `TruckController.moveBy`/`step`) already warn that "a second, independent `step()` call within the same tick... corrupts Rapier's internal wasm-bindgen object graph" (the documented root cause of issues #16/#21) — this pass's crash is consistent with that same class of problem, triggered here by an *external* caller rather than an internal double-fire. This is a pre-existing fragility in the debug-hook pattern itself, not a defect in issue #62's shipped code (the hook is temporary QA scaffolding, never shipped) — flagged here as a note for future acceptance passes: prefer real keyboard-driven navigation over the teleport helper when the driving session is live, or drive it from a separate isolated step (e.g., only while the rAF loop is paused). Not filing a GitHub issue for this since it's a QA-tooling observation, not a product defect, but recording it here so the next pass doesn't lose an hour rediscovering it.

## AC-by-AC status

### AC1 (bigger overall silhouette, all tiers) — **MET**

`01-builder-tier0-body.png`, `02-builder-tier1-body.png`, `03-builder-tier2-body.png` show the builder's live 3D preview for each tier in turn. Tier 0 reads as a normal pickup-sized truck comfortably inside the preview frame. Tier 1 and Tier 2 are visibly, unambiguously bigger — big enough that Tier 2 now overflows the small fixed-size preview viewport (see the "Non-blocking observation" note below). In the driving scene, `04-driving-start-tier2.png` and every subsequent screenshot show a truck that reads as large/imposing relative to the windmill, barn, farmhouse, and river in frame — a clear "my truck got bigger" impression at a glance, satisfying the AC1 bar directly.

**Non-blocking observation (builder-preview framing, not an AC1 failure):** the builder's live-preview camera (`previewCamera.position.set(2.4, 1.8, 3.2)`, `src/ui/builder.ts`) is a fixed position/FOV that was evidently tuned against the pre-#62 tier sizes. With the now-35%-bigger Tier 1/2 bodies, the truck's front/roof geometry is cropped out of the top and left edges of the small preview panel (visible in `02`/`03`). The truck is still recognizably "bigger" (satisfying the AC as written), but a player can no longer see the *whole* Tier 1/2 truck in the one place designed to show it off before committing to drive. Worth a small follow-up (widen the preview camera's FOV or pull it back slightly) but does not block this AC or this sign-off — flagging for the human's awareness, not filing a blocking issue.

### AC2 (tier-to-tier progression preserved) — **MET**

The same three builder screenshots, taken with an identical camera/frame, show a clear, unbroken Tier 0 < Tier 1 < Tier 2 size ordering — Tier 1 is visibly larger than Tier 0, Tier 2 visibly larger again (large enough to be the tier that overflows the preview frame, per the note above). Because `TRUCK_SCALE` is a single global multiplier applied uniformly to all three tiers' existing data (ADR 0018 §1), the *relative* size gap between tiers is provably unchanged from before this feature — this pass's live screenshots corroborate that the uniform scale-up reads correctly rather than flattening the tiers, matching the ADR's design intent.

### AC3 (hitbox scales with the model, same factor, every tier) — **MET (unit-proven; live-corroborated structurally)**

`src/core/driving/config.ts`'s `TRUCK_CONTACT_RADIUS = 0.9 * TRUCK_SCALE` is a single value shared across tiers, unit-tested per the hand-off (`config.test.ts`). This pass did not re-derive the math live (not independently provable by driving alone), but every downstream live observation in this pass — the truck's on-screen size matching its collision behavior against the barn (see AC4/camera-clip finding below), obstacle-climb footprint activating correctly, and animal/fuel/farmer contact firing correctly at the observed distances — is consistent with a single, correctly-scaled contact radius, not a mismatch between visual and physical size.

### AC4 (downstream distances re-tuned, not just the truck) — **MET**

This is the AC the ADR explicitly calls out as playtest-verified, not code-inspection-verified. Each sub-area:

- **Obstacle-climb footprint/`maxLift` re-tune:** `climb-telemetry.json`'s mid-crossing samples for all three obstacle classes show a clean, bounded climb response:
  - Bush (small, 65 samples): lift ranged -0.027 to 0.483, pitch -0.203 to 0.117.
  - Rock (medium, 4 samples — a fast crossing at Tier-2 top speed): lift 0.010 to 0.322, pitch -0.261 to 0.315.
  - Derelict car (large, 65 samples): lift -0.514 to 0.592, pitch -0.338 to 0.338.
  - `roll` was `0` in every single sample across all three (matches `maxRoll: 0`, the AC10-carried-forward anti-chaos clamp). Pitch never approached the `maxPitch: 0.45` rad cap, and lift never approached `maxLift: 2.43` / `maxLiftByClass.large: 1.485` — the re-tuned values produce a visible, proportionate climb response without clipping through the truck or floating it absurdly, in `05-climb-bush-tier2.png`, `06-climb-rock-tier2.png`, `07-climb-derelict-car-tier2.png`, and no evidence of under/over-shoot in the numeric telemetry either. This directly answers open tuning question 4 in the assignment: the re-tuned `maxLift`/`maxLiftByClass.large` values feel proportionate for the bigger truck, no clip/float observed across any of the three obstacle classes.
- **Spawn keep-out distances:** `spawn-log.json` from the 12-leg loose drive recorded 5 animal spawns (closest to the truck at spawn time: 13.83 units), 2 fuel spawns (closest: 51.80 units), and 1 farmer appearance (15.47 units) — all comfortably clear of the re-tuned floors (`MIN_SPAWN_DISTANCE_FROM_TRUCK = 4.32`, `FARMER_MIN_SPAWN_DISTANCE_FROM_TRUCK = 8.32`, `FUEL_MIN_SPAWN_DISTANCE_FROM_TRUCK = 4.32` in `src/core/spawn/config.ts`/`src/core/farmer/config.ts`/`src/core/fuel/config.ts`). No spawn in this pass landed anywhere close to "on top of" the now-bigger truck; nothing felt uncomfortably close or unnecessarily far during the drive itself. This answers open tuning question 5: the re-tuned keep-out distances feel reasonable in live play.
- **Fairness/general feel (open tuning question 6):** no multi-contact-in-one-pass was observed (the animal-chase session in `11-animal-boop-attempt.png` booped exactly one chicken for a clean +15 coins, not a chain of several), and no new stuck-against-geometry moments occurred outside the one camera finding below (which is a *camera* issue, not a *collision* issue — the truck itself never got physically stuck). The bigger hitbox did not read as newly cramped or trivially easy in this pass.

### AC5 (functional stats unchanged, all tiers/axes) — **MET (unit-proven; live-corroborated)**

Unit-proven per the hand-off. Live corroboration: the HUD hit-counter went from 5 hearts to 4 after exactly one farmer bump (Tier-2 body's 5-hit capacity, unchanged value, `10-loose-drive-end.png`), and gas/coin numbers behaved exactly as their existing formulas predict (see Regression checks below) — nothing in this pass suggested any upgrade axis's *functional* value had drifted.

## Open tuning questions (assignment items 3-7)

**3. `TRUCK_SCALE = 1.35` magnitude.** My judgment: **feels right, not too subtle or too extreme.** At every tier the truck reads as clearly, comfortably bigger without becoming absurd or losing the sense that it's still "a truck" — it fills the frame more but doesn't dwarf the barn/farmhouse or make the map feel suddenly cramped. This sits well within the ADR's proposed 1.25-1.5 range; I would not push it higher without also revisiting the builder-preview camera framing (see AC1 note) and the driving-camera-vs-structure gap (see item 7 below), since both get *more* noticeable, not less, as the truck grows further. Recommend keeping 1.35 as shipped.

**4. Re-tuned climb lift values.** See AC4 above — **feels proportionate**, no clipping or floating observed across all three obstacle classes at Tier 2 (the largest/heaviest case). Not independently re-verified at Tier 0/Tier 1 wheel tiers in this pass (this pass used max-tier wheels throughout to exercise all three obstacle classes in one session) — a reasonable scope trim given `DEFAULT_CLIMB_CONFIG` is tier-independent (it keys off `sizeClass`/obstacle geometry, not wheel tier), so a Tier-2 confirmation is representative, but flagging the cross-tier gap explicitly rather than silently assuming it.

**5. Re-tuned spawn keep-out distances.** See AC4 above — **feels reasonable**, nothing spawned uncomfortably close or unnecessarily far in this pass's live session.

**6. AC4 general fairness check.** **No issues found** — no multi-boop-per-pass, no new cramped/stuck feeling from the bigger hitbox (independent of the one camera-specific finding below, which does not affect actual truck movement/collision).

**7. Camera-clip-into-barn-roof attribution — supports the code-reviewer's pushback, not the developer's original attribution.** This pass reproduced the clip directly: `09-barn-circle-leg0.png` and `09-barn-circle-leg1.png` show the chase camera positioned essentially *inside* the barn's roof geometry, looking up at the underside from point-blank range, while the truck itself sits normally on open ground next to the barn wall (not overlapping it, not stuck, not glitched). `barn-telemetry.json`'s closest sample (leg 3, truck center ~4.23 units from the barn's position, against a barn `footprintRadius` of 3 and the truck's own `TRUCK_CONTACT_RADIUS` of ~1.215 — i.e., the truck's collider was resting right at the wall, exactly where the physics collision should stop it) confirms the truck's *physical* position and collision behavior were entirely normal at the moment of the clip.

  Tracing `render/scene.ts`'s `setTruckTransform` (the camera-follow code): the chase camera is computed as a fixed offset *behind the truck's heading* (`CAMERA_CHASE_DISTANCE` back from the truck), clamped only against the finite ground-plane's bounds (`clampCameraToBounds(..., CAMERA_GROUND_MARGIN)`) — it has **zero awareness of obstacle or structure geometry**, no raycast-against-scene occlusion check, nothing. When the truck drives close and roughly parallel to a tall structure like the barn, the camera's fixed "behind the truck" offset can land literally on the far side of the structure's wall from the truck, i.e., inside the model. This is a property of the camera-follow math alone and is completely independent of `TRUCK_CONTACT_RADIUS`'s size — a smaller pre-#62 contact radius would have let the truck get *marginally* closer to the wall before the physics collider stopped it, which if anything gives the same fixed-offset camera math *more* room to end up on the wrong side of thin geometry, not less. If anything, growing the collider (this issue's actual change) pushes the truck's stopping point *away* from structures, which should make this class of clip *less* likely to trigger, not more.

  **Finding: this is a pre-existing camera-follow-vs-static-geometry gap, unrelated to issue #62's hitbox change**, confirming the code-reviewer's pushback over the developer's original attribution. Backlog row 35 (#64) is unrelated to this — recommend the human have a fresh, camera-specific issue filed (structure-aware camera occlusion/avoidance, e.g. a raycast from the look-at target back to the desired camera position, pulling the camera in if it hits solid geometry) rather than treating this as anything #62 introduced or needs to fix. Not filing that issue myself here since it's a camera-subsystem design call (raycast avoidance vs. a simpler distance-based structure-repulsion) better suited to an architect/developer pass, not a QA bug report with a prescribed fix — but the reproduction evidence above should be sufficient for whoever picks it up.

## Regression checks

- **Obstacle climb:** functioning correctly across bush/rock/derelict-car, see AC4 above.
- **Animal boop → coins:** `boop-fuel-spawn-log.json` + live coin readout confirm a clean chicken boop awarded exactly +15 coins (99370 → 99385), `11-animal-boop-attempt.png`.
- **Farmer bump → hits:** one farmer bump during the loose-drive session correctly dropped `hitsRemaining` from 5 to 4 (`10-loose-drive-end.png`'s HUD, corroborated by the numeric `__qaStore.hitsRemaining` read at the same moment) — the bump mechanic fires correctly with the bigger contact radius, and the "always outrunnable" speed guarantee (ADR 0007, unaffected by this issue per ADR 0018 §Consequences) was not contradicted in any session (the farmer never caught the truck outright — bumps happened on approach, not a persistent catch).
- **Fuel pickup → gas refill:** the dedicated fuel-chase session shows gas rising from ~31.9 to ~40.1 immediately after reaching the fuel pickup's position (`12-fuel-pickup-attempt.png`), confirming `gasSystem.refill` fires correctly.
- **Console errors:** only the same pre-existing, previously-disclosed benign favicon 404 seen in prior acceptance passes (`console-errors.json`) — no new errors across any of the five sessions.
- **Temp QA hooks fully reverted:** confirmed via `git diff --stat src/main.ts` (no diff) and `git diff --stat src/render/scene.ts` (diff present is the hand-off's own pre-existing change, not this pass's), and `npm run test` (569/569), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert.

## Summary table

| AC | Status |
|---|---|
| AC1 (bigger overall silhouette, all tiers) | **Met** — non-blocking observation: builder-preview camera framing crops Tier 1/2 at this new scale |
| AC2 (tier-to-tier progression preserved) | **Met** |
| AC3 (hitbox scales with the model, same factor, every tier) | **Met** — unit-proven; live-corroborated structurally |
| AC4 (downstream distances re-tuned, not just the truck) | **Met** — climb re-tune, spawn keep-outs, and general fairness all confirmed live |
| AC5 (functional stats unchanged, all tiers/axes) | **Met** — unit-proven; live-corroborated |

## Recommendation

I recommend **for** sign-off on issue #62's AC1-AC5. All five acceptance criteria are met, and every open tuning question the ADR/developer deferred to this pass has a clear finding:

- `TRUCK_SCALE = 1.35` reads well and should ship as-is.
- The re-tuned climb `maxLift`/`maxLiftByClass.large` values produce a proportionate, non-clipping climb response across all three obstacle classes.
- The re-tuned spawn keep-out distances feel reasonable, not cramped or too generous.
- No fairness regression (no multi-contact-per-pass, no new stuck/cramped feeling) was found.
- The camera-clip-into-barn-roof question is **resolved against the developer's original attribution and in favor of the code-reviewer's pushback**: it is a pre-existing camera-follow-vs-static-geometry gap, reproduced directly in this pass, structurally unrelated to `TRUCK_CONTACT_RADIUS`'s size. Recommend a fresh, camera-specific follow-up issue rather than treating it as #62's concern.

Two non-blocking items worth the human's awareness, not blocking this sign-off: the builder-preview camera framing cropping Tier 1/2 trucks (AC1 note), and the camera-clip-into-structures follow-up (item 7).

Per this project's convention, I am recommending, not approving — final sign-off is the human's call.
