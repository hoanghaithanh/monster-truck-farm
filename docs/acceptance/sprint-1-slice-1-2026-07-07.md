# Acceptance Report — Sprint 1, Slice 1 (Driving/Terrain/Boop)

**Date:** 2026-07-07
**Scope:** Commits `840e404` (developer) + `9c0394e` (test-engineer, 72 tests passing), reviewed with no blockers by code-reviewer (3 minor tech-debt issues filed: #14, #15, #16). Implements GitHub issues **#5, #6, #7, #9, #10, #11**: keyboard driving, wheel-tier obstacle clearance, stub terrain obstacles (bush/rock/derelict car), and animal (chicken-only) spawn/boop/coin-award.

**Explicitly out of scope for this validation pass:** builder UI (#1–4), gas system (#8), farmer/game-over (#12–13). Only AC1–AC9 of `docs/requirements/drive-terrain-and-gas.md` and AC1–AC8 of `docs/requirements/animal-chase-and-coins.md` are assessed.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending acceptance based on the evidence below; I am not approving. Final sign-off is the human's call — see the explicit ask at the end of this report.

---

## How this was validated

Three evidence categories are used throughout, stated explicitly per criterion:

- **(a) Code inspection** — traced the exact logic path in the source.
- **(b) Automated tests** — cited as evidence where a passing unit/integration test exercises the exact behavior (all 72 tests pass: `node node_modules/vitest/vitest.mjs run`, verified fresh in this session).
- **(c) Live/running-system exercise** — the app was actually run and driven, not just inferred from code. Since there's no browser automation set up in this repo and I'm a CLI agent, I installed `puppeteer-core` (dev-only, `--no-save`, not committed — `git status` confirms `package.json`/`package-lock.json` untouched) and drove the app headlessly through the system's actual Edge browser (`msedge.exe`) against the production build served by `vite preview`. This exercised real keyboard events, real Three.js rendering, and real Rapier physics — not a mock. Screenshots were captured and visually reviewed.

Build/typecheck/deploy checks performed:
- `tsc --noEmit`: clean, no errors.
- `vite build`: succeeds, no errors (one non-blocking bundle-size warning, unrelated to correctness).
- `vite preview` served the build: root and `index.html` both return HTTP 200; no failed requests except a harmless `favicon.ico` 404 (cosmetic, not a functional defect — not filed).
- No `pageerror` or `console.error` app-level entries during ~30s of simulated play across three separate browser sessions.
- Live deployed site `https://hoanghaithanh.github.io/monster-truck-farm/` returns HTTP 200, and its served bundle hash (`assets/index-Cvuv6kY_.js`) exactly matches the local build from the current HEAD commit (`9c0394e`) — confirming the deploy is current and not stale.

---

## `drive-terrain-and-gas.md` — AC1–AC9

### Driving

**AC1 — finalized control scheme (Up/W accel, Down/S brake-reverse, Left/A, Right/D steer, keyboard-only).**
- Status: **MET**
- Evidence: (a) `src/input/keyboard-input.ts` maps exactly `ArrowUp/KeyW`, `ArrowDown/KeyS`, `ArrowLeft/KeyA`, `ArrowRight/KeyD` and nothing else. (c) Live session: held `ArrowUp` and observed the truck move and the chase camera track it (screenshot diff before/after driving confirmed pixel changes); held `ArrowDown` in a separate session and observed reverse motion toward the derelict car (see AC6/AC7 below). No touch/gamepad code paths exist anywhere in the input layer.

**AC2 — accelerates/decelerates/turns smoothly, top speed capped at engine-tier value.**
- Status: **MET**
- Evidence: (a) `src/core/driving/truck-motion.ts` `integrateTruckMotion` clamps `speed` to `[reverseTopSpeed, topSpeed]` every frame, where `topSpeed` is threaded in from `DrivingSystem`, which is constructed with `DEFAULT_TRUCK_SPEC.topSpeed` (engine tier 1 → 9 units/s per `tiers.ts`). (b) `truck-motion.test.ts`: "caps forward speed at the truck top speed (engine tier cap, AC2)" passes. (c) Live: sustained forward throttle for multiple seconds without runaway speed or instability (screenshots show gradual, continuous camera-relative movement, consistent with acceleration/cap behavior, not a hard jump).

**AC3 — exactly 4 keyboard inputs, no combos/modifiers/precision timing.**
- Status: **MET**
- Evidence: (a) `keyboard-input.ts` only tracks `e.code` membership in 4 key-sets; throttle/steer are simple additive/clamped scalars from single-key presence — no modifier keys, no key-sequences, no timing windows anywhere in the input or motion code.

**AC4 — soft boundary keeps truck within the playable area, no undefined void, no getting stuck.**
- Status: **MET at the position/logic level; a real (filed) visual defect exists at terrain corners — see below.**
- Evidence: (a) `src/core/driving/boundary.ts` `clampToBounds` clamps x/z independently to `TERRAIN_BOUNDS` every frame in `DrivingSystem.update`. (b) `boundary.test.ts` covers inside-bounds passthrough, clamping past each edge, exact-boundary idempotence, and independent-axis clamping — all pass. (c) **Live exercise found a genuine, previously-undiscovered defect**: driving straight into a single edge (no turning) renders correctly (mostly-grass view, no anomaly). But driving into a **corner** (steer briefly, then hold forward for ~9s) puts the truck's position correctly at the clamped corner, yet the **chase camera** — which is offset a fixed 6 units behind the truck's heading with no bounds-awareness of its own — ends up positioned beyond the ground plane's finite extent, rendering ~80% of the frame as plain background/sky with the truck teetering on a triangular sliver of grass. This visually contradicts AC4's explicit intent ("rather than being able to drive off into an undefined void"), even though the truck's actual (x,z) never leaves bounds. **Filed as GitHub issue [#17](https://github.com/hoanghaithanh/monster-truck-farm/issues/17)** (`from:qa,bug`, milestone "Sprint 1 (2026-07-06 – 2026-07-20)"), low/cosmetic severity — does not affect movement/physics logic (which is correct and tested), but affects the player-facing experience the AC is written to protect, particularly for the target child audience. Also confirmed no "getting stuck": the truck remained responsive to input at the boundary/corner in all sessions.

### Wheel-tier obstacle clearance

**AC5 — stub terrain includes functional bush (small), rock (medium), derelict car (large) instances.**
- Status: **MET**
- Evidence: (a) `src/core/terrain.ts` `STUB_OBSTACLES` defines exactly these three, with correct `sizeClass` values, placed at distinct positions with real collision radii. (c) Live: `src/render/scene.ts` renders distinct meshes per obstacle kind (sphere=bush, icosahedron=rock, box=derelict car) with distinct colors; obstacles are visible in the running scene (confirmed via `createGameScene(app, TERRAIN_BOUNDS, STUB_OBSTACLES)` wiring in `main.ts`, and the render loop runs without error).

**AC6 — Tier 0 (small clearance): passes bush, blocked by rock and derelict car, no damage/penalty.**
- Status: **UNABLE TO VERIFY LIVE this pass (verified by code + tests only)** — the shipped default build (`DEFAULT_TRUCK_SPEC`, standing in for the not-yet-built truck builder) is hardcoded to wheel tier 1, not tier 0. Exercising tier 0 live would require a temporary code edit, which is out of scope for a QA validation pass (no feature/config changes).
- Evidence: (a) `src/core/clearance.ts` `canClear`/`partitionObstacles` implement class-ordering (small < medium < large) correctly, and `main.ts` partitions obstacles once at startup via `partitionObstacles(STUB_OBSTACLES, DEFAULT_TRUCK_SPEC.clearance)`, giving solid colliders only to obstacles above clearance. (b) `clearance.test.ts`: "Tier 0 (small clearance) passes bush (small), blocked by rock (medium) and derelict car (large) — AC6" passes, plus explicit boundary-case tests (exact-tier-match clears, one-tier-short blocks). This is solid evidence at the logic level but is not a live runtime confirmation for tier 0 specifically.
- No damage/penalty: `partitionObstacles`/`canClear` never touch hit capacity or any fail-state concept — confirmed by code inspection (AC9 below covers this directly).

**AC7 — Tier 1 (medium clearance): passes bush/rock, blocked by derelict car.**
- Status: **MET**
- Evidence: (a)+(c) This is the tier the shipped build actually runs (`DEFAULT_TRUCK_BUILD.wheels = 1`, comment confirms "Off-road (medium clearance): passes bush + rock, blocked by the derelict car"). Live session: reversed the default truck straight at the derelict car (positioned at (0,-8), directly behind the truck's start position (0,6) with heading 0, needing no steering) for 5s, then held for 2 more seconds — screenshots taken during and after were byte-identical, indicating the truck's position stopped changing while input was still held, consistent with being blocked by the collider. (b) `clearance.test.ts` "Tier 1 (medium clearance) passes bush and rock, blocked by derelict car — AC7" passes.
- Caveat: the live evidence for "blocked" is inferred from screenshot stability while holding reverse, not a direct readout of the truck's numeric position — reasonably strong but not 100% conclusive (e.g., it's consistent with, but doesn't independently rule out, the truck merely reaching the terrain boundary at the same moment). Combined with the code+test evidence and the fact the car sits well inside the terrain bounds (z=-8 vs. boundary at z=-20), this is assessed as MET with high confidence, not just inferred-from-code.

**AC8 — Tier 2 (large clearance): passes all three obstacles.**
- Status: **UNABLE TO VERIFY LIVE this pass** (same reason as AC6 — default build ships at tier 1, not tier 2; not exercised live without a temporary code change, which is out of scope for QA).
- Evidence: (a)+(b) `clearance.ts`/`clearance.test.ts` "Tier 2 (large clearance) passes all three obstacle classes — AC8" passes, plus the boundary-case tests covering exact-match and one-tier-short.

**AC9 — being blocked never counts as a hit / never triggers a fail state.**
- Status: **MET**
- Evidence: (a) `clearance.ts` and the Rapier `KinematicCharacterController` slide/block resolution in `physics/world.ts` have no reference to hit capacity, body damage, or any fail-state concept — obstacle blocking is purely a movement constraint via `computeColliderMovement`. There is no hit-capacity or game-over system implemented at all yet in this slice (farmer/#12-13 deferred), so there is structurally nothing in the current codebase that could couple obstacle-blocking to a fail state.

### Gas drain and regen (AC10–AC14)
Out of scope for this validation pass per the task brief — gas (#8) is not implemented in this slice. Not assessed.

---

## `animal-chase-and-coins.md` — AC1–AC8

**Disclosed, deliberate scope reduction** (consistent with how code-reviewer already treated it): this slice ships **one species (chicken)** end-to-end and a **max of 1 concurrent animal**, not the full cow/chicken/pig roster or an undetermined concurrency cap. AC3's "cows, chickens, pigs" is treated as **met-for-chicken / deferred-for-others**, not failed — `src/core/spawn/species.ts` documents this as an intentional additive follow-up (append a row + asset, no core logic changes needed).

**AC1 — animal spawns at a random valid location (not in an obstacle/structure, not on the player).**
- Status: **MET**
- Evidence: (a) `src/core/spawn/spawn-position.ts` `pickSpawnPosition` rejects candidates within `minDistanceFromTruck` of the truck and within `radius + obstacleClearance` of any obstacle, retrying up to `maxAttempts`. `src/systems/animal-system.ts` calls this against the live `STUB_OBSTACLES` and current truck position every spawn attempt. (b) `spawn-position.test.ts` covers in-bounds generation, truck-proximity rejection+retry, obstacle-clearance rejection, and a combined "avoids all three stub-terrain obstacles simultaneously" integration-style test. (c) Live: across two ~5s driving sessions, a chicken spawned and was successfully booped in one run (coin count went from 0 to 15 — see AC6 below), confirming the spawn pipeline runs end-to-end in the live app, not just in isolation.

**AC2 — no new spawn while at the max-concurrent cap.**
- Status: **MET**
- Evidence: (a) `src/core/spawn/spawn-timer.ts` `updateSpawnTimer` holds the timer (no spawn, elapsed not advanced) whenever `activeAnimalCount >= maxConcurrent`, and `MAX_CONCURRENT_ANIMALS = 1` in `config.ts`. (b) `spawn-timer.test.ts` explicitly covers "holds the timer (no spawn) once the concurrent cap is reached — AC2" and "resumes counting and spawns promptly once a slot frees up below the cap" — both pass.

**AC3 — species include cows, chickens, pigs with size/speed tiers.**
- Status: **MET for chicken / DEFERRED for cow and pig (disclosed, matches code-reviewer's prior treatment, not a new gap).**
- Evidence: (a) `src/core/spawn/species.ts` — chicken is fully defined (small/fast) with an explicit comment documenting the reduced scope as an intentional slice decision, not an oversight.

### Boop interaction

**AC4 — contact triggers: (a) non-violent scatter reaction, (b) coins awarded, (c) animal removed shortly after, (d) replacement may spawn later.**
- Status: **(b), (c), (d) MET. (a) NOT MET — already known and filed (issue #14, code-reviewer's pass), not a new finding.**
- Evidence: (a)/(b) code inspection of `src/core/boop.ts` `resolveBoop`: awards `computeCoins(...)` and immediately marks `alive: false`; `src/systems/animal-system.ts` calls `store.addCoins(coinsAwarded)` and `callbacks.onRemove(animal.id)` in the same tick — i.e. removal happens instantly, not "shortly after" with any scatter/flee animation. No hop/run-away reaction exists in `scene.ts` (`removeAnimal` just deletes the mesh). This is exactly the gap already tracked as issue #14 ("Boop removes animal instantly with no scatter animation") — confirmed still present, no new issue filed for it. (b) `boop.test.ts` "awards coins per the size/speed formula (AC4b)" passes. (d) `AnimalSystem.update` re-runs the spawn-timer/position pick every frame once a slot frees, confirmed by (b) `spawn-timer.test.ts`'s cap-then-free-slot test. (c) Live: coin count visibly incremented (0 → 15) during a driving session, and the animal was gone afterward (no stale mesh accumulation observed across the session).

**AC5 — booping never reduces hit capacity / never counts as a hit / never contributes to game-over.**
- Status: **MET**
- Evidence: (a) `resolveBoop` and `AnimalSystem.update` only ever call `store.addCoins`; there is no hit-capacity, body-hit, or game-over concept anywhere in the current codebase (farmer/#12-13 deferred, `GameStore` only tracks `coins`). Structurally, booping cannot affect a system that doesn't exist yet in this slice.

**AC6 — coin award visibly communicated at the moment of contact.**
- Status: **MET**
- Evidence: (a) `src/ui/hud.ts` subscribes to `GameStore` and re-renders the coin count (with a coin emoji) on every `addCoins` call, which fires synchronously in `AnimalSystem.update` at the moment contact is detected. (c) Live, directly observed: HUD read "🪙 0" at session start and "🪙 15" after ~9s of driving in one session — a real, in-browser, visible coin-count update, not just inferred from code. 15 coins matches `computeCoins('small', 'fast')` = `5 * 1 * 3 = 15` exactly (chicken's tiers), which also cross-validates the coin formula end-to-end in the running app, not just in unit tests.

### Coin scaling by size/speed

**AC7 — size/speed tiers combine so larger/faster is strictly more coins.**
- Status: **MET**
- Evidence: (a) `src/core/coins/coin-formula.ts` `computeCoins = BASE * SIZE_MULTIPLIER * SPEED_MULTIPLIER`, both multiplier tables strictly increasing. (b) `coin-formula.test.ts` has explicit "is strictly increasing with size tier, all else equal (AC7)" and "...with speed tier..." tests, plus a full 3x3 table of expected values, all passing. (c) Live cross-check: the one live boop observed awarded exactly 15 coins, matching the chicken's small/fast formula value.

**AC8 — formula/table is data-driven, not hardcoded per-species.**
- Status: **MET**
- Evidence: (a) `coin-formula.ts` reads from `SIZE_MULTIPLIER`/`SPEED_MULTIPLIER` lookup tables keyed by tier, not by species — `computeCoins` has no species-specific branching at all, satisfying the "tunable without a code change to the coin logic" requirement.

---

## Summary table

| AC | Criterion | Status |
|---|---|---|
| Drive AC1 | Keyboard control scheme | Met |
| Drive AC2 | Smooth accel/decel/turn, top-speed cap | Met |
| Drive AC3 | 4 inputs, no combos/timing | Met |
| Drive AC4 | Soft boundary, no void | Met (position logic); visual defect at corners filed as #17 |
| Drive AC5 | 3 obstacle instances present | Met |
| Drive AC6 | Tier 0 clearance behavior | Unable to verify live (code+tests only; default build ships at tier 1) |
| Drive AC7 | Tier 1 clearance behavior | Met |
| Drive AC8 | Tier 2 clearance behavior | Unable to verify live (code+tests only; default build ships at tier 1) |
| Drive AC9 | Blocking never a hit/fail-state | Met |
| Animal AC1 | Valid random spawn location | Met |
| Animal AC2 | No spawn at concurrency cap | Met |
| Animal AC3 | Species roster | Met for chicken, deferred cow/pig (disclosed) |
| Animal AC4 | Contact: scatter/coins/removal/respawn | Coins/removal/respawn met; scatter reaction not implemented (known, issue #14) |
| Animal AC5 | Boop never a hit / no game-over coupling | Met |
| Animal AC6 | Coin award visibly communicated | Met (directly observed live) |
| Animal AC7 | Size/speed scaling, strictly increasing | Met |
| Animal AC8 | Data-driven formula | Met |

**New defects found during this pass:** 1 — GitHub issue [#17](https://github.com/hoanghaithanh/monster-truck-farm/issues/17) (chase camera can expose background/void at terrain corners), low/cosmetic severity, milestone "Sprint 1 (2026-07-06 – 2026-07-20)". Not a blocker for this slice's other criteria, but directly touches the AC4 intent and is worth a look before this system is considered fully polished.

**Gaps knowingly left unverified live:** Drive AC6 and AC8 (tier 0 and tier 2 clearance) could only be verified via code inspection and unit tests, not live exercise, because the shipped default build hardcodes wheel tier 1 (the truck builder that would let a human pick tiers doesn't exist yet, #1–4). This is a coverage gap for a human to weigh, not a failure — recommend either a human manually verifying by temporarily editing `DEFAULT_TRUCK_BUILD.wheels` in `src/core/stats/default-truck.ts` and rerunning, or accepting the strong test-level evidence (`clearance.test.ts` covers both tiers directly and symmetrically with tier 1) as sufficient until the builder ships.

---

## Recommendation, not approval

Based on the evidence above, I recommend this slice as substantially meeting its in-scope acceptance criteria, with one new low-severity visual defect filed (#17) and two criteria (AC6, AC8) only verifiable via code/tests rather than live exercise due to the current build's fixed wheel tier. **This is a recommendation only — I am not the approver.** Please review the evidence above (especially issue #17 and the AC6/AC8 gap) and give explicit final sign-off before this slice is considered done per the project's Definition of Done.
