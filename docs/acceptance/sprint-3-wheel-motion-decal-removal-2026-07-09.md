# Acceptance Report — Sprint 3, Truck Wheel Motion & Decal Removal (issues #40, #41)

**Date:** 2026-07-09
**Scope:** Validation of commit `56b40a7` ("Add truck wheel roll/steer motion; remove body-design decal cosmetic (#40, #41)") on `main`, against `docs/requirements/truck-wheel-motion.md` (AC1-AC9) and the two "Post-ship update" notes in `docs/requirements/truck-cosmetics.md`. `code-reviewer` already reviewed this commit clean (verdict: ready for acceptance validation; filed two non-blocking tech-debt issues, [#43](https://github.com/hoanghaithanh/monster-truck-farm/issues/43) wheel-roll-resets-on-asset-upgrade-in-place, and [#44](https://github.com/hoanghaithanh/monster-truck-farm/issues/44) dead `design` socket field).

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Summary, up front

**No functional/correctness defects found. Both code-reviewer's non-blocking issues (#43, #44) independently confirmed to be exactly as bounded as filed — nothing worse.** The one AC this validation focused hardest on — AC3's "physically-accurate, per-tier-radius" roll rate — is the one most likely to have been shortcut (e.g. a plausible-looking but tier-blind roll speed), and it is not: independently measured live, the tier-0/tier-2 roll-rate ratio matches the inverse ratio of `WHEEL_RADIUS_BY_TIER` to 10 significant figures. All 9 ACs in `truck-wheel-motion.md` are met, and the decal removal (#41) is complete with no dead rendering code, matching the human's direct removal decision.

## How this was validated

**(a) Code inspection** — `src/render/truck-rig.ts` (`WheelPivots`/`TruckWheelPivots`, the nested steer→roll→wheel-object pivot structure and why it avoids Euler-order composition bugs), `src/render/scene.ts` (`setTruckWheelMotion`'s roll-delta formula and steer-yaw clamp/reset, the `tickEffects` asset-upgrade-in-place rebuild path), `src/render/truck-sockets.ts` (`WHEEL_RADIUS_BY_TIER`), `src/render/cosmetics/cosmetic-manifest.ts`/`src/core/types.ts`/`src/core/cosmetics/default-cosmetics.ts`/`src/ui/builder.ts` (confirming `bodyDesign` and all decal-building code — `buildDesignDecal`/`buildStripeDecal`/`buildFlameDecal`/`BODY_DESIGN_OPTIONS` — are fully deleted, not disabled).

**(b) Full existing test suite** — `npx vitest run`: **403/403 passing**, 31 files, unmodified by this validation (re-confirmed at the start and end of this pass, including after every temporary debug-hook round-trip below). `npm run build` (`tsc --noEmit` + `vite build`) succeeds cleanly.

**(c) Independent live verification** — `npm run build && npx vite preview` (port 4323, base path `/monster-truck-farm/`), driven via `puppeteer-core` (already present as an extraneous `node_modules` install from a prior QA pass, not added to `package.json`/`package-lock.json` — confirmed via `git status`/`git diff` untouched) against the system's real Edge (`msedge.exe`), real DOM/GameStore/three.js/Rapier, not mocked. A temporary debug hook (`window.__qa = { store, assetRegistry, scene, drivingSystem, lastPosition }`) was added to `src/main.ts` and a `__qaWheelRotations()` reader to `src/render/scene.ts`'s returned object, for this pass only, in three separate rounds (main roll-rate/steering measurement, the #43 regression probe, and the obstacle-collision live check) — each round reverted via `git checkout -- src/main.ts src/render/scene.ts` immediately after use, confirmed via `git status --short`/`git diff` (clean) and a fresh `npx vitest run` (403/403) after each revert.

Scratch scripts (`qa-wheel-motion.mjs`, `qa-wheel-motion-2.mjs`, `qa-issue43.mjs`, `qa-obstacle.mjs`, run from the repo root so `node_modules` resolved) were deleted immediately after each was used — confirmed via `git status --short` showing no untracked `.mjs` files at any point after cleanup.

Screenshots saved under `docs/qa/screenshots/wheel-motion-decal-removal-acceptance-2026-07-09/` (13 images, committed), plus raw measurement JSON (`measurements.json`, `measurements-2.json`, `measurements-issue43.json`) alongside them for anyone who wants the exact numbers this report's tables summarize.

**Coverage gap noted, not fixed in this pass:** there is no `scene.test.ts` — `setTruckWheelMotion`'s formula (the actual code implementing AC1/AC3-AC6) has zero automated unit-test coverage; `truck-rig.test.ts` only covers the pivot *structure*, not the motion math. This is a real gap (it's exactly the kind of thing that could silently regress), flagged here rather than silently left as "presumably fine because it's simple." It exists because `createGameScene` needs a `WebGLRenderer`/DOM (`container.appendChild`) and this project's Vitest config runs in `environment: 'node'` with no jsdom/happy-dom — the same reason no other `scene.ts` behavior has unit tests either. I did not add a scene-level test harness in this pass (that's a `test-engineer` coverage task, not an acceptance-validation task, and would need an architecture decision — headless-GL vs. extracting the pure roll/steer math into a testable free function — that isn't mine to make unilaterally); recommend filing this as a tracked backlog item so the tier-relative roll-rate math isn't solely guarded by manual/live QA passes like this one going forward.

---

## AC-by-AC — `truck-wheel-motion.md`

| AC | Description | Status | Evidence |
|---|---|---|---|
| **AC1** (all 4 wheels roll while moving, direction reverses in reverse) | **MET.** | Live: driving forward, all 4 wheel-roll pivots' `rotation.x` increase together (`measurements.json`'s `tier0Roll`); once *actually* reversing (`drivingSystem.speed < -0.5`, not just decelerating through zero), roll delta is negative (`measurements-2.json`: `ac1_reverseRollDeltaOnceActuallyReversing: -1.673`). Screenshots `03`/`04` (tier 0) and `08`/`09` (tier 2), frame-A/frame-B pairs, show visibly different wheel angles between frames while driving. |
| **AC2** (wheels stop rolling when stationary) | **MET.** | Live: after releasing throttle, polled `drivingSystem.speed` until genuinely `< 0.001` (not just "key released" — the truck coasts per the existing drive-physics deceleration curve, unchanged by this feature), then sampled roll twice 400ms apart: identical (`measurements-2.json`: `ac2_trulyStoppedRollUnchanged: true`, both samples `13.708938857142822`). Screenshot `07`. |
| **AC3** (roll rate = actual per-frame speed / per-tier circumference, physically accurate) | **MET — the one AC this pass scrutinized hardest, see dedicated section below.** | Independent live measurement: tier-0 vs. tier-2 roll-rate ratio at the identical fixed speed matches the inverse `WHEEL_RADIUS_BY_TIER` ratio to 10 significant figures. |
| **AC4** (front wheels yaw toward held steer input) | **MET.** | Live: holding right-steer, `frontLeft.steer`/`frontRight.steer.rotation.y = 0.5235987755982988` rad = exactly 30° (`MAX_FRONT_WHEEL_STEER_YAW`, `scene.ts`). Screenshots `05` (tier 0), `10` (tier 2). |
| **AC5** (steer release returns to centered) | **MET (instant snap, one of the two AC-permitted behaviors).** | Live: 200ms after releasing the steer key, both front wheels' `steer.rotation.y === 0` (`measurements.json`'s `steerReleased`). Screenshot `06`. |
| **AC6** (rear wheels roll but never yaw) | **MET.** | Live, sampled during steer-left: rear-left/rear-right `steer.rotation.y === 0` while front wheels show `-0.5235987755982988`; all four wheels' `roll` continued advancing identically (`measurements.json`'s `rearWhileSteering`). |
| **AC7** (roll/steer independent of wheel-look cosmetic and wheel tier) | **MET.** | Tier independence: AC3's own measurement *is* the proof — the formula reads `WHEEL_RADIUS_BY_TIER[currentBuild.wheels]`, and the motion pivots (`WheelPivots`) are cosmetic-material-agnostic by construction (`paintWheel` only ever touches `.material`, never a pivot's `.rotation`). Cosmetic independence: confirmed by code inspection (`paintWheel`/`tintByMaterialName` in `truck-rig.ts` operate on the wheel mesh's material only, `setTruckWheelMotion` in `scene.ts` never touches materials) — not independently re-driven across all 3 wheel-look ids live this pass, since the code path has no branch that could plausibly couple them (structurally separate concerns, unlike a runtime conditional that could hide a bug). |
| **AC8** (no physics/collision regression) | **MET, live-verified beyond the unit suite.** | Full existing suite unmodified, 403/403. Additionally, live-drove a tier-0-wheeled truck backward toward the large `derelict-car-1` obstacle at `(0, -8)` (radius 1.8, blocking for tier-0's "small"-only clearance) — truck stopped at `z ≈ -5.28`, matching the expected blocking contact point (`-8 + 1.8 obstacle-radius + 0.9 TRUCK_CONTACT_RADIUS = -5.3`) almost exactly, i.e. collision resolution is unchanged, not just "the code looks unmodified." |
| **AC9** (no perceptible perf regression) | **MET, structurally.** | This adds two `THREE.Group` pivots per wheel (8 total) and a per-frame scalar-rotation write, on already-loaded geometry — no new asset loading, no new draw calls (pivots are transform-only nodes, not separately rendered). Not independently profiled with a frame-timing tool this pass (the doc itself calls the expected impact "negligible" and this is additive transform math, not new geometry/materials) — judged sufficient given the small, bounded nature of the change; a human wanting a hard frame-time number should treat this as a gap, not a "confirmed negligible" claim. |

---

## AC3 deep-dive: the tier-relative roll-rate measurement

This is the AC most likely to "pass" on a shallow look (wheels visibly spinning) while being wrong on the actual bar the human set (physically-accurate, tier-relative rate) — so it got the most rigorous check in this pass, per the specific ask.

**Method:** with a fresh driving session at wheel tier 0, called `scene.setTruckWheelMotion(speed=5, steerIntent=0, dt=1/60)` directly 60 times (simulating exactly 1 second of driving at a fixed, known 5 units/s — using the same function the real per-frame loop calls, not a re-implementation of the formula), and read `frontLeft.roll.rotation.x` before/after. Repeated identically at wheel tier 2 (after a pause-to-builder → purchase tier-2 wheels → re-confirm round trip, so it's a genuinely separate rig build, not a stale reference).

**Result** (`measurements.json`):

| Tier | Wheel radius | Roll delta over 60 frames @ 5 units/s |
|---|---|---|
| 0 ("Base") | 0.28 | 17.85714285714285 rad |
| 2 ("Monster") | 0.58 | 8.620689655172418 rad |

- Measured ratio (tier0 / tier2): **2.0714285714285694**
- Expected ratio (`WHEEL_RADIUS_BY_TIER[2] / WHEEL_RADIUS_BY_TIER[0]` = `0.58 / 0.28`): **2.071428571428571**

These agree to 10 significant figures (the residual is floating-point noise from 60 accumulated `+=` operations, not a formula error). This directly confirms the tier-0 wheel completes visibly more rotation than the tier-2 wheel for the identical simulated distance traveled, in exactly the inverse proportion of their radii — the "bigger tire covers the same ground in fewer rotations" physical relationship the human asked for, not a canned or tier-blind animation. Also cross-checked against `2 * π * radius`-based absolute values: tier-0's 17.857 rad over 1s at 5 units/s implies a circumference-consistent 5/(0.28×2π) = 2.842 rotations/s, and tier-2's 8.621 rad implies 5/(0.58×2π) = 1.372 rotations/s — both exactly what the doc's formula (`speed·dt / circumference · 2π`) predicts.

Screenshots `03`/`04` (tier 0) vs. `08`/`09` (tier 2) are the visual companion to this — at a glance the tier-2 "Monster" tire is visibly the larger tire (matching the tier-progression already validated in the sourced-art acceptance pass), consistent with it needing fewer, slower-looking rotations to cover the same ground.

---

## Regression checks on code-reviewer's two filed issues

### #43 — wheel roll resets on asset-upgrade-in-place rebuild

**Confirmed bounded as filed, by code inspection; live repro attempted but not conclusively captured — disclosed, not silently assumed.**

Code inspection (`scene.ts`'s `tickEffects`) shows the mechanism plainly: when the bounded 3s asset gate times out and a part is still a primitive fallback, `rigNeedsRecheck` stays true; once the real asset resolves, `tickEffects` builds an entirely new `TruckRigResult` (a fresh `THREE.Group()` per wheel pivot, default `rotation = 0`) and swaps it in. There is no code path here that can throw — `buildTruckRig` doesn't reject/throw on a resolved registry entry, and the swap (`scene.add`/`scene.remove`/`dispose()`) is synchronous DOM/three.js graph mutation with no fallible step. So the *ceiling* of this bug, by construction, is exactly what's filed: a one-frame visual roll-angle snap-to-zero, never a crash or a stuck/broken wheel.

I also attempted to force this transition live (delaying `wheel-tier-0.glb`'s network response past the driving session's start, then polling roll every 50ms across the resolve window) to catch the actual reset moment on camera/in data. This did not succeed as designed — the polling loop in this pass observed the asset already `'ready'` before the session even started, meaning my artificial network delay didn't actually hold the request back the way intended (methodology gap, disclosed rather than silently dropped). The regression battery below (10x rapid wheel-tier churn + 6x pause/resume, all against real cached asset timing) exercises the closely-related `TruckRigResult.dispose()`/rebuild code path repeatedly and found zero errors, which is corroborating evidence but not a direct observation of the exact reset frame. **Net: I'm confident in the "bounded to a visual reset, not worse" conclusion from code inspection plus the passing regression battery, but flag that I did not get a clean live repro of the reset moment itself — a human or a follow-up pass with a more reliable network-throttling setup (e.g. CDP's `Network.emulateNetworkConditions` instead of manual request-interception delay) could close that gap if a stronger guarantee is wanted.**

### #44 — dead `design` socket field in `truck-sockets.ts`

**Confirmed real and exactly as filed.** `TruckSockets.design: THREE.Vector3` and each tier's `design: [x,y,z]` socket value are still present in `src/render/truck-sockets.ts` (grep-confirmed), but nothing in `truck-rig.ts` reads `sockets.design` anymore (the decal-building code that used to consume it was deleted per #41). Dead data, not dead *behavior* — no rendering or motion path is affected. Non-blocking, matches code-reviewer's characterization.

### Regression battery (rapid churn + pause/resume, this project's #18/#21/#31-history convention)

10x rapid wheel-tier churn (cycling tier 0→1→2→0…, purchasing as needed) immediately followed by `confirmBuild()`, then a separate 6x rapid `pauseToBuilder()`/`beginDrive()` battery with no waits between cycles — both ended cleanly in an active `DRIVING` session (`measurements-2.json`: `churnResult.errors: []`, `pauseResumeErrors: []`), zero console errors beyond the one pre-existing, unrelated favicon 404 (matches this project's previously-disclosed "known favicon 404" pattern — no `favicon.ico` reference exists in `index.html`/`public/`, browsers request it unconditionally). Screenshots `11`, `12`.

---

## #41 — decal removal (`truck-cosmetics.md` post-ship update 2)

**MET.** Live-confirmed on the builder screen: the cosmetics section (`🎨 Wheel style`) contains exactly one row, "Wheel look" (Standard/Red rim/Chrome) — no "Body design" row, no "Racing stripe"/"Flame accent" text anywhere in the DOM (`measurements.json`'s `cosmeticLabels`, screenshot `01`). Code inspection confirms `bodyDesign` is gone from `TruckCosmetics` (`core/types.ts`), `DEFAULT_TRUCK_COSMETICS` (`core/cosmetics/default-cosmetics.ts`), and every decal-building function (`buildDesignDecal`/`buildStripeDecal`/`buildFlameDecal`, `BODY_DESIGN_OPTIONS`) is deleted outright from `cosmetic-manifest.ts` — not disabled/dead-code, matching the human's explicit "deleted, not disabled" instruction and mirroring the prior body-color removal's pattern. No decal renders on any body in any driving/builder screenshot taken this pass, regardless of body tier or wheel-look cosmetic selected.

---

## Summary table

| Requirement | Status |
|---|---|
| wheel-motion AC1 (all 4 wheels roll, direction reverses) | Met |
| wheel-motion AC2 (stop when stationary) | Met |
| wheel-motion AC3 (physically-accurate, per-tier roll rate) | **Met — independently measured, ratio matches to 10 sig. figs** |
| wheel-motion AC4 (front wheels steer-yaw) | Met |
| wheel-motion AC5 (steer release recenters) | Met |
| wheel-motion AC6 (rear wheels never yaw) | Met |
| wheel-motion AC7 (cosmetic/tier motion independence) | Met |
| wheel-motion AC8 (no physics/collision regression) | Met, live obstacle-collision re-verified |
| wheel-motion AC9 (perf budget) | Met, structurally (not independently profiled) |
| cosmetics post-ship update 2 (#41 decal removal) | Met, deleted not disabled |
| code-reviewer issue #43 (roll reset on asset-upgrade-in-place) | Confirmed bounded as filed by code inspection; live repro attempted, inconclusive — disclosed |
| code-reviewer issue #44 (dead `design` socket field) | Confirmed real, exactly as filed, non-blocking |
| Visual check (tier-0 vs. tier-2 roll rate, steering-in-progress) | Screenshots captured, consistent with the measured data |

**No new defects found this pass.** #43 and #44 remain open as tracked, non-blocking tech debt (unchanged from code-reviewer's filing); recommend also tracking the `scene.ts` unit-test coverage gap noted above as a follow-up backlog item, since it's the one piece of this feature currently guarded only by manual/live QA rather than an automated regression test.

---

## Recommendation, not approval

Both issues #40 (wheel roll/steer motion) and #41 (decal removal) hold up under live, independently-measured verification — specifically including the one AC (AC3's physically-accurate roll rate) that was flagged as the likeliest place for a shallow "wheels just spin" shortcut to hide, which it did not. The obstacle-collision live check and the rapid-churn/pause-resume regression battery both re-confirm this project's established risk areas (render-only claims that need a live check, and the disposal/asset-loading lifecycle history from #18/#21/#31) rather than taking "should be render-only" on faith.

The one open item I'd want a human's awareness of before final sign-off is the #43 live-repro gap disclosed above — I'm confident in the conclusion from code inspection and the regression battery, but did not get a clean direct observation of the reset frame itself, and said so rather than papering over it.

**This is a recommendation only — I am not the approver.** I'd recommend this feature is ready for final sign-off, with #43/#44 accepted as tracked non-blocking debt and the `scene.ts` test-coverage gap flagged as a worthwhile follow-up, not a blocker.

**This is a recommendation only — I am not the approver.**
