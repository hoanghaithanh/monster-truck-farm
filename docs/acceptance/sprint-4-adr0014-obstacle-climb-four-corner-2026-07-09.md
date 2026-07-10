# Acceptance Report — Obstacle Climb, ADR 0014 Four-Corner Sampling Re-Validation (issue #42)

Date: 2026-07-09
Validator: test-engineer
Scope: re-validation of `docs/requirements/truck-obstacle-climbing.md` (AC1-AC6) against the ADR 0014 rework (commits `6152c50`, `58fa577`), which replaces ADR 0013's single-center-point sampling with four-corner (per-wheel) sampling. This pass exists specifically because the *first* acceptance pass on the ADR 0013 implementation rated the feature "Met" without catching that the rock obstacle visually clipped through the truck's cab — that report and its screenshots were deleted as stale/misleading, and code review on the ADR 0014 fix flagged "no committed evidence this actually fixes the rock" as the one open Major finding this pass exists to close.

## Method

- `npm run test` (Vitest): **442/442 passing**, including the reworked `src/core/driving/obstacle-climb.test.ts` (20 tests covering the new four-corner signature, the front-axle-only nose-up regression guard, the belly-clip guard, tier sensitivity, and roll-math sign convention per ADR 0014's "Test/verification implications" section).
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, then served via `npx vite preview --port 4325`.
- Live-driven via `puppeteer-core` against the real system browser (Edge, non-headless), following this project's established convention: a temporary debug hook (`window.__qaStore` / `window.__qa.telemetry`) was added to `src/main.ts` for the duration of this pass, used to script feedback-steered driving toward each obstacle and to log per-frame `{position, heading, climb, speed}`, then **fully reverted** — confirmed via `git status`/`git diff` showing a clean working tree after the hook and the three temporary driver scripts (`qa-obstacle-climb-adr0014*.mjs`) were removed. Nothing from this pass is left in the working tree except the screenshots and this report.
- Three separate driving sessions were used to cover different tier/obstacle pairings:
  1. Body tier 2 / wheels tier 2 (clearance `large`, `hitCapacity` 5) — rock, bush, derelict-car all `passable`. Primary session for the rock re-check plus bush/derelict-car regression.
  2. Same build, fresh session — repeated bush + derelict-car crossings for a clean, uninterrupted sequence.
  3. Default build (body tier 0 / wheels tier 0, clearance `small`, `hitCapacity` 3) — rock is `blocking` at this tier, used to confirm AC6.
- Screenshots committed under `docs/qa/screenshots/adr0014-obstacle-climb-four-corner-2026-07-09/`.

## AC-by-AC status

### AC1 — visible height/silhouette response
**MET.** Telemetry across all three obstacles shows `lift`/`pitch` rising from `{0,0,0}` on approach, peaking while the truck's footprint overlaps the obstacle, and returning to `{0,0,0}` after clearing it — e.g. rock crossing: `lift` climbed from `0` → `0.524` (peak, at dead-center) → back to `0` over the course of the crossing; derelict-car crossing peaked at `lift: 0.666`. Screenshots `01`–`09` (rock) and `20`–`21` (derelict car) show the obstacle mesh visibly "underneath" the truck during the crossing (wheels straddling it / body riding on top), not a flat unchanged silhouette gliding through.

### AC2 — no false blocking
**MET.** `speed` telemetry stayed at the truck's commanded top speed (6 units/s, later 1.5 while coasting off throttle) throughout every passable crossing — no speed drop, stall, or deflection was observed while `lift`/`pitch` were nonzero. The rock/bush/derelict-car crossings all read as "drove over it," consistent with the existing clearance rule.

### AC3 — no chaotic motion
**MET, with a caveat about the test rig, not the feature.** No flip/spin/launch was observed in any screenshot or telemetry stream; `pitch` stayed within the configured `maxPitch` (0.45 rad) and `roll` stayed at exactly `0` throughout (matches `DEFAULT_CLIMB_CONFIG.maxRoll: 0`). Caveat: my own feedback-steered driver script oscillated and looped several times before lining up with the rock in session 1 (a limitation of my simple bang-bang steering controller reacting to a chasing heading target, not a truck-motion or climb defect) — this produced a messy approach path but the *climb response itself* was never the source of instability; the clean `rock-seq-*` frames (captured driving straight through after the controller had already settled onto the obstacle) are the more reliable evidence and show smooth, monotonic lift/tilt.

### AC4 — still no damage/penalty
**MET, for the climb response itself.** `computeClimbTransform` is confirmed pure (no `store`/hit-capacity access anywhere in `obstacle-climb.ts`) and no hit was lost coincident with any passable crossing in the bush/derelict-car sessions (hearts stayed full throughout). One caveat: in the first (rock) session, one hit was lost partway through the run — cross-checked against the farmer-chase system (a separate, already-shipped mechanic per this project's design, `docs/architecture` / farmer FSM) rather than the obstacle climb; the climb code path has no write access to `GameStore` hit capacity, so this is attributed to the background farmer AI operating concurrently during a multi-minute scripted drive, not this feature. Flagging it for transparency rather than silently omitting it, since a farmer bump landing near an obstacle crossing is exactly the kind of coincidence a less careful pass could misattribute.

### AC5 — works across all three wheel tiers and obstacle classes within a tier's clearance
**MET for the pairings exercised.** Tier 2 (large clearance) against rock/bush/derelict-car all produced visible climb response; tier 0 (small clearance) against the rock correctly produced **no** climb response because the rock is blocking at that tier (see AC6). Not independently re-exercised: tier 1 (medium clearance) and tier 0-vs-bush explicitly, since the unit-test suite's tier-sensitivity test (per ADR 0014's own "Test/verification implications" list) already covers the numeric case for tier 0/1/2 footprints producing different lift/pitch for the same obstacle, and this pass's job was specifically the live-render check the unit suite structurally cannot do (the rock clipping). Recommend a human call on whether tier-1 and tier-0-bush live screenshots are needed before full sign-off, or whether the unit coverage + this pass's tier-0/tier-2 live evidence is sufficient.

### AC6 — blocking obstacles unaffected
**MET.** At tier 0 (clearance `small`), driving the truck at the rock produced a hard stop: position stabilized at `dist ≈ 1.92` from the rock's center for the remainder of the approach (matches `obstacle.radius (1.0) + TRUCK_CONTACT_RADIUS (0.9) = 1.9`, i.e. exactly the Rapier collider's contact surface), speed dropped from 6 to 1.5 (contact/slide behavior), and `climb` stayed `{lift: 0, pitch: 0, roll: 0}` for the entire stall — confirming the rock never entered the `passable` set at this tier and the four-corner sampling change didn't leak any lift into a blocking obstacle. (This session's own drive was later ended by an unrelated farmer catch mid-stall — a hard game-over screen appears in `30-blocking-rock-gameover.png` — which is itself further evidence the truck was genuinely stationary/stuck at the rock rather than idling, since a stalled truck is exactly when the farmer chase mechanic is designed to be able to catch up.)

## The rock crossing — specific, honest evidence (the point of this pass)

This is what motivated ADR 0014, so it gets its own section rather than being folded into AC1.

**What I looked for:** whether the rock's static mesh ever visually overlaps the truck's cab/hood/windshield region during approach → crest → leave, the specific defect the first acceptance pass caught and ADR 0013's retune couldn't fix.

**What I saw, frame by frame** (`docs/qa/screenshots/adr0014-obstacle-climb-four-corner-2026-07-09/`):
- `00-start.png`: flat ground, truck level, no obstacle nearby — baseline.
- `01`–`04` (approach → near-crest → crest → leave, from the noisier first-pass steering controller): the rock is visible low in frame relative to the truck's grille/bumper at every shot; in `03-rock-crest` the rock is almost entirely hidden by the truck's own body from this angle — no rock geometry is visible above the grille line in any of these four frames. No cab/hood/windshield overlap in any of them.
- `05-rock-seq-approach.png` through `09-rock-seq-clear.png` (the clean, controller-settled continuous sequence — the most trustworthy evidence): the rock's peak rises to touch the *bottom edge of the front grille/bumper* at closest approach (`06-rock-seq-crest-contact.png`) and never higher — it does not reach the hood line, headlight line, or windshield in any frame. By `08`/`09` the rock has receded behind and below the truck's silhouette, fully clear.

**Honest read:** across all 9 rock-related screenshots plus the two earlier sessions' rock telemetry, I did not observe the rock mesh cutting through the cab/windshield at any point. The visible contact stays confined to the bumper/grille/undercarriage region, which reads as "climbing over/riding up against" rather than "plowing through" — I consider the specific defect that motivated ADR 0014 fixed, based on this evidence. I'm flagging one honest limitation: my scripted steering couldn't hold a perfectly straight line through the rock's exact centerline on the first pass (see AC3 caveat), so the very peak "wheels-straddling-the-rock-dead-center" frame is better represented by the settled `rock-seq` sequence than by the originally-planned named shots; a human doing a manual keyboard drive-through would get an even cleaner sequence and is a reasonable additional check before final sign-off if any doubt remains.

## Regression checks

- **Bush** (`10-bush-approach.png`, `11-bush-crest.png`): small obstacle, clean crossing, no clipping, consistent with the prior config-only retune — still fixed under the four-corner rework.
- **Derelict car** (`20-derelictcar-crest-1.png`, `21-derelictcar-crest-2.png`): large obstacle, fixed 1.2-unit rendered height regardless of radius — truck visibly rides up onto/over the box mesh in both frames, wheels contacting the top surface, no clipping into the body. Still fixed under the four-corner rework.
- **Driving/farmer/animal/fuel systems**: no interference observed; the farmer chase and hard-game-over mechanic fired independently and correctly during two of the three sessions (expected background behavior, not a regression).
- **Console errors**: only the one pre-existing, previously-disclosed benign favicon 404 (`index.html`/no `public/favicon.ico`, matches the exact pattern noted in `docs/acceptance/sprint-3-wheel-motion-decal-removal-2026-07-09.md`). No new errors, no page errors, across any of the three sessions.
- **Temp QA hook reverted**: confirmed via `git status`/`git diff` on `src/main.ts` — clean, no residual diff. All three temporary driver scripts deleted from the repo root.

## Summary table

| AC | Status |
|---|---|
| AC1 (visible height/silhouette response) | Met |
| AC2 (no false blocking) | Met |
| AC3 (no chaotic motion) | Met (test-rig steering caveat noted, not a feature defect) |
| AC4 (no damage/penalty) | Met (one coincidental farmer-hit noted and attributed away from this feature) |
| AC5 (all tiers/obstacle classes) | Met for tiers 0 and 2 exercised live; tier 1 and tier-0-vs-bush covered only by unit tests, not re-shot live this pass |
| AC6 (blocking unaffected) | Met |
| **Rock-specific clipping (this pass's primary purpose)** | **No clipping observed in any of the 9 rock screenshots or 3 sessions' telemetry — the ADR 0014 fix reads as effective** |

## Recommendation

I recommend this feature (issue #42, ADR 0014 implementation) as **ready for sign-off**, with two items surfaced for the human's judgment rather than silently resolved:
1. Whether live screenshots at tier 1 and tier-0-vs-bush are wanted before closing the loop, given AC5 is only unit-tested (not live-shot) for those specific pairings.
2. The AC3 steering-controller caveat and AC4 farmer-hit coincidence, both attributed away from this feature but worth a human eyeball on the raw screenshots to confirm my read.

Per this project's convention, I am recommending, not approving — final sign-off is the human's call.
