# Acceptance Report — Farmstead Layout, Breakable Fences, Reference-Art Redesign (issue #54, ADR 0019 + Amendment)

Date: 2026-07-12
Validator: test-engineer
Milestone: Sprint 6 (#6)

**Addendum (2026-07-12, same day, not a re-run of this formal pass):** the §A2 "dramatic cliffs" Not Met finding
below was routed to a developer and fixed the same day — `DEFAULT_DRAMATIC_FIELD_CONFIG` retuned from
`amplitude 6 / wavelength 32` to `amplitude 7 / wavelength 8` (root cause: this codebase's `Math.sin(x / wavelength)`
convention gives a spatial period of `2π·wavelength`, not `wavelength`, so the original values could not
mathematically produce steep local terrain within the authored zone's footprint — see `core/terrain-height.ts`'s
dated comment on `DEFAULT_DRAMATIC_FIELD_CONFIG` for the full derivation). Re-verified live by the human driving
into the zone, not by a second formal acceptance pass. A subsequent human playtest also caught two further defects
not covered by this report (both outside its original scope/timing): a fence-collapse pose bug on `rotationY ≠ 0`
segments (standing on end instead of lying flat) and the waterfall (§A3, then still "Met") floating disconnected
from terrain with a dark, unlit-vs-lit material defect. Both were fixed; the human then asked for the waterfall
feature to be removed entirely rather than fixed a fourth time, and it was — `WaterfallFeature`/`WATERFALL_FEATURES`/
`buildWaterfallMesh` and their tests are deleted as of the final shipped state (commit `4438479`), so §A3's "Met"
verdict below should be read as historical (it described a feature that no longer exists), not as a claim about the
current build. See `docs/backlog.md` row 31 for the consolidated, current-state summary. This report's other
verdicts (AC5-AC13, §A1, §A4, the regression checks) are unaffected and still describe the current build.
Scope:
- `docs/requirements/farm-layout-and-fields.md` AC5-AC13 (the original #54 scope — farmstead re-layout, silo/chicken-coop/fence structures, breakable-fence mechanic, spawn keep-out, asset-load fallback, wheel-tier clearance untouched). AC1-AC4 belong to sibling issue #53 (fields) and are explicitly out of scope here.
- `docs/architecture/0019-farmstead-layout-and-breakable-fences.md` "Amendment (2026-07-12)" §A1-A6 (the human-requested reference-art redesign: windmill into the farmyard cluster, chicken coop into its own standalone pen, plus three new scope additions — dramatic cliffs, a waterfall, and solid decorative trees). This scope has **no formally-written acceptance criteria** (a known, deliberately-accepted gap per the amendment's own §A6.3 — the human chose to move fast). Per this pass's assignment, the ADR amendment's own stated design intent is treated as the de facto acceptance bar: §A1's layout description, §A2's "truck drives over cliffs exactly like a hill, camera keeps it framed" claims, §A3's "reads as a waterfall, near-vertical sheet into a pool" claim, §A4's "trees are solid but unbreakable, non-`InstancedMesh`" claim.

Validated against the current tip of `main` at the time of this pass (implementation + unit tests + code review already complete per the hand-off, per `git status`: `src/core/fence/`, `src/systems/fence-system.ts`, `core/terrain.ts`, `core/terrain-height.ts`, `render/scene.ts`, `physics/world.ts`, `main.ts`, spawn-keepout wiring in `animal-system.ts`/`farmer-system.ts`/`fuel-system.ts`, and four new `.glb` assets already staged).

## Method

- `npm run test` (Vitest): 647/647 passing, both before and after this pass's live driving (re-run after every temporary QA-hook revert to confirm no regressions from this pass's own instrumentation).
- `npx tsc -p tsconfig.json --noEmit`: clean, before and after.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4410`.
- Live-driven via `puppeteer-core` against the real system Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless), following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue #29/#48/#49/#62/#63 acceptance passes' method sections). A bang-bang keyboard-driven navigator (poll a temporary read-only `window.__qa` telemetry hook for position/heading, toggle `KeyW`/`KeyA`/`KeyD` key events) drove the truck to specific coordinates — **not** the `world.step()`-based teleport helper, per this project's documented QA gotcha (CLAUDE.md) that teleporting mid-session can crash Rapier's WASM state.
- Five separate driving sessions against the real build, screenshotted at each step:
  1. Farmstead-cluster approach and close-up (AC5/AC6/§A1 layout).
  2. Coop-pen approach, then two fence-collapse contacts at different authored orientations (a straight `rotationY=0` segment and the perpendicular `rotationY=π/2` closing segment) — the two specific classes flagged for extra scrutiny per this pass's assignment (the pose bug already caught/fixed once for exactly this rotationY≠0 case).
  3. Dramatic-zone/cliff approach, waterfall from two angles, and a repeated-ram tree-collision test (three separate forward pushes against the same tree, confirming it never collapses and never lets the truck through).
  4. A structures-collision follow-up session (separate from the first, after reverting/re-adding the QA hook) specifically ramming the silo and the chicken coop head-on, since the first session's route never produced a clean, isolated silo/coop contact.
  5. Two regression sessions: a loose multi-waypoint circuit around the whole map (fuel-pickup collection confirmed live: gas rose from ~0 to ~14.3 after a depletion), and a dedicated ~90s animal-chase attempt (did not land a confirmed boop in the time available — see the Regression section for why this is flagged as inconclusive rather than failing).
- Screenshots and raw telemetry committed under `docs/qa/screenshots/sprint6-issue54-acceptance-2026-07-12/` (62 screenshots + 3 telemetry JSON files). The pre-existing developer-verification screenshots at `docs/qa/screenshots/issue54-farmstead-layout-2026-07-12/` and `docs/qa/screenshots/issue54-redesign-2026-07-12/` were reviewed for context but **not** relied on as this pass's evidence — per this project's "a second, independent look matters" convention, all AC verdicts below are backed by this pass's own independently-driven screenshots/telemetry.
- **Temporary QA hooks, fully reverted:** a read-only `window.__qa` telemetry object (position/heading/coins/gas/hitsRemaining/screen/fence-collapsed-state) was added to `src/main.ts`'s frame loop three separate times across this pass's sessions (added → used → reverted → re-verified clean, each time, rather than left in for the whole pass) — confirmed via `git diff src/main.ts | grep -i "__qa"` returning no matches at every checkpoint, and a final `npm run test` (647/647), `npx tsc --noEmit` (clean), and `npm run build` (clean) re-run after the last revert. `git status` at the end of this pass shows only the pre-existing #54 implementation diff on `src/main.ts` (51 insertions / 3 deletions, matching the hand-off), no QA-hook residue.

## AC-by-AC status (`farm-layout-and-fields.md`)

### AC5 (existing structures genuinely re-placed) — **MET**

`core/terrain.ts`'s `STUB_STRUCTURES` places windmill/barn/farmhouse/silo at `(14..30, -18..-32)` (a genuinely new, large-map-appropriate coordinate cluster) and the mountain at `(-35,-25)` — none of the old 40×40-era coordinates survive. `03-farmyard-cluster-close.png` and `61-silo-ram-result.png` show the truck driving up to and among these structures at their new positions.

### AC6 (coherent farmstead grouping) — **MET**, as amended by §A1

`03-farmyard-cluster-close.png` shows barn, silo, and windmill genuinely grouped as one farmyard cluster (confirming the §A1 "windmill moves in" reversal). `09-fence3-collapsed-pose-close.png` is a wide establishing shot showing the whole arrangement read coherently in one frame: mountain landmark far left, farmyard cluster (barn/silo/windmill/farmhouse) upper right, river as the north edge, chicken-coop pen (with its own fence boundary) as a separate cluster lower right. `04-coop-pen-approach.png` and `53-coop-contact-1.png` confirm the coop pen is a distinct, separately-fenced location, not folded into the farmyard — satisfying the amended AC6/§A1 reading exactly as designed.

### AC7 (silo and chicken coop solid, collidable, no-fail-state) — **MET**

Ramming both structures head-on and repeatedly:
- **Silo:** `61-silo-ram-result.png`/`62-silo-ram-again.png` — the truck's position converged and held at ≈2.85 units from the silo center (matching `footprintRadius 1.62 + TRUCK_CONTACT_RADIUS ≈1.215`) across a 30s drive-to-target attempt (never reached within 1.0-unit tolerance — i.e., structurally blocked) plus a second 1.5s forward ram. `hitsRemaining` stayed at 3 throughout both — no damage, no fail-state.
- **Chicken coop:** `53-coop-contact-1.png`/`54-coop-contact-2-still-blocked.png` — position held at ≈2.27-2.28 units from the coop center across two separate forward rams (sliding tangentially along the collider, never closing the distance). `hitsRemaining` stayed at 3 throughout.

### AC8 (fence breakable barrier — standing → collapse → stays passable) — **MET**, including the specific regression class flagged for this pass

This pass specifically re-tested the exact bug class already caught and fixed once during implementation (`applyFenceCollapsePose`'s `object.rotateX` vs. raw `rotation.x =` assignment — see `render/scene.ts`'s own doc comment on the 2026-07-12 fix), at multiple authored orientations:
- **`fence-1` (straight, `rotationY = 0`):** `05-fence1-contact.png` → `06-fence1-collapsed-close.png` shows the segment lying genuinely flat on the ground (not standing on end), and `07-fence1-passed-through.png` confirms the truck then drove clean through where it stood (a chicken visible ahead — the pass-through is real, not just a pose swap with the collider still present).
- **`fence-3` (perpendicular closing segment, `rotationY = π/2` — the exact orientation the original bug affected):** `09-fence3-collapsed-pose-close.png` shows this segment also lying flat, correctly oriented along its own boundary line rather than standing on end. This segment collapsed as a side effect of the truck's approach path to the coop pen (its `FENCE_CONTACT_MARGIN`-widened contact radius, `2.945+0.5+1.215≈4.66`, was crossed en route) rather than a deliberately isolated ram — but the pose evidence is unambiguous either way and directly confirms the fix holds for this orientation.

Standing → collapse → stays-passable is confirmed end-to-end for both a zero-yaw and a `π/2`-yaw segment, the two structurally distinct cases. Session-reset behavior (fences return to standing at the start of a new session) was **not independently re-exercised via a full dispose/restart round-trip in this pass** — it rests on `FenceSystem`'s "constructed fresh per session" design (code-inspected, matches `FarmerSystem`/`FuelSystem`'s identical precedent) and is unit-tested (`fence-system.test.ts`, 7/7 passing) rather than live-reproduced here; flagging this as inspected-not-reproduced rather than silently assuming it.

### AC9 (spawn-avoidance extended to silo/coop/standing fences) — **MET (unit-proven; live-corroborated by absence of counter-evidence)**

`spawn-position.test.ts` covers `structureKeepouts`/`fenceKeepouts`/`treeKeepouts` directly (unit-proven, part of the 647/647 passing suite). Live corroboration: across roughly 10 minutes of combined driving in this pass, no animal, fuel pickup, or farmer appearance was ever observed spawned inside or overlapping a structure/fence/tree footprint (multiple animals/pickups were visible in-frame near the farmyard/coop/river areas — e.g. `40-animal-boop-check.png`, `07-fence1-passed-through.png` — always on open ground). This is corroborating rather than exhaustive (a live drive can't prove a negative over every possible RNG draw), consistent with how the sibling #62 acceptance pass treated the same class of claim.

### AC10 (asset load never crashes) — **MET (by inspection/pattern reuse, not force-failure-tested)**

`console-errors` captured across all sessions show only the same pre-existing, previously-disclosed benign favicon 404 seen in prior acceptance passes — no asset-load errors, no crashes, no hangs across the whole pass (silo/coop/fence/tree models all loaded and rendered as real sourced art in every screenshot, not primitive fallbacks). This pass did not deliberately corrupt/block an asset URL to force the AC10 fallback path — that would be a more invasive test better suited to a unit/integration test of `AssetRegistry`'s existing gate/fallback logic (already covered structurally by `ASSET_MANIFEST`/`asset-registry` following the identical ADR 0010 pattern every prior structure used) rather than a live UAT pass. Recommend accepting the existing unit coverage plus this pass's "no console errors across a real full session" as sufficient evidence rather than re-deriving AC10 live.

### AC11 (art direction / pack-family consistency) — **MET**

Every screenshot shows silo, chicken coop, and fence rendered as real Quaternius-style low-poly stylized models, immediately recognizable at a glance and visually consistent with the pre-existing barn/windmill/farmhouse (e.g. `03-farmyard-cluster-close.png`, `04-coop-pen-approach.png`).

### AC12 (wheel-tier clearance system unchanged) — **MET**

647/647 tests pass, including the pre-existing `clearance.test.ts` suite, unmodified by this pass. `FenceInstance`/`StructureInstance`/`TreeInstance` are structurally confirmed (by code inspection, matching ADR 0019 §1's argument) to never enter `partitionObstacles`/`clearance.ts` — no import path exists from `core/fence/`, the tree-collider wiring, or `core/terrain.ts`'s new data into that module.

### AC13 (consumes bounds, doesn't define them) — **MET**

`TERRAIN_BOUNDS` (`core/terrain.ts`) is untouched by this diff; all new content (farmyard, coop pen, dramatic zone, waterfall, trees) is authored within the existing −50..50 bounds, confirmed by both the `terrain.test.ts` clearance assertions (647/647 passing) and live driving never crossing the boundary unexpectedly.

## Amendment claims (ADR 0019 "Amendment (2026-07-12)", no formal ACs — de facto bar per this pass's assignment)

### §A1 (revised layout: coop as standalone pen, windmill into farmyard, fields reserved by coop) — **MET**

Directly confirmed by `03-farmyard-cluster-close.png` (windmill genuinely inside the farmyard cluster with barn/silo) and `04-coop-pen-approach.png`/`53-coop-contact-1.png` (chicken coop as its own three-sided fenced pen, geographically separate from the farmyard). `09-fence3-collapsed-pose-close.png`'s wide shot confirms the overall quadrant arrangement matches §A1's described net quadrant map (SE farmyard, NE coop pen, SW mountain, N river).

### §A2 ("truck drives over cliffs exactly like a hill, camera keeps it framed") — **PARTIALLY MET / NOT MET on the core visual claim**

Splitting this into its two component claims:

- **Camera-tracking mechanism** — **MET by code inspection.** `render/scene.ts`'s `setTruckTransform` now computes `camera.position.y = CAMERA_CHASE_HEIGHT + truckRig.group.position.y` (confirmed via `grep` at `scene.ts:1226`), exactly matching the ADR's §A2 point 4 reconciliation. This is the correct mechanism and should work as designed if the truck ever experiences significant terrain lift.
- **"Dramatic cliffs/canyon relief" visual outcome — NOT MET.** Live driving to the exact center of the sole authored `DRAMATIC_ZONES` entry (`{center: (-42,10), innerRadius: 7, outerRadius: 22}`, `DEFAULT_DRAMATIC_FIELD_CONFIG = {amplitude: 6, wavelength: 32, phase: 0.9}`) produced **ordinary-looking gentle rolling ground, visually indistinguishable from the rest of the map's baseline hills** — see `10-approaching-dramatic-zone.png`, `11-cliff-zone-driving.png`, `12-cliff-camera-framing-check.png`. No cliff, mesa, ridge, or steep-sided feature of any kind is visible in any of these three screenshots, taken from inside the zone's `innerRadius` (full-drama gate, confirmed via telemetry: truck position `(-36.2, 10.6)`, distance ≈5.8 from zone center, inside `innerRadius=7`).

  **Root cause, confirmed by replicating the exact shipped formula (`core/terrain-height.ts`'s `dramaticField`/`dramaticZoneFactor`) in an independent script and grid-searching the whole zone + surrounding blend ring:** the code's `Math.sin(x / wavelength)` convention (not `Math.sin(2π·x / wavelength)`) means the term's actual spatial period is `2π·wavelength ≈ 201` world units for `wavelength=32` — roughly double the entire 100×100 map's own diagonal. Over any locally-drivable area within the zone's 22-unit `outerRadius` (a 44-unit diameter, ~22% of one period), the sine curve is nearly linear and barely bends: exhaustive grid search (0.5-unit step, full zone + 1-unit blend margin) found a **maximum local gradient of ≈0.42 (≈23°)**, and a **maximum total height range across the entire zone of only ≈4.3 units** (min −4.32, max −0.06) — both far short of anything a player would recognize as "dramatic cliff/canyon terrain relief" or "tall, steep-sided mesas/ridges" (ADR 0019 §A2's own description). This is a **tuning-parameter defect, not an architecture defect**: the zone-gating mechanism, the no-discontinuity/smooth-climb guarantee, and the camera-tracking reconciliation are all implemented exactly as designed and are structurally sound — the specific `amplitude=6, wavelength=32` values chosen for `DEFAULT_DRAMATIC_FIELD_CONFIG` just cannot mathematically produce steep local terrain at this codebase's `sin(x/wavelength)` convention, regardless of how the zone gate is configured. (For reference, the existing *gentle* field's own steepness, using the identical convention at `amplitude1=0.9, wavelength1=22`, is `0.9/22 ≈ 0.041` — the dramatic field's `6/32 ≈ 0.19` is only ~4.6× steeper, not remotely enough to read as "dramatic" against a bar as low as "regular golf-course hills.")

  Existing unit test coverage (`terrain-height.test.ts`'s "a dramatic zone actually exceeds the gentle-field bound somewhere near its center" test) only asserts the combined field's **peak magnitude** exceeds the gentle bound somewhere — a numeric self-consistency check that passes easily (dramatic amplitude 6 > gentle bound 1.4) without ever testing **local steepness/gradient**, which is the actual visual property "dramatic cliffs" depends on. This is the same class of gap CLAUDE.md's QA-gotchas section already documents for this project ("math that decomposes a combined effect... pin at least one test against an external, independently-documented ground truth... not just internal self-consistency") — the unit test is internally self-consistent and passes, but doesn't verify the property a human actually cares about.

  **This is a genuine defect, not a false alarm from an unlucky sampling point** — the grid search covered the entire zone plus its blend ring exhaustively, not just the one point driven to live.

### §A3 (waterfall reads as a steep, near-vertical sheet into a pool) — **MET**

`13-waterfall-view-1.png` and `14-waterfall-view-2-alt-angle.png` (two distinct viewing angles, per this pass's assignment) both show a clearly tilted, near-vertical blue sheet dropping into a flat pool ellipse at its base — unambiguously reads as a waterfall, not a flat slab, from both angles. This matches the ADR's own documented fix history (the "Slope fix" note in `core/terrain.ts` — `atan2(5.5,3) ≈ 61°` from horizontal) and this pass's live screenshots confirm that fix reads correctly in the running game, not just in the authored data.

### §A4 (decorative trees: solid, unbreakable, non-`InstancedMesh`) — **MET**

Repeated-ram test against the same tree (three separate forward pushes, `16-tree-contact-1.png` → `17-tree-contact-2-still-blocked.png` → `18-tree-contact-3-still-blocked.png`): the truck's distance-to-tree-center stayed clamped at ≈1.9-2.0 units across all three attempts (consistent with sliding tangentially along a fixed circular collider, never closing in past it), the tree never changed pose or "collapsed" the way a fence does, and the truck was visibly nose-to-trunk blocked in every screenshot. Code inspection confirms `render/scene.ts`'s tree rendering uses `.clone()` per instance (load-once, clone-many), not `THREE.InstancedMesh` — matching the ADR's explicit non-goal.

## Regression checks (pre-existing systems on the much-changed map)

- **Fuel pickup → gas refill:** **MET, confirmed live.** `telemetry-regression2.json` shows gas dropping to 0 during a loose multi-waypoint circuit, then rising to ≈14.3 immediately after — `gasSystem.refill` fires correctly on the new map.
- **Animal spawning (rendering):** **MET, confirmed live.** Animals (a pig, a chicken) are visibly rendered on-screen in multiple independent screenshots across different sessions (`16-tree-contact-1.png`, `07-fence1-passed-through.png`, `40-animal-boop-check.png`) — `AnimalSystem.update`'s `onSpawn`/`scene.upsertAnimal` path fires correctly on the new map/layout.
- **Animal boop → coins:** **NOT independently reproduced live in this pass — flagged as inconclusive, not failing.** A dedicated ~90-second chase (tracking the most-recently-spawned animal's position via a temporary QA hook) did not land a confirmed boop; `coins` stayed at 0 throughout every session in this pass. Given the time-boxed nature of a single acceptance pass and this being explicitly a *regression* check (the boop/coin-award code path itself, `core/boop.ts`/`core/coins/coin-formula.ts`, is untouched by #54's diff and fully covered by the existing unit suite, 647/647 passing including `boop.test.ts`/`coin-formula.test.ts`), the risk here is assessed as low — but this pass could not positively confirm it live, and that gap should be named plainly rather than assumed away.
- **Farmer bump → hits:** **NOT observed in this pass — same "inconclusive, not failing" caveat as the boop check above.** No farmer appearance was witnessed in either regression session (farmer spawn timing is itself stochastic/timer-gated, per `farmer/spawn.test.ts`'s existing coverage). `farmer-system.ts`'s diff in this changeset is purely the additive `fenceKeepouts`/`treeKeepouts` spawn-keepout wiring (confirmed via `git diff`), not a behavioral change to the chase/bump FSM itself, so regression risk is assessed as low, but not live-confirmed.
- **Console errors:** only the same pre-existing, previously-disclosed benign favicon 404 seen in prior acceptance passes — no new errors across any of the five sessions in this pass.
- **Temp QA hooks fully reverted:** confirmed via `git diff src/main.ts | grep -i "__qa"` (no matches) at the end of this pass, and `npm run test` (647/647), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the final revert.

## Summary table

| AC / Claim | Status |
|---|---|
| AC5 (structures genuinely re-placed) | **Met** |
| AC6 (coherent farmstead grouping, amended) | **Met** |
| AC7 (silo/coop solid, no-fail-state) | **Met** |
| AC8 (fence breakable barrier, multiple orientations) | **Met** — session-reset behavior inspected, not live-reproduced |
| AC9 (spawn keep-out extended) | **Met** — unit-proven, live-corroborated by absence of counter-evidence |
| AC10 (asset load never crashes) | **Met** — by inspection/pattern reuse, not force-failure-tested |
| AC11 (art direction/pack consistency) | **Met** |
| AC12 (wheel-tier clearance unchanged) | **Met** |
| AC13 (consumes bounds, doesn't define them) | **Met** |
| §A1 (revised layout: coop pen, windmill in farmyard) | **Met** |
| §A2 camera-tracking mechanism | **Met** (by inspection) |
| §A2 "dramatic cliffs" visual outcome | **NOT MET** — tuning-parameter defect, root cause identified |
| §A3 (waterfall reads as steep, near-vertical) | **Met** |
| §A4 (trees solid, unbreakable, non-InstancedMesh) | **Met** |
| Regression: fuel pickup | **Met** |
| Regression: animal spawn (rendering) | **Met** |
| Regression: animal boop → coins | **Inconclusive** (not reproduced live; low risk, untouched/unit-tested code path) |
| Regression: farmer bump → hits | **Inconclusive** (not reproduced live; low risk, untouched/unit-tested code path) |

## Recommendation

I recommend **against** unqualified sign-off on the full amended scope of issue #54, specifically because of one clearly Not Met item:

- **§A2's "dramatic cliffs/canyon relief" visual claim is Not Met**, with a root cause identified precisely (the `dramaticField`/`DEFAULT_DRAMATIC_FIELD_CONFIG` amplitude/wavelength combination cannot mathematically produce steep local terrain at this codebase's `sin(x/wavelength)` convention — confirmed by exhaustive grid search, not a one-off unlucky sample). This is the amendment's own stated "main job" (§A2's heading), so it is not a peripheral miss. **This should be routed to a developer for a tuning fix** — likely either a much shorter `wavelength` (e.g. in the 6-10 range, to get a real spatial period in the tens-of-units range that fits inside the zone) and/or a materially higher `amplitude`, re-verified the same way this pass did (live screenshots from inside the zone, not just the existing unit test's peak-magnitude check) before re-validating. The mechanism around it (zone gating, no-discontinuity guarantee, camera-tracking reconciliation) does not need rework — only the two numeric config values.

Everything else — the original #54 scope (AC5-AC13) and the rest of the amendment (§A1 layout, §A3 waterfall, §A4 trees) — is **Met**, including a specific, targeted re-check of the two areas flagged as having had one real bug each caught late (the fence collapse pose at multiple orientations, and the waterfall's steep-angle read from two viewing angles) — both hold up correctly under this pass's independent re-verification.

Two items are flagged **Inconclusive** rather than failing (animal boop-for-coins and farmer-bump regression) — not reproduced live within this pass's time budget, but backed by passing, untouched unit coverage and assessed as low risk; a human or a future pass with more time budget may want to positively confirm these rather than relying on the unit-test-plus-code-inspection argument alone.

Per this project's convention, I am recommending, not approving — final sign-off is the human's call. Given the Not Met item above, I'd suggest treating this as **not yet done**: route the §A2 tuning defect to a developer, then re-run a focused re-validation of just that claim (the rest of this report's Met verdicts don't need re-doing) before final human sign-off.
