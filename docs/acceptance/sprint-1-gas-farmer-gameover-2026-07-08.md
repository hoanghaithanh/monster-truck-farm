# Acceptance Report — Sprint 1, Gas + Farmer + Hard Game-Over (issues #8, #12, #13)

**Date:** 2026-07-08
**Scope:** `docs/requirements/farmer-minimal-bump.md` (AC1-AC7) and `docs/requirements/drive-terrain-and-gas.md` (AC10-AC14). Commits validated: `f135931` (developer, gas + farmer + hard game-over), `3a93d4a` (test-engineer, 161 unit tests), `d79a6a1` (developer, ADR-0005 fix for issue #20's cross-system fairness bug found by code-reviewer). HEAD at validation time: `d79a6a1`. **163 tests total, all passing** (`npx vitest run`, verified fresh this session).

**This is the last pending story of Sprint 1's original 13.** See the Sprint 1 status note at the end of this report.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Headline finding, up front

While attempting the live sustained-play checks this task specifically called for (draining a tank to empty and evading the farmer in limp mode; letting the farmer bump the truck to a hard game over), I hit a **severe, previously-undiscovered defect**: every driving session I ran crashed with an uncaught JS exception from the Rapier physics WASM module, freezing the entire game (rendering, gas, farmer, hits, HUD all stop updating with no recovery), typically somewhere between under 1 second and ~35 seconds after the drive session starts — **regardless of player input**, including a repro with the truck sitting completely still. Filed as **[issue #21](https://github.com/hoanghaithanh/monster-truck-farm/issues/21)** (`from:qa,bug`, Sprint 1 milestone), Blocker severity. Full detail, repro steps, and root-cause hypothesis are in the issue; the short version is below in "How this was validated."

**This defect is the dominant fact of this validation pass.** It directly blocked live confirmation of the #20 fairness re-check and the game-over/restart round trip — the two things the task asked me to prioritize live over trusting the unit tests. I made 4 additional back-to-back attempts at the game-over/restart flow specifically (a fresh browser session each time); **all 4 crashed within 1 second of the drive session starting, before the farmer could even spawn.** I am not able to give the same quality of live evidence this pass that the prior two acceptance passes gave for driving/builder — this is disclosed plainly per criterion below, not glossed over.

---

## How this was validated

- **(a) Code inspection** — traced the exact logic path in `src/core/gas/`, `src/core/farmer/`, `src/core/game-state.ts`, `src/ui/hud.ts`, `src/ui/game-over.ts`, `src/main.ts`, and `docs/architecture/0005-farmer-limp-fairness-reconciliation.md`.
- **(b) Automated tests** — `npx vitest run` → **163/163 passing** (16 files), verified fresh this session. `npx tsc --noEmit` clean. `npx vite build` succeeds (one pre-existing non-blocking bundle-size warning). Of particular note: `src/core/farmer/spawn.test.ts`'s `"FARMER_SPEED vs gas limp mode fairness invariant (ADR 0005, fixes issue #20)"` block re-derives `FARMER_SPEED < limpTopSpeed(tier.topSpeed)` for every real `ENGINE_TIERS` entry from the actual production config — this is exactly the regression guard that would have caught #20 and is the strongest evidence available for the fairness fix holding, given the live-testing limitation below.
- **(c) Live/running-system exercise** — same approach as the prior two passes: `vite preview` serving the production build on `localhost:4173`, driven headlessly via `puppeteer-core` against the system's real Edge (`msedge.exe`), real keyboard events, real DOM/three.js/Rapier — not mocked. **Severely constrained this pass by issue #21** (see below). Scripts were scratch-only (not committed, matching prior passes' convention — `git status` confirms no changes to `package.json`/`package-lock.json`, and the scripts themselves were moved out of the repo to the session scratch directory before writing this report).
- Live deployed site `https://hoanghaithanh.github.io/monster-truck-farm/` serves `assets/index-C4ObdvOx.js`, an exact hash match with the local build from current HEAD (`d79a6a1`) — deploy confirmed current.

**Issue #21 in brief** (full write-up in the GitHub issue): sustained driving reliably crashes with `RangeError: Maximum call stack size exceeded` immediately followed by a `rapier3d-compat`/wasm-bindgen panic (`"recursive use of an object detected which would lead to unsafe aliasing in rust"`). Reproduced 8+ times across independent sessions. Confirmed via a zero-input repro (truck never touches a key, still crashes) that it's tied to the driving session's per-frame physics loop specifically, not general page load — 40s idle on the **builder** screen (before confirming, no physics stepping happening) produced zero errors. Timing varied run-to-run (sub-1s to ~35s), consistent with a frame-count-based threshold rather than a fixed timer. Prime suspect: `src/physics/world.ts`'s `TruckController` calling `world.step()` every rendered frame indefinitely against a `KinematicCharacterController`; cross-referenced against the already-filed, previously-"harmless" tech-debt issue #16 (double `world.step()` on boundary-clamp frames), though the zero-input repro shows the crash isn't limited to boundary contact.

---

## `farmer-minimal-bump.md` — AC1–AC7

**AC1 (farmer appears via a random trigger).**
- Status: **MET (code + tests); unable to confirm live this pass.**
- Evidence: (a) `src/systems/farmer-system.ts` `FarmerSystem.update` picks a spawn delay via `pickSpawnDelay(FARMER_SPAWN_MIN_SECONDS=6, FARMER_SPAWN_MAX_SECONDS=12, rng)` and transitions `ABSENT -> PURSUING` once elapsed time crosses it, calling `onAppear`. (b) `src/core/farmer/spawn.test.ts` covers the delay range and position-picking logic. (c) **Not exercised live this pass**: every one of my live sessions crashed at or before the ~1-35s mark, and the farmer's own spawn window (6-12s) sits inside that same crash-risk zone — in the 8+ live sessions I ran, none survived long enough for me to positively confirm a farmer mesh actually appeared on screen (an earlier acceptance pass never covered this either, since farmer/#12-13 didn't exist yet). This is a genuine live-evidence gap, directly caused by issue #21.

**AC2 (farmer chases toward the player's current position).**
- Status: **MET (code + tests); unable to confirm live this pass** — same reason as AC1.
- Evidence: (a) `src/core/farmer/pursue.ts` `stepTowards` moves the farmer's position toward the truck's current position at `FARMER_SPEED` each tick; wired in `farmer-system.ts`'s `PURSUING` branch, called every frame with the truck's live position. (b) `src/core/farmer/pursue.test.ts` (6 tests) covers direction, speed, and arrival/overshoot clamping.

**AC3 (bump drains exactly one hit).**
- Status: **MET (code + tests); unable to confirm live this pass.**
- Evidence: (a) `farmer-system.ts` calls `isFarmerContact(...)` each frame and, on contact outside the invuln window, calls `store.bump()`. `GameStore.bump()` (`src/core/game-state.ts`) decrements `_hitsRemaining` by exactly 1 and calls `gameOver()` if it reaches 0. (b) `src/core/farmer/contact.test.ts` (5 tests, contact-radius geometry) and `src/core/game-state.test.ts` (bump-specific cases within its 42 tests) cover this directly, including "drains exactly one hit per bump, not more."

**AC4 (hit count visible via icon row, not numbers).**
- Status: **MET — this pass includes the first live visual confirmation of both the gas gauge and hit-icon HUD elements**, closing the gap the prior acceptance pass explicitly flagged as "needing a human/live check."
- Evidence: (a) `src/ui/hud.ts` renders a heart-icon row (`'❤️'.repeat(store.hitsRemaining) + '\u{1F5A4}'.repeat(spec.hitCapacity - store.hitsRemaining)`) and a gas-fill bar, both toggled visible only on the `DRIVING` screen with a resolved spec. (c) **Live, directly observed across every session that reached `DRIVING` before crashing** (which is all of them — the crash happens after entering the driving screen, not before): the HUD's hit row rendered literally `"❤️❤️❤️"` for the default/Tier-0 body build (3 hits, matching `BODY_TIERS[0].hitCapacity`), and the gas bar rendered at `100%` width immediately on session start, both as real DOM state read from the live running app, not inferred from code. This is genuine live confirmation that both HUD elements are visible and correctly reflect the resolved `TruckSpec` the instant a run begins.
- Caveat: I could not observe the hit row visually update **after** a real bump (dimming a heart to 🗤 mid-run) because no live session survived long enough to see the farmer make contact — the static/initial-render confirmation above is real live evidence, but the dynamic "updates on a real bump" half of this AC is still code+test only (`game-state.test.ts` covers the underlying state transition; the HUD's `store.subscribe(render)` wiring is unchanged, untested-live plumbing).

**AC5 (farmer bump is visually/mechanically distinct from an animal boop; impact feedback, not violent).**
- Status: **MET at the code level; unable to confirm live this pass.**
- Evidence: (a) `src/render/scene.ts` `flashTruck()`/`tickEffects()` implement a brief red-to-base color lerp on the truck mesh (`BUMP_FLASH_SECONDS = 0.3`, `TRUCK_FLASH_COLOR = 0xff3b3b` fading back to `TRUCK_BASE_COLOR`) — mechanically and visually distinct from the animal-boop path (`resolveBoop`/coin award, no truck-color change at all). No blood/gore/violence framing in the implementation — a plain color flash. (c) Not observed live; no session survived to a real farmer contact.

**AC6 (hard game over: run ends, returns to builder, coins reset to 0, fresh run from part selection).**
- Status: **MET at the code/unit level; live round-trip attempted 4 times this pass, all blocked by issue #21 before the farmer could even spawn.**
- Evidence: (a) `GameStore.bump()` calls `gameOver()` exactly when `_hitsRemaining` hits 0, transitioning `DRIVING -> GAME_OVER` via `nextScreen`. `GameStore.restart()` resets `_coins = 0` and transitions `GAME_OVER -> BUILDER`, without touching `_build` (prior selection preserved, matching the requirement's "no other builder state ... required to persist"). `main.ts`'s module-level `store.subscribe` disposes the driving session's `rAF` loop/scene/physics bodies on the `DRIVING -> GAME_OVER` transition and creates a fresh one on the next `BUILDER -> DRIVING` (the issue #18 lifecycle fix). (b) `game-state.test.ts` covers `bump()` reaching 0 and calling `gameOver()`, `restart()`'s coin-reset + build-preservation + screen transition, and (per the prior acceptance pass) the exact lifecycle-guard round trip `main.ts` uses, asserting a `DRIVING -> GAME_OVER -> BUILDER -> DRIVING` sequence starts exactly 2 sessions and disposes exactly 1.
- **Live attempt, this pass**: I deliberately sat the truck still (no throttle) so the farmer, once spawned, could walk straight up and bump repeatedly toward 0 hits, across 5 total attempts (1 exploratory + 4 scripted retries). **All 5 crashed (issue #21) within 1-2 seconds of the drive session starting — every single time before the farmer's earliest possible spawn window (6s) was even reached.** I was not able to observe the game-over overlay appear, the restart click, the return to the builder, the coin reset, or the fresh session actually restarting through the real running app this pass. This is the exact live round trip the task asked me to prioritize ("nothing has fully live-tested that round trip until now") and I could not deliver it — issue #21 is the reason, not a gap in test design.
- This is assessed as **MET on unit-level evidence** (which is legitimate and was already the accepted standard for this exact criterion in the prior acceptance pass, before #12/#13 existed at all) but the live confirmation this task specifically asked for did not happen. Flagged prominently for a human to weigh.

**AC7 (kid-appropriate tone on game over).**
- Status: **MET.**
- Evidence: (a) `src/ui/game-over.ts` — title `"🚜 Oops! Let's build a new truck!"`, subtitle `"The farmer caught up with you. Time to try again!"`, a friendly yellow "Build a new truck!" button. No scary/violent framing, no harsh sound (none implemented), no punishing language — matches the requirement's example framing almost verbatim. This is a pure content/copy check, fully assessable from source without needing a live session.

---

## `drive-terrain-and-gas.md` — AC10–AC14

**AC10 (gas drains at a constant rate while driving, empties after the tier's duration).**
- Status: **MET (code + tests); could not be confirmed live this pass.**
- Evidence: (a) `src/core/gas/gas.ts` `updateGas`: `remaining -= GAS_DRAIN_PER_SECOND * dt` whenever `throttleOn`, clamped to `[0, capacity]`. `GAS_DRAIN_PER_SECOND = 1` (`src/core/gas/config.ts`), so a Small tank (`GAS_TIERS[0].capacity = 20`) empties after exactly 20s of continuous throttle, matching the builder's own "20s of drive" label. (b) `src/core/gas/gas.test.ts` (15 tests) covers linear drain, clamping at 0, and the drain-vs-idle branch selection directly. (c) **Not confirmed live**: I selected Engine Tier 0 + Gas Tier 0 (the narrowest ADR-0005 margin, see below) and held forward, intending to watch the HUD gas bar visibly shrink over ~20s; every attempt crashed (issue #21) before or within the first couple of seconds of throttle, so the HUD gas value was observed stuck at its initial `100%` in every recorded sample. I cannot distinguish live between "drain isn't visibly happening" and "the frame loop died before enough time passed to show a visible change" — but given the crash's own console errors were present in every one of these sessions, the most likely explanation is the latter, not a drain-logic defect (which the 15 passing unit tests directly rule out at the logic level).

**AC11 (empty tank -> capped "limp" top speed, never a hard stop).**
- Status: **MET (code + tests, including the ADR-0005 fairness re-check); not confirmed live this pass for the same reason as AC10.**
- Evidence: (a) `effectiveTopSpeed(topSpeed, remaining)` returns `limpTopSpeed(topSpeed)` whenever `remaining <= 0`, never 0 — structurally cannot hard-stop. `limpTopSpeed` is `Math.max(topSpeed * GAS_LIMP_FACTOR, GAS_LIMP_MIN_SPEED)` per ADR 0005. (b) `gas.test.ts` covers the empty-tank branch and the `GAS_LIMP_MIN_SPEED` floor for every current engine tier explicitly.

**AC12 (idle regen).**
- Status: **MET (code + tests); not confirmed live this pass** (same blocker).
- Evidence: (a) `updateGas`'s `movingIdle` branch regens at `GAS_REGEN_PER_SECOND = 2` (double the drain rate) up to `capacity`. (b) `gas.test.ts` covers regen accumulation and the full-capacity clamp.

**AC13 (full top speed restored immediately once gas > 0, no full-tank requirement).**
- Status: **MET (code + tests).**
- Evidence: (a) `effectiveTopSpeed` is a pure function of the current `remaining` value with no separate "in limp mode" state to exit — the instant `remaining > 0`, the very next frame's `effectiveTopSpeed` call returns the full `topSpeed`, by construction. (b) `gas.test.ts`'s "instant recovery" tests cover this directly.

**AC14 (no UI-visible game-over/blocking failure state in the gas system).**
- Status: **MET.**
- Evidence: (a) Grepped confirmed no gas-related code path anywhere calls `GameStore.gameOver()` or references hit capacity — `gameOver()` is only ever called from `GameStore.bump()` (the farmer path). The gas system's only visible effect is the HUD gas bar's width and (via `effectiveTopSpeed`) the truck's speed cap — no overlay, no blocking state.

### The #20 fairness fix — live re-verification (the task's top priority)

- Status: **UNABLE TO VERIFY LIVE this pass — issue #21 blocked every attempt before a meaningful limp-mode/farmer-pursuit window could be observed.** Strong (but not live) evidence otherwise.
- What I attempted: selected Engine Tier 0 (Standard, `topSpeed = 6`) + Gas Tier 0 (Small tank, `capacity = 20`) — the exact configuration ADR 0005 itself identifies as the narrowest margin (`limpTopSpeed(6) = 5`, `FARMER_SPEED = 4`, an 83%-of-full-speed limp with only a 25% margin over the farmer). Held forward continuously with periodic steering pulses (to stay off the terrain boundary) for up to 88 seconds in the first attempt, intending to drain the tank fully and then observe an extended limp-mode pursuit window with the farmer definitely engaged. **Every attempt hit issue #21's crash before I could get a trustworthy read on sustained limp-mode behavior** — in the recorded sessions the gas HUD value never moved off its initial `100%` reading, which (given the console errors present in the same sessions) is attributed to the frame loop dying early, not to the truck successfully evading indefinitely at full gas.
- What I'm relying on instead: (b) the **exact regression test ADR 0005 prescribes** — `src/core/farmer/spawn.test.ts`'s `"FARMER_SPEED vs gas limp mode fairness invariant (ADR 0005, fixes issue #20)"` block, which imports the real `FARMER_SPEED` and the real `limpTopSpeed` function against the real `ENGINE_TIERS` table and asserts `FARMER_SPEED < limpTopSpeed(tier.topSpeed)` for every tier — this is passing (confirmed fresh, part of the 163). This is a faithful, load-bearing, non-mocked check of the exact numeric fact the fix depends on (it would fail immediately if `FARMER_SPEED` were later raised toward 5, or if `GAS_LIMP_MIN_SPEED` were lowered, exactly the two regression scenarios ADR 0005's own "Risks" section calls out).
- **My honest assessment**: the ADR 0005 fix is mathematically sound and the regression-test evidence is strong and specifically designed to catch exactly this class of bug — I have reasonable confidence the fairness property holds. But this task explicitly asked me to *exercise it live* rather than trust the unit tests alone, precisely because #20 was a real design-breaking bug that unit tests alone didn't originally catch (it was found by code review reading the two ADRs together, not by a failing test, since no cross-system test existed until ADR 0005 added one). I was not able to deliver that live exercise this pass. This is the single most important gap in this report — flagged prominently, not buried.

---

## Summary table

| AC | Criterion | Status |
|---|---|---|
| Farmer AC1 | Random appearance | Met (code+tests); live unconfirmed (#21) |
| Farmer AC2 | Chase toward player | Met (code+tests); live unconfirmed (#21) |
| Farmer AC3 | Bump drains exactly 1 hit | Met (code+tests); live unconfirmed (#21) |
| Farmer AC4 | Hit count visible (icon row) | **Met, live-confirmed** (initial render); dynamic update-on-bump not live-confirmed (#21) |
| Farmer AC5 | Bump visually/mechanically distinct, non-violent | Met (code); live unconfirmed (#21) |
| Farmer AC6 | Hard game over + restart-from-builder + coin reset | Met (code+unit tests, incl. #18 lifecycle guard); **live round trip attempted 5x, all blocked by #21** |
| Farmer AC7 | Kid-appropriate tone | Met (content/copy inspection) |
| Drive AC10 | Gas drains at constant rate | Met (code+tests); live unconfirmed (#21) |
| Drive AC11 | Empty tank -> limp speed, never hard-stop | Met (code+tests, incl. ADR-0005 floor); live unconfirmed (#21) |
| Drive AC12 | Idle regen | Met (code+tests); live unconfirmed (#21) |
| Drive AC13 | Instant full-speed recovery above 0 gas | Met (code+tests) |
| Drive AC14 | No UI game-over/blocking state in gas system | Met |
| **#20 fix** | Farmer always outrunnable, incl. empty-tank limp mode | **Met by the ADR-0005 regression test (strong evidence); explicitly requested live re-verification could not be completed (#21)** |

**New defect found and filed this pass:** **[issue #21](https://github.com/hoanghaithanh/monster-truck-farm/issues/21)** ("Sustained driving crashes the game via a Rapier WASM panic within ~20-35s of any drive session" — timing in practice ranged from under 1s to ~35s across this session's runs), `from:qa,bug`, Blocker severity, Sprint 1 milestone. This is the dominant finding of this pass — see "Headline finding" above.

---

## Sprint 1 status

This was the last of Sprint 1's original 13 stories to reach the acceptance-validation step (#1-4 truck builder, #5-7/#9-11 driving/terrain/animals, and now #8/#12/#13 gas/farmer/game-over). **Sprint 1's original scope is now functionally complete end-to-end at the code level** — every story has shipped code, unit test coverage, and at least one acceptance pass — but I am **not** calling Sprint 1 fully done from a quality standpoint: issue #21 is a newly-found, severe, live-reproduced defect that undermines confidence in the sustained-play experience this whole sprint was building toward (a young child driving around, farmer chasing, gas managing, animals booping — all of which assume sessions well beyond 30-35 seconds). I'd recommend the human treat #21 as a blocker for calling Sprint 1 "done" in the product sense, even though every individual story's own AC checklist is otherwise in a "met by tests, live-blocked by #21" state. That's a call for project-manager/human judgment at sprint close-out, not something I'm deciding here.

---

## Recommendation, not approval

Based on the evidence above, the gas, farmer, and hard-game-over systems (#8, #12, #13) are **soundly implemented at the code and unit-test level**, including the ADR-0005 fairness fix for issue #20, which has a specific, well-targeted regression test. However, I was **not able to deliver the live verification this task specifically prioritized** — the #20 fairness re-check under real play, and the game-over/restart round trip — because of a severe, newly-discovered crash (issue #21) that blocked every sustained live session I attempted this pass (8+ direct reproductions, 5 dedicated game-over-flow attempts, all blocked). AC4's HUD visibility requirement is the one criterion I *was* able to newly confirm live this pass (both HUD elements render correctly the instant a run starts).

**This is a recommendation only — I am not the approver.** Given issue #21's severity and its direct interference with this pass's most important checks, I'd specifically recommend the human **not** give final sign-off on #8/#12/#13 (or close out Sprint 1) until #21 is fixed and this pass's blocked live checks (the #20 fairness re-verification and the game-over/restart round trip) are re-run successfully. Please review the evidence above — especially the #21 write-up and the AC6/#20 live-verification gaps — before deciding how to proceed.

---

## Addendum, 2026-07-08 (same day, later pass) — re-verification of issue #21 after `ef80351`

**Status of this addendum: RECOMMENDATION ONLY**, same as the rest of this report. **Still blocked. Sprint 1 is not ready for sign-off.**

### What changed since the section above

The developer traced #21's root cause to a confirmed double `world.step()` call per tick (previously-"harmless" #16, whose safety precondition broke once the farmer NPC was added) and fixed it structurally in `ef80351` — `world.step()` now has exactly one call site in the codebase (audited via grep, confirmed again this pass). #21 and #16 were closed. The developer explicitly flagged that they could not run a live browser to confirm the fix actually resolves the crash, and specifically asked for the zero-input repro (repro 2 from the original write-up) to be re-run before treating this as resolved, since that repro's own pre-fix trace only ever hit a single, correctly-ordered `step()` call — meaning it was never mechanically guaranteed to be fixed by the double-step change in the first place.

### Task 1 — zero-input crash repro, re-run

**Result: FAIL. Crash still reproduces, 4/4 runs, effectively at t≈0s every time** (well under 1 second from entering `DRIVING`, before a single physics frame runs). This is a shorter/more consistent timing than the original report's "sub-1s to ~35s" range, but the same error signature:

```
RangeError: Maximum call stack size exceeded
    ... at $rawcolliderset_createCollider (wasm://wasm/...)
    at createCollider (assets/index-*.js:1:1)   [x3]
Error: recursive use of an object detected which would lead to unsafe aliasing in rust
    ... at $__wbg_rawshape_free (wasm://wasm/...)
```

Method: `puppeteer-core` driving real Edge (`msedge.exe`), both headless and headed, both `npm run dev`'s Vite dev server (unminified, for a readable stack trace) and `vite build && vite preview` (production build, matching what's actually deployed). Zero keyboard events were sent in any run; the truck never moved. Runs:
1. `vite preview` (production build, HEAD `ef80351`), headless — crashed at +0ms.
2. `vite` dev server, headless — crashed at +0ms, mapped stack trace obtained (see below).
3. `vite preview`, headless, re-run for stack-trace confirmation — crashed at +0ms.
4. `vite preview`, **headed** (non-headless, ruling out a headless-only artifact) — crashed at +0ms.

**The stack trace (unminified via the dev server) is the key new finding: the crash is not in the `TruckController.moveBy`/`setPosition`/`step()` path `ef80351` touched at all.** It's in `src/physics/world.ts`'s `createObstacleColliders`, called exactly once from `main.ts`'s `startDriving()` on the `BUILDER -> DRIVING` transition, creating fixed colliders for the 3 `STUB_OBSTACLES` — this happens **before** `TruckController` is even constructed and before any `world.step()` call, fixed or otherwise. `ef80351`'s single-call-site guarantee is real and correct, but it cannot be the fix for a crash that happens before `step()` is ever invoked.

**Isolating whether this is a regression from `ef80351` itself:** checked out the pre-fix commit `d79a6a1` (the exact commit the original acceptance pass in this report validated against — bundle hash `index-C4ObdvOx.js`, matching the deployed site) in a separate git worktree, built it fresh, and ran the identical repro against it. **Identical crash, identical signature, identical immediate timing.** This crash pre-dates `ef80351` and is unchanged by it — it's a genuine second, independent defect, not a regression the fix introduced and not (only) explained by the double-step mechanism. `ef80351` did fix the double-step defect it targeted (#16) — that part is real and worth keeping — it just isn't the (only) cause of #21's crash.

### Task 2 — active-input driving re-test

**Not meaningfully separable from Task 1's result.** Since the crash now reproduces before the render/physics loop ever runs a single frame (i.e. before player input could have any effect), a dedicated "60s of active driving" run cannot get further than the zero-input case — the session never reaches a point where steering/throttle input is processed. One additional run was made with the same harness (idle-only, since the crash preempts any input from mattering) and crashed identically at +0ms, consistent with runs 1-4 above.

### Tasks 3 and 4 — not attempted

Per the task's explicit instruction: **since the crash still reproduces, steps 3 (the #20 fairness live re-check, the hard game-over/restart round trip) were not attempted this pass.** Attempting them would not produce meaningful new evidence — no driving session survives long enough to reach a farmer spawn window or a gas-drain window, exactly as in the prior pass.

### Action taken: reopened #21, did not file a separate issue

**Reopened [issue #21](https://github.com/hoanghaithanh/monster-truck-farm/issues/21)** rather than filing a new one — this is judgment call, reasoning below:
- The re-test surfaced the *same* error signature (`RangeError: Maximum call stack size exceeded` -> `recursive use of an object detected`) that #21 originally reported, and the original report's own timing data ("sub-1s to ~35s") already included instances consistent with what I'm now seeing consistently (sub-1s). This reads as the same underlying defect, observed more precisely this pass thanks to an unminified stack trace, not a new, unrelated bug.
- Filing a fresh issue would fragment the history of a single ongoing defect across two issues with overlapping symptoms, evidence, and the same open hypothesis (upstream Rapier bug). Reopening keeps the full repro history — including the developer's root-cause trace of #16 and this pass's proof that the crash predates and survives `ef80351` — in one place.
- Posted a detailed comment on #21 with the full new evidence: unminified stack trace pointing at `createObstacleColliders`, confirmation the crash reproduces on the pre-fix commit `d79a6a1` unchanged, and an updated, more specific hypothesis (crash triggers on the first few `RAPIER.World.createCollider()` calls made against a freshly-initialized WASM instance — nothing exotic, just a `bush`/`rock`/`derelictCar` cylinder collider each — consistent with a WASM/JS boundary re-entrancy bug in the pinned `rapier3d-compat@0.14.0`, not application call-site logic). Recommended next step, unchanged from the developer's original note: a dependency-upgrade spike against a current `rapier3d-compat` release (`0.19.3` at last check), then re-run this exact repro.
- Did **not** reopen #16 — that specific defect (double `world.step()` per tick) is confirmed genuinely fixed by `ef80351` (single call site, audited via grep) and is not implicated by this crash's stack trace at all.

### Updated recommendation

**Sprint 1 is still not ready for sign-off.** The crash this task was sent to re-verify is not resolved — it is, if anything, more consistently and immediately reproducible than the original report suggested, and now has a precise, unminified stack trace pointing away from the code `ef80351` changed and toward either the obstacle-collider bootstrap path or (more likely, per the evidence above) an upstream defect in the pinned Rapier version. Steps 3-4 (the #20 fairness live re-check and the hard game-over/restart round trip) remain unexecuted, for the same reason as the prior pass: no driving session survives long enough to reach them. `ef80351` is a legitimate fix for a real, distinct defect (#16) and should stay merged, but it does not resolve #21. I'd recommend prioritizing the dependency-upgrade spike the developer flagged as the next concrete step, since two independent commits (`d79a6a1` and `ef80351`) have now both been ruled out as the cause via direct live testing.

**This is a recommendation only — I am not the approver.**
