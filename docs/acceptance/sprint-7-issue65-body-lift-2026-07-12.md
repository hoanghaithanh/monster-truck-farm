# Acceptance Report — Truck Body Lift for Authentic Monster-Truck Stance (issue #65, ADR 0020)

Date: 2026-07-12
Validator: test-engineer
Scope: `docs/requirements/truck-body-lift.md` AC1-AC8, validated against the current working tree. Implementation + unit tests (664/664) + code review are already complete and clean per the hand-off (no Blockers/Majors) — this pass independently re-verifies against the running system rather than re-reviewing the diff.

## Method

- `npm run test` (Vitest): 664/664 passing.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4420`.
- Live-driven via `puppeteer-core` against the real system Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless), following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue #29/#48/#49/#62/#63 acceptance passes' method sections).
- A temporary, read-only QA debug hook was added to `src/main.ts` (`window.__qaStore`: direct reference to the live `GameStore`, used only to call real store methods — `addCoins`/`purchaseTier`/`selectTier`/`beginDrive` — from the builder screen, not a bypass of gameplay rules; `window.__qa`: per-frame telemetry of truck position/heading/speed and the full `ClimbTransform` including `wheelSuspension{fl,fr,rl,rr}`). **The hook was fully reverted before concluding this pass** — confirmed via `git diff --stat src/main.ts` showing no diff, and `npm run test` (664/664), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert.
- No `world.step()`-based teleport helper was used at any point in this pass, per `CLAUDE.md`'s QA gotchas — every truck movement used real keyboard-driven bang-bang steering (a proportional controller reading `window.__qa.position/heading` each ~150ms and toggling `KeyW`/`KeyA`/`KeyD` via `page.keyboard`, deriving the steer-to-heading mapping directly from `truck-motion.ts`'s own documented sign convention rather than assuming one).
- Sessions run, each a fresh page load with a fresh build:
  1. **Builder preview, all 3 tiers** (`buildTier(0,0)` / `(1,1)` / `(2,2)`, screenshotted in place, AC1/AC2/AC8).
  2. **`drive-tier0`**: default build (body/wheels tier 0), driven from `TRUCK_START (0,6)` toward the bush obstacle at `(6,0)` — **a real turn en route** (the proportional controller turns ~135° while approaching, not a straight-line pursuit), then a full crossing over the bush, then a second off-center re-approach from a different angle to isolate a single wheel corner (AC3/AC4/AC5/AC7).
  3. **`drive-tier1`** and **`drive-tier2`**: independent spot-check driving sessions (flat-ground forward drive) to confirm the lifted stance and stability hold in the driving scene (not just the builder preview) on the two larger tiers too (AC1/AC5/AC7 cross-tier).
- Telemetry (full `climb` transform per sampled frame) and console errors were logged to JSON alongside screenshots, all committed under `docs/qa/screenshots/issue65-body-lift-acceptance-2026-07-12/`.

### Method note: deriving the correct steering sign convention up front

Per the #63 acceptance report's own documented lesson (a first attempt there sent the truck the wrong way), this pass derived the steer-to-heading mapping from `truck-motion.ts`'s own source comment *before* driving rather than guessing: `heading -= steer*turnRate*dt` while moving forward, and displacement `= (sin(heading), cos(heading)) * speed * dt`, so the desired heading toward a target is `atan2(dx, dz)` and the correcting key is `KeyA` (left, increases heading) when the heading error is positive, `KeyD` (right, decreases heading) when negative. A first raw "always press W" run (discarded, not committed) confirmed heading=0 moves toward +Z, away from the bush, before the proportional controller was applied — consistent with, not contradicting, the documented convention.

## AC-by-AC status

### AC1 (bigger body-to-wheel gap, all tiers) — **MET**

`builder-tier0.png` / `builder-tier1.png` / `builder-tier2.png` all show a clearly visible daylight gap between the body's underside and the wheel tops on every tier — judged against the documented pre-#65 convention (body underside at wheel-*center* height, i.e. the wheel's upper half previously buried inside the body/fender). In every screenshot here the body sits visibly above the wheel-center line with open space beneath the chassis; this reads as "the body sits higher, there's daylight under the truck now" at a glance, satisfying AC1's bar without needing a live pre/post comparison (none exists to run — the working tree only has the post-lift version, per the assignment's own framing). The driving-scene spot checks (`drive-tier0-offcenter-5.png`, `drive-tier1-forward.png`, `drive-tier2-forward.png`) confirm the same gap holds outside the builder preview too, on all three tiers.

### AC2 (tier-to-tier progression preserved) — **MET**

`builder-tier0.png` → `builder-tier1.png` → `builder-tier2.png` show an unambiguous Tier 0 < Tier 1 < Tier 2 size/height ordering, both in overall silhouette and in wheel size (Base → Off-road → Monster tread visibly growing) — matching the unit-test-pinned guarantee (`truck-sockets.test.ts`'s "preserves strict Tier 0 < Tier 1 < Tier 2 body-Y ordering after the lift" test, confirmed passing) with a live visual. The driving-scene tier1/tier2 spot checks show the same growing silhouette relative to tier0's driving screenshots. No two adjacent tiers read as hard to tell apart.

### AC3 (suspension travel legible against the new baseline) — **MET, with strong direct evidence**

The off-center re-approach onto the bush produced a clean, decisive single-corner case: at the first frame of the second pass, telemetry read `wheelSuspension = {fl: 0.057, fr: -0.057, rl: 0.150 (clamped), rr: -0.150 (clamped)}` — the rear axle at the new `maxTravel=0.15` clamp ceiling while the front axle showed a much smaller residual. `drive-tier0-offcenter-0.png` shows this directly: the rear-left wheel visibly drops below the body with clear daylight between the tire and where the fender/underside sits, while the front wheels stay close to their normal position — legible independent per-wheel motion, not imperceptible (the pre-#65 defect this feature exists to fix), and not so large that the wheel appears to detach or float away (it still reads as "this wheel found a dip," the same read the #63 acceptance report gave `maxTravel`'s old, larger 0.25 value at its clamp). The full crossing sequence (`telemetry-tier0-crossing-samples.json`) also shows continuous, smoothly-varying per-wheel values throughout, never zero simultaneously with a nonzero whole-body lift, confirming the effect is genuinely visible against the new, larger static gap rather than swamped by it. This was verified by live playtest/screenshot exactly as AC3 requires (not code-inspection-only).

### AC4 (existing whole-body climb and wheel motion keep working) — **MET**

`drive-tier0-crossing-0.png`, captured at the start of the bush crossing, shows the whole rig visibly nose-up-tilted over the obstacle (telemetry: `lift=0.325, pitch=0.341` at that frame, rising to a peak `lift≈0.807` a few frames later per `telemetry-tier0-crossing-samples.json`) — the pre-existing whole-body climb/tilt effect (`truck-obstacle-climbing.md`) is clearly still operating at the new, taller baseline, exactly as ADR 0020 §4 predicted ("it needs no numeric change" since it's a group transform layered on top of the rig). Forward motion tracked correctly frame-to-frame across every session with no skating or frozen-wheel artifact observed in any screenshot, and the truck's heading/position updated smoothly through both the 135°-ish turn en route and the crossing itself, consistent with wheel roll/steer-yaw (`truck-wheel-motion.md`) continuing to function unmodified. Neither mechanism needed to change to keep working, matching the design's claim.

### AC5 (no clipping or disconnect artifacts) — **MET**

At rest (all three builder-preview screenshots, and the flat-ground `drive-tier0-start.png`/`drive-tier1-start.png`/`drive-tier2-start.png` moments where telemetry read all-zero `climb`) every wheel reads as visually anchored under its fender/wheel-well silhouette on all three tiers, with a larger but still-covered gap above — no wheel pokes out the top of its fender opening, and no gap/hole appears where a fender should meet its wheel. In motion, the crossing and off-center sequences (`drive-tier0-crossing-0.png` through `-20.png`, `drive-tier0-offcenter-0.png` through `-15.png`) show the same holds even at the near-`maxTravel`-clamp moment identified for AC3 — the rear-left wheel visibly drops but stays read as "this vehicle's wheel," not as a detached or floating object, and the fender above it never shows daylight straight through to the ground behind. No clipping (body swallowing a wheel top) was observed in any screenshot across either tier or driving state.

### AC6 (functional stats and horizontal hitbox unchanged, all tiers/axes) — **MET, confirmed by diff inspection**

`git diff --stat 8eee6db -- src/core/stats/ src/core/clearance.ts` (the last commit before the #65 work, i.e. #64's fix) returns **empty** — zero changes to hit-capacity/obstacle-clearance-class/top-speed/gas-capacity resolution or the clearance rule. `TRUCK_CONTACT_RADIUS = 0.9 * TRUCK_SCALE` in `src/core/driving/config.ts` is untouched (grep-confirmed, still reads exactly this expression, `TRUCK_SCALE` itself unchanged at 1.35). `src/systems/driving-system.ts`'s `TRUCK_HALF_HEIGHT = 0.4` is untouched. This AC is a "did not change" claim, and the only changed files in the working tree are `src/render/truck-sockets.ts` (+`liftSockets`/`BODY_LIFT_FACTOR`), `src/render/truck-sockets.test.ts`, and `src/core/driving/config.ts` (`maxTravel` only) — exactly the ADR's declared footprint, confirmed by `git status` at the start of this pass. This AC is best verified this way (numeric non-change), not by screenshot, and is confirmed.

### AC7 (no chaotic or unstable read) — **MET**

Across every screenshot in this pass — builder previews, flat-ground starts, the turn en route, the bush crossing, the off-center pass, and the tier1/tier2 spot-check drives — the truck reads as a single, coherent, grounded vehicle. No screenshot shows anything resembling a tip, wobble, launch, or floating-apart read, including at the AC3 near-clamp moment. No precision timing or special input was required to produce a correct-looking result — the driving controller used only plain forward+turn key presses, the same input vocabulary a young player would use, and every crossing/turn completed cleanly on the first attempt with the design's own bounded-clamp math (`maxTravel`) doing the work of preventing anything more extreme.

### AC8 (builder preview reflects the new stance) — **MET**

`builder-tier0.png`/`builder-tier1.png`/`builder-tier2.png` show the lifted stance in the builder's live 3D preview, matching the driving-scene stance observed in the corresponding `drive-tier{N}-*.png` screenshots — both consumers read `BODY_TIER_SOCKETS` through the same `buildTruckRig()` path (ADR 0011 §4), so this holds by construction and was confirmed live, not just inferred. **Observation on issue #67 (separate, pre-existing, tracked bug):** in this pass's builder screenshots, none of the three tiers' bodies appear cropped at the top or bottom of the 220×220px preview frame — Tier 2's roofline sits comfortably inside the frame with visible margin above it. This pass did not reproduce #67's cropping symptom at the current preview camera framing, so the post-lift body-top increase (tier 0 ~1.0 → ~1.23, tier 2 ~2.02 → ~2.49 per ADR 0020's own numbers) does not appear to have newly triggered or worsened a top-crop in this specific check. Noted as an observation only, per the assignment's instruction — #67 remains that issue's own surface to investigate/close, not an AC8 failure here.

## Regression / general checks

- **Console errors:** only the same pre-existing, previously-disclosed benign favicon 404 (`console-errors.json`) — no new errors introduced by this feature.
- **Temp QA hook fully reverted:** confirmed via `git diff --stat src/main.ts` (no diff) and a clean re-run of `npm run test` (664/664), `npx tsc --noEmit` (clean), and `npm run build` (clean) after the revert.
- **No `world.step()` teleport helper used:** every navigation in this pass used real keyboard-driven bang-bang steering, consistent with `CLAUDE.md`'s documented QA gotcha.
- **`maxTravel` shared-tunable reconciliation (ADR 0020 §4 / ADR 0018 §3 addendum):** live-confirmed — the AC3 evidence above shows `wheelSuspension` reaching exactly the new `0.15` clamp ceiling on tier 0 (the smallest, most at-risk tier per the ADR's own math) without any visible detach/hole artifact, directly validating the reconciled value in the running system, not just by the arithmetic bound.

## Summary table

| AC | Status |
|---|---|
| AC1 (bigger body-to-wheel gap, all tiers) | **Met** — visible daylight gap on all 3 tiers, builder preview + driving scene |
| AC2 (tier-to-tier progression preserved) | **Met** — clear Tier 0 < Tier 1 < Tier 2 ordering, live screenshots + passing regression tests |
| AC3 (suspension travel legible) | **Met** — clean single-corner clamp-ceiling case captured live (`wheelSuspension.rl = 0.15`), visibly distinct from other 3 wheels |
| AC4 (whole-body climb + wheel motion still work) | **Met** — visible nose-up tilt over the bush, smooth motion throughout turn + crossing |
| AC5 (no clipping/disconnect artifacts) | **Met** — no clipping or exposed gap at rest or in motion, including at the AC3 near-clamp moment |
| AC6 (functional stats/hitbox unchanged) | **Met** — confirmed by zero-diff on `src/core/stats/`, `src/core/clearance.ts`, `TRUCK_CONTACT_RADIUS`, `TRUCK_HALF_HEIGHT` |
| AC7 (no chaotic/unstable read) | **Met** — every screenshot reads as a coherent, grounded vehicle; no precision input required |
| AC8 (builder preview matches driving scene) | **Met** — same lifted stance in both, by construction and confirmed live; #67 cropping not reproduced in this pass (observation only, not an AC8 failure) |

## Recommendation

I recommend **for** sign-off on issue #65's AC1-AC8. All eight acceptance criteria are met with direct, live evidence from an independent headless-browser pass (not a re-read of the developer's own screenshots, though those — `docs/qa/screenshots/issue-65-body-lift/` — are consistent with what this pass found). The two riskiest items called out in the ADR (fender-overlap headroom at `BODY_LIFT_FACTOR=0.6`, and the `maxTravel` shared-tunable reconciliation to 0.15) both have concrete, positive live evidence: no fender/tire separation was observed at any point across three tiers and two driving sessions, and the suspension was directly observed reaching its new clamp ceiling without a detach artifact.

One informational note, not a blocker: this pass's builder-preview screenshots did not reproduce issue #67's cropping symptom at the current preview framing — worth a quick look by whoever picks up #67 next, since ADR 0020's own risk section flagged the post-lift body-top increase as a plausible aggravator, but nothing in this pass suggests it's currently manifesting.

Per this project's convention, I am recommending, not approving — final sign-off is the human's call.
