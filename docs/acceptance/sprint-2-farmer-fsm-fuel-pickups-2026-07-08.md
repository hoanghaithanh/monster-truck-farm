# Acceptance Report — Sprint 2, Farmer Full Chase-Timer FSM (issue #23) + Fuel Pickups (issue #24)

**Date:** 2026-07-08
**Scope:** `docs/architecture/0007-farmer-full-chase-timer-and-dynamic-speed.md` (FINAL revision, `FARMER_CREEP_FLOOR = 1.0`) and `docs/architecture/0008-fuel-pickups.md`, against the developer's implementation in commit `32c5b24` on `main` (pushed, clean working tree confirmed at session start). Cross-cutting concern in scope: the ADR 0009 (#25) opaque `FarmerRunState` snapshot/seed contract must survive the new TIRED/LEAVING states.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Summary, up front

**No defects found.** The developer's existing 319 tests were reviewed critically (not rubber-stamped); coverage was already substantial, including a genuine reducer-level pin of the exact `phaseElapsed >= FARMER_CHASE_DURATION` boundary and structural/independently-re-derived (not just runtime-assert) tests of the retired-`GAS_LIMP_MIN_SPEED` replacement invariant. I found and closed four genuine gaps (9 new tests, suite now 328/328): exact dynamic-speed values at the `v = 3×FARMER_CREEP_FLOOR` crossover and at both engine-tier top speeds, a bump landing on the exact tick that crosses the CHASE_DURATION boundary (ordering-sensitive, not previously covered), behavioral (not just structural-equality) pause/resume continuity through TIRED and LEAVING, and a real cross-system-independence test for the fuel/animal spawn cap (the developer's existing test for this only checked that two config constants exist, not that the systems don't interfere). All 3 added regression checks (documented below) were verified to actually fail without the corresponding correct code, then reverted. Independent live browser verification (real Edge via Puppeteer, not the developer's own script, not mocked) confirmed all three highest-risk scenarios named in the task: exact full-cycle timing, fuel collection never touching coins/hits while correctly refilling gas, and the #25 pause/resume contract holding while TIRED.

## How this was validated

**(a) Design review** — both ADRs read in full, including the ADR 0007 Revision note (`FARMER_CREEP_FLOOR` raised from 0.4 to 1.0) and its re-derived fairness checks (A: `1.0 < limpTopSpeed(lowestTier)=1.5`; B: `1.0 × 10 ≥ 8`, the deliberately-inverted reachability invariant).

**(b) Code review** — `src/core/farmer/{farmer,config}.ts`, `src/systems/farmer-system.ts`, `src/core/gas/{gas,config}.ts`, `src/core/fuel/*`, `src/systems/fuel-system.ts`, `src/main.ts`'s wiring.

**(c) Critical review of the developer's existing tests, then genuine gaps closed:**

1. **Farmer FSM full cycle + exact boundaries** (`src/core/farmer/farmer.test.ts`): already pins `phaseElapsed >= FARMER_CHASE_DURATION` exactly (`FARMER_CHASE_DURATION - 0.5` + `dt=1` transitions; `FARMER_CHASE_DURATION - 2` + `dt=1` does not), and a full `ABSENT → PURSUING → TIRED → LEAVING → ABSENT` walk with configured durations. Verdict: solid at the reducer level. **Gap found and closed:** `src/systems/farmer-system.test.ts` did not cover a bump landing on the *exact same tick* the reducer crosses the CHASE_DURATION boundary — `FarmerSystem.update()` does the contact/bump check *before* calling `farmerReduce`'s TICK, so this ordering is load-bearing (a bump on the boundary tick must still register even though the state flips to TIRED "at the same time"). Added `registers a bump on the exact tick that crosses the CHASE_DURATION boundary...` — verified it fails (bump silently dropped) if the ordering is reversed (see Regression checks below).
2. **Dynamic speed formula** (`farmerSpeed = max(|v|/3, FARMER_CREEP_FLOOR)`): the existing `farmer-system.test.ts` tests only checked *relative* ordering (fast truck > stopped truck) and the pure creep-floor case (`v=0`). **Gap found and closed:** added exact-displacement assertions at `v ∈ {0, 2, 3, 6, 12}`, including the literal crossover point `v=3` (where `v/3` first equals the floor) and both named engine-tier top speeds (Standard=6 → speed 2.0, Turbo=12 → speed 4.0, the latter pinning ADR 0007's explicit "continuous with Sprint 1's `FARMER_SPEED=4`" claim, which was previously asserted only in the ADR prose, not in a test).
3. **Retired `GAS_LIMP_MIN_SPEED` replacement invariant**: already well covered — `spawn.test.ts` independently re-derives `FARMER_CREEP_FLOOR < limpTopSpeed(tier)` from the real `ENGINE_TIERS`/`GAS_LIMP_FACTOR` tables (not just re-checking the load-time `throw` in `config.ts`), plus a structural `farmerSpeed(v) < v` test and a pinned Check-B reachability test. No gap found here — this is genuine coverage, not a tautology, since it independently recomputes the invariant rather than trusting the constant.
4. **Fuel spawn cap independence from animals (AC3)**: **Gap found and closed.** The developer's test (`fuel-system.test.ts`, `'has its own cap, independent of MAX_CONCURRENT_ANIMALS'`) only asserted `MAX_CONCURRENT_FUEL` and `MAX_CONCURRENT_ANIMALS` are both defined — it would not catch a bug where `FuelSystem` accidentally imported the animal cap or shared a timer instance. Added a behavioral test that saturates a real `AnimalSystem` at its own cap and then drives a real `FuelSystem` to its own (independently larger) cap in the same test, asserting fuel spawning is unaffected. Verified it fails (catches exactly 1 fuel spawn instead of 2) when `FuelSystem` is patched to import `MAX_CONCURRENT_ANIMALS` instead of its own constant (see Regression checks below).
5. **The #25 cross-feature contract (highest-value gap per the task brief)**: the developer's existing snapshot/seed tests for TIRED and LEAVING (`farmer-system.test.ts`) assert *structural* equality (`restored.snapshot()` `toEqual`s the seed) — genuinely substantive since the whole-blob seed shape makes a missed field fail the equality, but they don't prove a *resumed* farmer subsequently *behaves* identically to one that was never paused. **Gap found and closed:** added two behavioral tests — one drives a control `FarmerSystem` straight through `TIRED → LEAVING → ABSENT` and compares final state against a second instance that is snapshotted mid-TIRED, torn down, and reconstructed from that seed (mirroring `main.ts`'s pause/resume plumbing exactly), asserting both reach `ABSENT` at the same total elapsed time; the second confirms a paused-and-resumed LEAVING farmer continues retreating from its exact paused position rather than resetting.

**(d) New tests added this pass** (`src/systems/farmer-system.test.ts` +7, `src/systems/fuel-system.test.ts` +1 behavioral replacing/supplementing the trivial one +the trivial one kept): total suite **319 → 328**, all passing. Ran `npx vitest run` before and after — no regressions.

**(e) Regression spot-checks** (3, all confirmed to fail without the fix, then reverted — production files verified byte-identical afterward via `git diff --stat`):
1. Swapped `Math.max` → `Math.min` in the dynamic-speed formula (`farmer-system.ts`) → **5 of the new exact-speed tests failed** (e.g. expected farmer at `x=-98` for `v=6`, got `x=-99`).
2. Reordered `FarmerSystem.update()`'s PURSUING branch so `farmerReduce`'s TICK runs *before* the contact/bump check (simulating an "obviously equivalent" reordering bug) → **the new boundary-bump test failed** (`bumpCount` 0 instead of 1) — confirms the ordering really is load-bearing, not incidental.
3. Patched `fuel-system.ts` to import `MAX_CONCURRENT_ANIMALS` in place of `MAX_CONCURRENT_FUEL` → **both the new behavioral independence test and the original cap test failed** (1 fuel spawn instead of 2).

**(f) Independent live acceptance validation** — own script, not the developer's, run against the real running system via `vite build && vite preview` (port 4191) driven by `puppeteer-core` against real Edge (`msedge.exe`), real DOM/GameStore/three.js/Rapier, real keyboard input — not mocked. A temporary debug hook (`window.__qa`) was added to `src/main.ts` for this pass only, disclosed here per this project's established convention (see the prior Sprint 2 pause-to-builder report for precedent), and fully reverted before this report was written — confirmed via `git diff --stat src/main.ts` (empty) and a fresh `vite build` producing the **byte-identical bundle hash** (`index-BrOuLCq8.js`) as the very first pre-hook build.

---

## Independent live verification results (all 3 task-specified scenarios)

**(a) Full farmer cycle timing, own script.** Polled `farmerSnapshot()` at 50ms resolution through a natural spawn → chase → tired → leave → despawn cycle (truck stationary and far away, to isolate timer behavior from creep/contact noise):

```
appearedAt=6.80s  tiredAt=16.80s  leavingAt=18.30s  absentAgainAt=21.30s
tiredAt - appearedAt   = 10.00s  (== FARMER_CHASE_DURATION, exact)
leavingAt - tiredAt    =  1.50s  (== FARMER_TIRED_DURATION, exact)
absentAgainAt-leavingAt=  3.00s  (== FARMER_LEAVE_DURATION, exact)
```
All three phase durations land exactly on the configured constants in a real browser frame loop (not just the deterministic `dt`-stepped unit tests) — confirms no drift or off-by-one from real `requestAnimationFrame` timing.

**(b) Fuel pickup collection never touches coins/hits, correctly refills gas.** Drained the tank via real sustained throttle (20 → ~15), then steered live toward the nearest spawned pickup using a proper heading-aware controller (heading convention cross-checked against `core/driving/truck-motion.ts`: `0 = +Z`, steer=+1/right decreases heading). Result:
```
before: coins=0 hits=3 gas=20
after drain: gas≈14.99
after fuel hunt: coins=0 hits=3 gas≈19.36
gasIncreasedFromDrainedLevel: true   coinsUnchangedByFuel: true   hitsUnchanged: true
```
Gas rose from the drained level despite continuous throttle drain during the chase, consistent with a `FUEL_REFILL_AMOUNT=15` collection (clamped toward the 20 capacity) partially redrained afterward — coins and hits both held exactly constant across the whole run. No page errors.

**(c) Pause during TIRED, resume via real UI clicks (the #25 contract, live).** Waited for the farmer to reach TIRED naturally (t≈22.8s), clicked the real pause ("Shop") button, confirmed `screen → BUILDER`, then clicked the real "Resume" button:
```
pre-pause snapshot:  kind=TIRED phaseElapsed=0.028
post-resume snapshot: kind=TIRED phaseElapsed=0.324  screen=DRIVING
```
State correctly held at TIRED (not reset to ABSENT/PURSUING) with `phaseElapsed` continuing forward, not reset to 0 — matches the unit-level behavioral tests added in (c)/(d) above, now confirmed against the real dispose/recreate session-teardown path in `main.ts`, not just the isolated `FarmerSystem` class. No page errors in any of the three runs (one benign 404 for a missing favicon-class resource, unrelated and pre-existing).

---

## Summary table

| Item | Status |
|---|---|
| Farmer FSM full cycle, exact phase-boundary timing | **Met — code+tests+independent live (exact timing confirmed in real browser)** |
| Dynamic speed formula, incl. `v=3` crossover and tier top speeds | **Met — new exact-value tests added, verified to catch a `max`→`min` regression** |
| Bump landing exactly on the CHASE_DURATION boundary tick | **Met — new test added, verified to catch an ordering regression** |
| Retired `GAS_LIMP_MIN_SPEED` replacement invariant | Met — already substantive (independently re-derived, not a load-time-only assert) |
| Fuel spawn cap independence from animals (AC3) | **Met — new behavioral test added (developer's original was too weak: constants-exist-only), verified to catch a shared-cap regression** |
| Fuel refill clamping / never touches coins-hits / instant collection | Met (code+tests+independent live) |
| #25 contract: pause/resume during TIRED/LEAVING | **Met — new behavioral (not just structural) unit tests added, plus independent live re-verification through the real dispose/recreate path** |

**No defects found. No GitHub issues filed.**

---

## Recommendation, not approval

The farmer full chase-timer FSM (#23) and fuel pickups (#24) are **soundly implemented**, with pre-existing coverage that was already substantive in most areas (the reducer-level boundary tests and the independently-re-derived fairness invariant in particular reflect real rigor from the developer). I closed five genuine gaps this pass — the boundary-tick bump ordering, exact dynamic-speed values including the formula's crossover point, a real behavioral test for the fuel/animal cap independence (replacing a test that only checked two constants existed), and behavioral (not just structural-equality) pause/resume continuity for the #25 contract, which was the highest-risk item named in the task given it was previously verified only by the developer's live smoke test. All three regression spot-checks confirmed the new tests actually catch the bugs they're meant to catch. Independent live verification (own script, real browser, real Edge, all three specified scenarios) found no discrepancies from the unit-level picture.

**This is a recommendation only — I am not the approver.** I'd recommend this feature is ready to proceed to code review. Please review the evidence above — particularly the exact-timing and pause/resume-during-TIRED live results, given the #25 cross-feature risk flagged in the task — before giving final sign-off.

**This is a recommendation only — I am not the approver.**
