# Acceptance Report — Independent Per-Wheel Suspension (issue #63, ADR 0018 §3-4)

Date: 2026-07-11
Validator: test-engineer
Scope: `docs/requirements/truck-scale-and-suspension.md` AC6-AC12, validated against the current working tree (implementation + unit tests (584/584) + code review already complete and clean per the hand-off). AC1-AC5 (bigger truck/hitbox) are the sibling issue #62, already shipped, closed, and signed off — not re-validated here except as a regression sanity check (item 8 of the assignment).

## Method

- `npm run test` (Vitest): 584/584 passing, unchanged from the hand-off.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4410`.
- Live-driven via `puppeteer-core` against the real system Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless), following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue #29/#48/#49/#62 acceptance passes' method sections).
- A temporary, read-only QA debug hook was added to `src/main.ts` (`window.__qaStore`: direct reference to the live `GameStore`, used only to call `addCoins`/`purchaseTier`/`beginDrive` from the builder screen — real store methods, not a bypass of gameplay rules; `window.__qa`: per-frame telemetry of truck position/heading/speed and the full `ClimbTransform` including `wheelSuspension{fl,fr,rl,rr}`). **The hook was fully reverted before concluding this pass** — confirmed via `git diff --stat src/main.ts` showing no diff, and `npm run test` (584/584), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert.
- Per the hand-off's explicit warning (carried over from the #62 pass's own finding), the `world.step()`-based teleport helper was **not used** at all in this pass — every navigation used real keyboard-driven bang-bang steering (a small proportional controller reading `window.__qa.position/heading` each ~100-150ms and toggling `w`/`a`/`d` key events via `page.keyboard`), consistent with the documented lesson.
- Three driving sessions, each a fresh page load with a fresh build (fresh `GameStore`, avoiding any cross-session state coupling):
  1. **`tier0-bush`** (default build: body tier 0, wheels tier 0 — clearance `small`, only the bush is passable): a flat-ground baseline shot, an asymmetric off-center pass across the bush, and a centered pass across the bush.
  2. **`tier1-rock-bush`** (wheels tier 1 — clearance `medium`, bush + rock passable): a weaving (alternating left/right steer while holding throttle) pass across the bush for AC9, then an asymmetric off-center pass and a centered pass across the rock.
  3. **`tier2-car`** (wheels tier 2 — clearance `large`, all three obstacles passable): an asymmetric off-center pass and a faster centered pass across the derelict car, plus a regression sanity drive near the barn.
- Telemetry (every sampled frame's full `climb` transform) and console errors were logged to JSON per session, committed alongside the screenshots. Several screenshots were post-processed with a crop+2.2x-upscale (via `jimp`, no native deps, consistent with `CLAUDE.md`'s documented Windows workaround) to make wheel-level detail legible at the game's normal chase-camera distance — both the original wide shot and the cropped/zoomed version are committed for cross-reference.
- Screenshots and raw telemetry/console-error logs committed under `docs/qa/screenshots/issue63-suspension-acceptance-2026-07-11/`.

### Method finding: the proportional steering controller's sign convention

An early run of the bang-bang steering helper sent the truck off toward the terrain's edge instead of toward the intended waypoint. Root cause: `truck-motion.ts`'s heading update is `heading -= intent.steer * turnRate * dt` (steer=+1/right decreases heading), and the helper's initial sign convention had this inverted. Fixed by deriving the correct key-to-heading-delta mapping directly from that source comment before re-running. Not a product defect — a QA-tooling bug in this pass's own driving helper, caught before any screenshot was taken from the broken runs (those were discarded, not committed). Noting it here in case a future acceptance pass reuses this session's navigation helper.

## AC-by-AC status

### AC6 (independent per-wheel articulation) — **MET**

Telemetry from the `tier1-rock-bush` asymmetric pass shows a clean, decisive case: at the moment the truck's front axle first entered the rock's influence footprint while the rear axle was still fully clear, `wheelSuspension` read `{fl: 0.250 (clamped), fr: -0.250 (clamped), rl: 0.000, rr: -0.000}` — the front-left wheel visibly distinct from all three others, with the rear axle showing *exactly* zero (not just small) at that instant. `03a-tier1-rock-asymmetric-front-axle-wide.png` / `03b-tier1-rock-asymmetric-front-axle-zoom.png` (the cropped/upscaled version) show this directly: the front-left wheel rides visibly higher than the front-right, which is visibly lower, while both rear wheels sit level with each other.

A complementary, equally clean case appears in the same session's centered rock pass: `04a-tier1-rock-rear-wheel-independent-wide.png` / `04b-...-zoom.png` show the **rear-left** wheel independently dropped well below the other three (`wheelSuspension.rl = -0.250`, clamped) while front-left/front-right/rear-right are comparatively flat — the rear-left wheel visibly separated from the chassis, a second, independent instance of AC6 on a different wheel.

The `tier2-car` derelict-car crossing (`06-tier2-derelictcar-climb-wholebody-tilt.png`) goes further and shows all **four** wheels at genuinely different offsets simultaneously (e.g. `{fl: -0.141, fr: 0.141, rl: -0.115, rr: 0.115}` mid-crossing) — the diagonal-warp degree of freedom the ADR calls out the rigid plane as structurally unable to represent, and which this per-wheel layer exists specifically to add.

AC6 is met with strong, decisive evidence across two tiers and two obstacle classes, not one hand-picked case.

### AC7 (whole-body tilt effect still present, layered not replaced) — **MET**

Every crossing in this pass shows nonzero `lift`/`pitch` at the same moments `wheelSuspension` is nonzero — the two effects are never mutually exclusive. Concretely: `02-tier0-bush-wholebody-tilt-plus-suspension.png` (tier0, `lift=0.206, pitch=-0.120`, `wheelSuspension={fl:-0.187, fr:0.187, rl:-0.115, rr:0.115}`) and `06-tier2-derelictcar-climb-wholebody-tilt.png` (tier2, `lift=1.029→1.053` near the crossing's peak, `pitch` swinging through the full `±0.45` `maxPitch` clamp as the truck's nose rides up and back down over the car) both show the whole rig visibly lifted/pitched **and** individual wheels visibly offset from that tilted plane, in the same frame, in the same screenshot. Neither effect suppresses or substitutes for the other — this is directly observable, not just inferable from the numbers.

### AC8 (works across tiers and obstacle classes) — **MET**

Covered: wheels tier 0 over the bush; wheels tier 1 over the bush *and* the rock; wheels tier 2 over the derelict car. That is 3 of 3 wheel tiers and all 3 of 3 obstacle classes, exceeding the AC's "at least 2 of 3 tiers, at least 2 of 3 obstacles" bar. The suspension response was qualitatively consistent across all of them — a smooth rise/fall bounded by `maxTravel`, no discontinuities, no obstacle/tier combination that failed to show independent articulation.

### AC9 (roll/steer-yaw unaffected by suspension) — **MET**

The `tier1-rock-bush` weave pass (alternating `a`/`d` taps every ~350ms while holding throttle, driven directly through the bush's influence zone) is the dedicated AC9 test: telemetry shows `heading` changing every sample (steering is live) while `wheelSuspension` is simultaneously nonzero and changing (e.g. `{fl: 0.057, fr: -0.057, rl: 0.033, rr: -0.033}` at one weave sample). `05-tier1-bush-steering-plus-suspension-zoom.png` (cropped/upscaled) shows the front wheels visibly yawed to a steer angle distinct from the rear wheels' angle, with no visible wobble, corruption, or frozen wheel — consistent with the ADR's structural argument (translation-only `travelPivot` sitting above `steerPivot`/`rollPivot`, so there is no Euler-order interaction to corrupt). Wheel roll (rotation on axle) was confirmed indirectly across every session by the truck's forward motion tracking correctly frame-to-frame with no skating/sliding artifact in any screenshot. No dropped or corrupted motion was observed on any wheel in any session.

### AC10 (no chaotic motion) — **MET**

Across all three sessions' full telemetry logs (committed), `wheelSuspension` values changed smoothly from sample to sample with no sign-flipping oscillation, no runaway growth, and every value bounded within `±maxTravel (0.25)` by construction (the clamp is visible operating directly — several samples read exactly `0.250` or `-0.250`, the clamp ceiling, never beyond it). No screenshot in this pass shows anything resembling a flip, launch, or destabilized read of the vehicle — the truck always reads as a single coherent, grounded object, even at the moments of maximum per-wheel offset (`04b`/`06` above). No precision timing or input was required to trigger the effect correctly — plain forward driving through an obstacle's footprint was sufficient every time.

### AC11 (no phantom motion on flat ground) — **MET**

`01-flat-ground-no-bounce-tier0.png`, captured at session start before the truck had moved, and its corresponding telemetry sample, show `lift=0, pitch=0, roll=0, wheelSuspension={fl:0, fr:0, rl:0, rr:0}` exactly. All four wheels sit level in the screenshot. This matches the stateless, position-derived design (every corner height is 0 with no obstacle underneath, so every residual is 0 by construction) — confirmed live, not just by code inspection.

### AC12 (no false blocking or damage) — **MET**

Every obstacle crossing in this pass (bush, rock, derelict car, across all 3 wheel tiers where clearance allowed it) completed without the truck stopping, slowing unexpectedly, losing a hit, or triggering any game-over/damage state — the HUD hit-counter (3 hearts, visible in every screenshot) never changed across any session. This carries forward the existing whole-body-tilt AC2/AC4 guarantee unchanged, as the requirements doc specifies, and this pass found nothing to contradict that.

## Item 6 — the diagonally-opposite-wheel question (code reviewer's specific ask)

**Finding: reads as natural suspension cross-linkage in this pass, not as a wheel floating for no reason** — with one caveat on terminology.

The cleanest reproduction is the `tier1-rock-asym` sequence: at the instant the front axle first entered the rock's footprint (`{fl: 0.250, fr: -0.250, rl: 0.000, rr: -0.000}`), the **entire rear axle** read as exactly zero, not just the wheel diagonally opposite the engaged corner. Working through `computeClimbTransform`'s math (`src/core/driving/obstacle-climb.ts`) confirms why: `maxRoll` defaults to `0` (the existing AC10 anti-chaos clamp, unchanged by this feature), so `tanRoll` is always exactly `0`, and `planeHeightAt(zPos, sideSign)` therefore has **no dependence on `sideSign`** — the fitted plane is a function of longitudinal position (`z`) only. This means the residual `wheelSuspension` for the two wheels sharing an axle (e.g. rear-left and rear-right) is mathematically forced to be *equal* whenever their real sampled heights are both zero — the "diagonal saddle" the code reviewer flagged is, more precisely, an **axle-level** artifact (a real obstacle under one front corner can produce a nonzero residual on *both* rear wheels, not distinguished by which one is diagonal), not a phenomenon isolated to the single diagonally-opposite corner. That is a slightly more precise (and slightly more noticeable) version of what the review flagged, not a lesser one.

Whether that axle-level cross-linkage is visually noticeable in practice, this pass's evidence is reassuring: in the clean example above, the far axle read as *exactly* zero (not a small nonzero "floating" value) while it was genuinely clear of the obstacle, and only began showing nonzero values (`04a`/`04b`'s rear-wheel case, and the mid-crossing frames of the same sequence) once the truck's rear axle was itself close enough to the rock that a real height contribution from the obstacle was plausible at that position too — i.e., the effect tracked with genuine spatial proximity in every sample observed, rather than firing as an arbitrary far-field phantom. No screenshot in this pass shows a wheel floating in obvious disconnection from any driving action at all; `04b`'s dropped rear-left wheel, in particular, reads as "this wheel is finding uneven ground" rather than "this wheel is malfunctioning," even at maximum clamp.

My honest read: this is a genuine, structural property of the design exactly as the ADR discloses it, it is bounded (never exceeds `maxTravel`), and in the specific crossings this pass exercised it did not produce a visually jarring or obviously-wrong result. I would not block on it. I'd flag it as a "watch during future playtest with more obstacle geometries" item rather than a defect — a wider/flatter obstacle positioned asymmetrically under one whole axle (something between the rock and the derelict car in footprint) is the shape most likely to make the axle-level linkage read as odd, and wasn't specifically exercised in this pass.

## Item 7 — `maxTravel=0.25`/`travelGain=1.0` magnitude

**My judgment: appropriately proportioned, right at the edge of "confident, not chaotic" — I would not push it higher without also revisiting the diagonal/axle-linkage question above, since a bigger `maxTravel` makes both more visible.**

At the clamp ceiling (`0.25`, reached repeatedly across every session — this is not a rare edge case, it's hit routinely on any real crossing), a wheel does visibly separate from the body, most clearly in `04b-tier1-rock-rear-wheel-independent-zoom.png` where the rear-left tire drops enough that there's daylight between the top of the tire and where the wheel-well/body would normally sit. This matches the developer's own flagged concern verbatim. My live read: at Tier 1 (mid-size wheels) it reads as "aggressive but plausible off-road suspension travel," not as a broken/detached wheel — it's a *large* movement but it stays legible as "this wheel found a dip/bump," especially because it's always paired with a corroborating whole-body lift/pitch that gives the same visual story (AC7's layering helps sell it, not just the isolated wheel offset). I did not observe any crossing where the offset looked accidental or glitchy.

I would not recommend increasing `maxTravel` further — the current value is already producing the most dramatic articulation this pass saw (full clamp, routinely), and headroom above that starts trading "convincing suspension" for "wheel popping off." I also would not recommend lowering it purely on the "looks big" observation alone, since the child-facing "wow, my truck is really flexing over that rock" reaction seems like the intended effect and nothing in this pass reads as unfair, confusing, or frightening for the target player. This is a genuine judgment call, not a mechanical check — the human should look at `04b` and `06` specifically before confirming.

Speed check: the fastest sustained crossing captured (`tier2-car`, ~3.7-3.9 units/s through the derelict car, close to the truck's default-engine top speed) showed the same smooth, bounded behavior as the slow controlled crossings — no instability or discontinuity introduced by speed in the range this pass could reach without also purchasing a higher engine tier (out of this issue's scope; engine tier is an independent axis per AC5).

## Item 8 — regression sanity check (issue #62)

`08-tier2-regression-bigger-truck-near-barn.png`: the Tier-2 truck's bigger silhouette (per #62/`TRUCK_SCALE=1.35`) is visually unchanged from the #62 pass's own screenshots — same proportions, same relative size against the barn, wheels level and undamaged, HUD/hit-counter/coin-count all behaving normally (999830 coins after test purchases, 3/3 hearts, no stray damage). Nothing in this pass suggests the suspension work perturbed #62's shipped hitbox/visual-scale behavior. Not a full re-run of #62's own acceptance pass (not requested, and #62 is separately closed/signed-off) — a spot check only, as scoped.

## Regression / general checks

- **Console errors:** only the same pre-existing, previously-disclosed benign favicon 404 across all three sessions (`console-errors-*.json`) — no new errors introduced by this feature.
- **Temp QA hook fully reverted:** confirmed via `git diff --stat src/main.ts` (no diff) and a clean re-run of `npm run test` (584/584), `npx tsc --noEmit` (clean), and `npm run build` (clean) after the revert.
- **No `world.step()` teleport helper used:** per the hand-off's explicit warning, this pass used only real keyboard-driven navigation throughout, avoiding the Rapier WASM crash documented by the #62 pass.

## Summary table

| AC | Status |
|---|---|
| AC6 (independent per-wheel articulation) | **Met** — two independent clean single-axle cases (front and rear) plus a four-way-distinct derelict-car case |
| AC7 (whole-body tilt still present, layered) | **Met** — both effects visible together in every crossing screenshot |
| AC8 (works across tiers/obstacles) | **Met** — all 3 wheel tiers, all 3 obstacle classes exercised |
| AC9 (roll/steer-yaw unaffected) | **Met** — dedicated weave test shows steering + suspension concurrent, no corruption |
| AC10 (no chaotic motion) | **Met** — bounded by `maxTravel` in every sample, no flips/launches/instability |
| AC11 (no phantom motion on flat ground) | **Met** — exact zero on all four wheels before any driving |
| AC12 (no false blocking/damage) | **Met** — no stops, slowdowns, or hit-loss from any crossing |

## Recommendation

I recommend **for** sign-off on issue #63's AC6-AC12. All seven acceptance criteria are met with direct, live evidence (not just code-inspection inference), and the two open judgment calls the assignment specifically asked for have clear findings:

- **Diagonal/axle-linkage artifact:** genuine and slightly more precisely described as axle-level (not purely diagonal) than the code review flagged, but bounded, tracked with real spatial proximity in every case observed, and did not read as visually broken in this pass. Worth a "watch during future playtest with different obstacle shapes" note, not a blocker.
- **`maxTravel=0.25`/`travelGain=1.0`:** proportionate and visually convincing at the clamp ceiling, which is reached routinely — recommend keeping as shipped. The human should look at `04b-tier1-rock-rear-wheel-independent-zoom.png` and `06-tier2-derelictcar-climb-wholebody-tilt.png` directly before confirming, since this is a genuine taste call.

Per this project's convention, I am recommending, not approving — final sign-off is the human's call.
