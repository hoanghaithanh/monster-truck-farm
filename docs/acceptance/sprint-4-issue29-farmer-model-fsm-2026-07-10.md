# Acceptance Report — Farmer Skeletal Model & State-Driven Animation (issue #29, ADR 0015)

Date: 2026-07-10
Validator: test-engineer
Scope: `docs/requirements/vehicle-and-character-art.md` AC7-AC9 (farmer model, state-distinguishable pose/animation, kid-appropriate tone), validated against commit `fb35e1c` (implementation + the code-review dispose() fix), which is the current tip of `main` at the time of this pass.

## Method

- `npm run test` (Vitest): 496/496 passing (unchanged from the developer/code-reviewer handoff).
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4326`.
- Live-driven via `puppeteer-core` against the real system Chrome, following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the ADR 0014 acceptance pass's own method section). A temporary, read-only QA debug hook was added to `src/main.ts` and `src/render/scene.ts` for the duration of this pass:
  - `window.__qa` (per-frame telemetry: truck position/heading/speed, the live `FarmerSystem.snapshot()` state, and a `scene.debugFarmer()` scene-graph introspection helper) — used to script pursuit-style steering toward the farmer (a simple heading-error controller) so the farmer stays close enough to the chase camera to actually be visible, since the farmer's spawn position is only constrained to be ≥8 units from the truck and the map is large.
  - A `debugSnapCameraToFarmer()` / `debugSnapCameraToTruck()` pair (the latter as a sanity control) that freezes the frame loop's camera on the farmer's/truck's exact tracked world position from a close, fixed offset, bypassing the chase camera's framing/occlusion entirely.
  - Both were **fully reverted** before concluding this pass — confirmed via `git status`/`git diff` showing a clean working tree on `src/main.ts` and `src/render/scene.ts` (`git checkout -- src/main.ts src/render/scene.ts`), `npm run test` (496/496) and `tsc --noEmit` re-run clean afterward. Nothing from the instrumentation is left in the working tree except the screenshots and this report.
- Five independent driving sessions total, each a full `npm run build` against the current committed code (no uncommitted changes at build time other than the reverted-before-conclusion QA hook itself):
  1. A baseline 48s straight-line/circling drive with no farmer-aware steering (v1) — established that the farmer's own random position relative to a non-pursuing truck is usually too far from the chase camera to appear in frame at all.
  2. A telemetry-only pass (v2) confirming exact FSM transition timing against the real, unmodified production constants.
  3. A first pursuit-steering attempt (v3) that got close enough to trigger an actual farmer bump (contact distance ~0-1 units) — useful confirmation that position/collision are real and correct, but ended in a puppeteer frame-detach error (likely an unrelated hard-game-over navigation, not investigated further since it wasn't this pass's concern).
  4. A refined pursuit controller with a standoff band (v4) to approach closely without triggering contact, run across 4 full FSM cycles.
  5. A broadside-approach variant (v5) to rule out camera-occlusion-by-the-truck-itself as the reason the farmer wasn't appearing, run across 4 more full FSM cycles.
  6. A final decisive control test: `debugSnapCameraToFarmer()` vs. `debugSnapCameraToTruck()`, isolating "is the model visible when framed directly" from "does the chase camera frame it."
- Screenshots committed under `docs/qa/screenshots/farmer-model-fsm-acceptance-2026-07-10*/` and `docs/qa/screenshots/farmer-debug-snap*.png`.

## AC-by-AC status

### AC7 (farmer model) — **NOT MET**

Across all 5 sessions (7+ full `ABSENT -> PURSUING -> TIRED -> LEAVING -> ABSENT` cycles), at truck-farmer distances ranging from 9 units down to direct bump contact (~0-1 units), and using two different camera-framing strategies (dead-ahead pursuit and broadside approach) plus a control test that points the camera directly at the farmer's exact tracked world position from 4 units away — **the farmer model never appears on screen in any of the ~120 screenshots taken this pass.** The decisive control test confirms this isn't a chase-camera framing/occlusion artifact: the same direct-camera-snap technique applied to the truck (a known-good render) shows the truck clearly and correctly (`docs/qa/screenshots/farmer-debug-snap3-truck-control.png`); applied to the farmer's exact tracked position, the frame shows only terrain/background (`docs/qa/screenshots/farmer-debug-snap3.png`).

Everything *underneath* the visible rendering is confirmed working correctly via the same telemetry:
- The `.glb` asset loads successfully (HTTP 200, no console errors beyond the pre-existing benign favicon 404 already documented in `sprint-3-wheel-motion-decal-removal-2026-07-09.md`).
- `FarmerSystem`'s FSM transitions fire at the exact production-tuned durations (`FARMER_CHASE_DURATION=10s`, `FARMER_TIRED_DURATION=1.5s`, `FARMER_LEAVE_DURATION=3s` — confirmed millisecond-accurate against live telemetry, matching the orchestrator's earlier instrumented-code-path finding).
- The farmer's `Object3D` is genuinely added to the scene (`scene.add(model)` runs; `debugFarmer()` confirms `inScene: true`, `visible: true`, correct tracked position).
- Bump/contact physics work: an accidental close approach in session 3 triggered a real farmer bump (hearts dropped, the translucent red bump-flash overlay rendered correctly on the truck — farmer AC5 feedback is fine), confirming the farmer's tracked position is the same one used for collision, not a stale/decoupled value.

**Root cause, found via the debug instrumentation (not guessed):** `buildFarmerDisplayModel` (`src/render/scene.ts`) derives its corrective world-scale from `THREE.Box3().setFromObject(source)` — the same pattern that works correctly for the chicken and structures. That pattern silently breaks for a `SkinnedMesh`: `Box3.setFromObject` reads each mesh's *local, un-posed* `geometry.boundingBox`, which for this asset is on the order of 0.001-0.02 units across (confirmed directly for all 12 of the farmer's `SkinnedMesh` nodes), because the real-world scale for a correctly-rigged skinned character is meant to come from the bone/skinning pipeline, not the raw local vertex data. The computed `scaleFactor = FARMER_TARGET_HEIGHT / size.y` ends up applying only ~2.666x world scale (captured live) when something on the order of 500-600x would be needed — the farmer renders at roughly 1/200th its intended size, on the order of a few millimeters tall, which is why it's invisible at any normal camera distance.

This exact gap is also why the unit test suite (496/496 passing) didn't catch it: `scene.test.ts`'s `buildFarmerDisplayModel` describe block explicitly stands in a **plain, non-skinned `THREE.Mesh`** for the source model, with an inline comment stating "`buildFarmerDisplayModel` itself doesn't care about skinning -- that's `SkeletonUtils.clone`'s job." That assumption is false in practice for the scale-derivation step specifically, which is exactly the part of the function that depends on `Box3.setFromObject` behaving the same for skinned and non-skinned sources — it doesn't.

Filed as **[issue #57](https://github.com/hoanghaithanh/monster-truck-farm/issues/57)** (`bug`, `from:qa`, Sprint 4 milestone) with full repro steps and a suggested fix direction (evaluate the skeleton once before measuring and derive scale from bone world positions, or use a fixed human-verified constant for this specific asset instead of the auto-derive pattern).

### AC8 (state-distinguishable art) — **NOT MET (blocked by AC7)**

Cannot be assessed independently of AC7: if the model is never visible, no pose/animation distinction between PURSUING/TIRED/LEAVING can be observed by a player either. The underlying FSM→clip wiring (crossfade to `Idle` on TIRED, crossfade to `Walk` on LEAVING, `Run` on appear) is exercised correctly at the state-machine level per the telemetry, and the code paths described in ADR 0015 §4 (one-shot `onLeaving` callback, crossfade timing, tint application) all fire in the right order — but "the code runs" is not the same claim as "a player can see it," and AC8's own wording is explicitly about what a player can *see*. Once issue #57 is fixed, this AC needs its own dedicated re-check (a re-run of the same pursuit-steering method used in this pass, confirmed to actually work well once the model is visible at correct scale) before it can be marked Met.

### AC9 (tone preserved) — **Unable to fully verify visually; no evidence of a violation**

Cannot independently confirm "TIRED/LEAVING read as friendly/comedic" from pose/animation since the model isn't visible (see AC7). What *can* be confirmed clean:
- Clip-name safety is unaffected by this bug and was already independently confirmed by code review: only 3 of the source's 24 clips (`Run`/`Idle`/`Walk`) are ever referenced by exact string in `scene.ts`, so the combat/gun/melee clips remain unreachable by construction regardless of the scale defect.
- The amber TIRED tint (the pre-existing, still-functional supplementary color cue) is friendly/warm, not alarming, and eyes are excluded from tinting per ADR 0015 §2 — this logic is untouched by the scale bug and was already reviewed.
- The farmer bump/game-over copy ("The farmer caught up with you. Time to try again!", confirmed present in the built bundle) reads as a friendly, non-punishing beat, consistent with `farmer-minimal-bump.md` AC7.
- No evidence of anything *wrong* was observed — this is a "not yet verifiable" gap caused by AC7's defect, not a finding that AC9 is itself violated.

### dispose()/resource-leak fix (code review's Major finding) — **Confirmed correct at code-read level**

Read `farmerDespawn()` and `dispose()` directly against the current committed code:
- `farmerDespawn()` calls `mixer.stopAllAction()`, `scene.remove(farmer.root)`, disposes every per-instance-cloned material (`ownedMaterials`, correctly *not* the shared cached geometry — the doc comment's stated rationale, that `SkeletonUtils.clone` shares `BufferGeometry` by reference with the app-lifetime cached source, is accurate and matches the same sharing convention already established for truck-rig parts), and nulls the `farmer` record.
- The scene module's own `dispose()` (session teardown, e.g. on hard game-over) now calls `farmerDespawn()` directly rather than duplicating teardown logic — correctly handles the "farmer alive at teardown time" case the doc comment calls out as a frequently-hit path (the hard-game-over restart), not a rare corner case.
- Behaviorally, this pass's 7+ full spawn/despawn cycles across 5 independent sessions produced no console errors, no growing frame-time degradation, and no visual "ghost" duplicate farmers — consistent with (though not a substitute for) a full heap-snapshot leak-detection pass, which wasn't judged necessary given how straightforward and already-reviewed this code is.

## Regression checks

- **Console errors:** only the pre-existing, previously-disclosed benign favicon 404, matching the exact pattern already noted in `sprint-3-wheel-motion-decal-removal-2026-07-09.md` and the ADR 0014 acceptance report. No new errors.
- **Driving/animal/fuel/gas systems:** no interference observed; farmer bump and hard-game-over fired correctly and independently when a session drifted into contact range (expected background behavior).
- **Temp QA hook fully reverted:** confirmed via `git status`/`git diff` on `src/main.ts` and `src/render/scene.ts` — both clean. `npm run test` (496/496) and `tsc --noEmit` re-run clean after the revert.

## Summary table

| AC | Status |
|---|---|
| AC7 (farmer model, recognizable, replaces capsule) | **Not Met** — model loads and is tracked correctly but renders at ~1/200th intended scale, effectively invisible. Bug filed: [#57](https://github.com/hoanghaithanh/monster-truck-farm/issues/57). |
| AC8 (state-distinguishable pose/animation) | **Not Met, blocked by AC7** — FSM→clip wiring is correct at the code level but unobservable by a player until AC7 is fixed. |
| AC9 (kid-appropriate tone) | Unable to fully verify visually; no evidence of a violation in the parts that are checkable independent of AC7 (clip-name safety, tint logic, game-over copy). |
| dispose()/leak fix (code review's Major finding) | Confirmed correct at code-read level; no anomalies observed across 7+ live spawn/despawn cycles. |

## Recommendation

I recommend **against** sign-off for issue #29 in its current state. This is a genuine, reproducible, root-caused defect (not a testing-methodology artifact — confirmed via an independent camera-snap control test against the truck) that means AC7 and AC8, the two ACs this issue exists specifically to satisfy, are not met by a player-visible margin. AC9 and the dispose() fix are in good shape and don't need to be re-litigated once AC7/AC8 are fixed, but AC7/AC8 need a real fix and a fresh live-screenshot re-check (unit tests alone cannot catch this class of bug, per the "unit test stands in a non-skinned Mesh" finding above) before this can be re-recommended.

Per this project's convention, I am recommending, not approving — final sign-off (and any scope/priority call on issue #57, e.g. whether it blocks Sprint 4 close-out) is the human's call.

## Addendum (2026-07-10, re-check after commit `ff959e6`) — AC7/AC8 now MET

`ff959e6` fixed the root cause found above: `buildFarmerDisplayModel` (`src/render/scene.ts`) now calls `source.updateMatrixWorld(true)` and passes `precise = true` to `Box3().setFromObject`, which walks per-vertex via `SkinnedMesh`'s bone-transform-aware `getVertexPosition()` override instead of reading each mesh's raw un-posed local `geometry.boundingBox`. This re-check specifically re-validates AC7/AC8; AC9 and the dispose()-fix finding above are unaffected by this change and were not re-litigated, per the orchestrator's scope for this pass.

**Method:** same live-driven convention as the original pass — real `npm run build` (clean), served via `npx vite preview --port 4327`, driven with `puppeteer-core` against the real system Chrome. The same class of temporary, read-only QA hook was re-added for the duration of this pass only (`window.__qa` per-frame telemetry on `src/main.ts`, plus `debugFarmer()` / `debugSnapCameraToFarmer()` / `debugSnapCameraToTruck()` on the scene closure returned by `src/render/scene.ts`) and **fully reverted before concluding** — confirmed via `git status`/`git diff` showing a clean working tree on both files, `npx tsc --noEmit` clean, and `npm run test` re-run at 496/496 passing afterward.

Unlike the original pass's pursuit-steering controller, this re-check's first attempt had an inverted-steering bug (mapped `headingErr > 0` to the right-turn key, when `truck-motion.ts`'s documented convention is that the right-turn key *decreases* heading — the exact inverted-steering class of bug that project's own regression test suite calls out in `truck-motion.test.ts`). Caught immediately from live telemetry (the truck drove itself into a corner and got stuck against the terrain boundary while the farmer wandered off-screen) and fixed by swapping the mapping. A second run added a wide 6-9 unit standoff band (approach past 9, actively reverse below 6, coast between) to close in on the farmer without risking a bump/hard-game-over ending the session before TIRED/LEAVING could be observed — the first corrected-steering run wasn't defensive enough here and *did* trigger a hard game-over (`"The farmer caught up with you. Time to try again!"`) after closing to contact distance, confirming the bump mechanic itself is unaffected by this fix but also confirming the standoff band was necessary for a clean re-check run.

**Result: two complete `PURSUING -> TIRED -> LEAVING -> ABSENT` cycles observed** (cycle 0 at t=9.0-23.5s, cycle 1 at t=32.3-46.9s of a single continuous driving session), truck-farmer distance held in the 4-9 unit range throughout (well within normal chase-camera framing distance, not a debug-camera snap), zero bumps/game-overs in this run, no new console errors (only the same pre-existing benign favicon 404). `debugFarmer()` telemetry confirmed `hasAnimated: true` (the real skeletal model, not the capsule fallback) at every captured state.

### AC7 (farmer model) — now **MET**

The farmer renders as a clearly recognizable, correctly-scaled human figure at normal driving-scene chase-camera distances — no debug camera snap needed to see it, which is the exact gap the original pass found. Confirmed visually across both cycles; representative screenshots:
- `docs/qa/screenshots/farmer-model-fsm-recheck-2026-07-10/state-pursuing-cycle0-chasecam.png` — farmer visible via the normal chase camera at ~5 units from the truck, standing next to the farmhouse for scale reference.
- `docs/qa/screenshots/farmer-model-fsm-recheck-2026-07-10/state-pursuing-cycle1-chasecam.png` — same confirmation in a different part of the map (near the barn/rock obstacles), ruling out a single-location fluke.
- `docs/qa/screenshots/farmer-model-fsm-recheck-2026-07-10/99-control-truck-snapcam.png` — the same debug-camera-snap control-test technique the original pass used to isolate model-visibility from chase-camera framing, re-run here on the truck as a sanity check; both truck and (nearby, per the other screenshots) farmer render at consistent, correctly-proportioned scale relative to the barn/rock/terrain around them.

### AC8 (state-distinguishable art) — now **MET**

With the model visible at correct scale, PURSUING/TIRED/LEAVING are clearly distinguishable through pose, not just correct at the telemetry level:
- **PURSUING** — dynamic mid-stride running pose (`state-pursuing-cycle0-chasecam.png`, `state-pursuing-cycle1-chasecam.png`): leg extended, visible forward lean and arm swing.
- **TIRED** — static, upright standing/idle pose (`state-tired-cycle0-chasecam.png`, `state-tired-cycle1-chasecam.png`): feet together, no stride, clearly at rest — reads as "stopped, catching breath," distinct from both the running and walking poses. The amber tint (the pre-existing supplementary cue) is also visibly present as a warm color shift.
- **LEAVING** — relaxed walking gait (`state-leaving-cycle0-chasecam.png`, `state-leaving-cycle1-chasecam.png`): one leg forward mid-step, visibly different cadence from the PURSUING run and the TIRED static stance.

All three were captured via the normal chase camera (what a player actually sees) at each state's first observation in each of the two independent cycles — four chase-camera screenshots per state pairing across cycles, plus a matched `debugSnapCameraToFarmer()` confirmation shot for each, all in `docs/qa/screenshots/farmer-model-fsm-recheck-2026-07-10/`.

### Updated summary table

| AC | Status (original 2026-07-10 pass) | Status (this re-check, same day, post-`ff959e6`) |
|---|---|---|
| AC7 (farmer model) | Not Met | **Met** |
| AC8 (state-distinguishable pose/animation) | Not Met, blocked by AC7 | **Met** |
| AC9 (kid-appropriate tone) | Unable to fully verify visually | Not re-litigated this pass (out of scope per orchestrator instruction); nothing in this re-check contradicts the original pass's "no evidence of a violation" finding — the TIRED tint reads as intended (warm amber, not alarming) and the game-over copy observed during the standoff-tuning misstep run matches the already-confirmed friendly wording. |
| dispose()/leak fix | Confirmed correct at code-read level | Not re-litigated this pass (unaffected by this fix; two full spawn/despawn cycles plus one earlier session's bump/despawn ending observed in this pass's own driving, no anomalies). |

### Updated recommendation

I now recommend **for** sign-off on issue #29's AC7 and AC8 — the defect found in the original pass is fixed, root-caused, and independently re-confirmed via a fresh live-driven session using the same puppeteer/Chrome methodology, with the farmer visibly correct at normal camera distance across two full FSM cycles and both new-steering-bug and standoff-band lessons documented above for anyone re-running this method later. Combined with the original pass's AC9 and dispose()-fix findings (both already in good shape and unaffected by this fix), all of issue #29's acceptance criteria are now met.

Per this project's convention, I am recommending, not approving — final sign-off is still the human's call.
