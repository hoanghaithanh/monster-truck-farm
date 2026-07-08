# Acceptance Report — Sprint 1, Truck Builder & Upgrades (issues #1–4)

**Date:** 2026-07-08
**Scope:** `docs/requirements/truck-builder-and-upgrades.md`, AC1–AC7. Commits validated: `9a99614` (developer, builder screen), `c5d2c84` (test-engineer, 29 GameStore builder tests), `83ff633` (developer fix for code-review findings #18/#19 + lifecycle regression test). HEAD at validation time: `83ff633`. 103 tests total, all passing.

**Explicitly out of scope / not assessed here per the task brief and requirements doc's own cross-references:**
- Coin-spend/tier-locking (Sprint 2, confirmed deferred — AC6 explicitly says free selection is the correct Sprint 1 baseline, not a gap).
- Gas drain/regen mechanics (`drive-terrain-and-gas.md`, issue #8) and the farmer hit/game-over mechanism (`farmer-minimal-bump.md`, issues #12–13) — neither is implemented yet. Where an AC here depends on one of those not-yet-built systems, it is marked unable-to-verify-live, not failed, and the reason is stated explicitly per criterion below.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## How this was validated

- **(a) Code inspection** — traced the exact logic path in the source (`src/ui/builder.ts`, `src/core/game-state.ts`, `src/core/stats/tiers.ts`, `src/core/stats/resolve-spec.ts`, `src/main.ts`).
- **(b) Automated tests** — cited where a passing test exercises the exact behavior. Full suite: `npx vitest run` → **103/103 passing** (10 files), verified fresh this session. `npx tsc --noEmit` clean. `npx vite build` succeeds (one pre-existing non-blocking bundle-size warning, unrelated to correctness).
- **(c) Live/running-system exercise** — same approach as the prior slice-1 pass: `vite preview` serving the production build on `localhost:4173`, driven headlessly via `puppeteer-core` against the system's real Edge (`msedge.exe`), real keyboard events, real DOM/three.js/Rapier — not mocked. Script and full JSON output captured this session (not committed — scratch-only, matching the prior pass's convention of not modifying `package.json`/`package-lock.json`; `git status` confirms no changes from this).

Live session results (raw):
```json
{
  "rowsInfo": [
    { "label": "Body",     "buttons": ["Tier 0 — 3 hits", "Tier 1 — 4 hits", "Tier 2 — 5 hits"] },
    { "label": "Wheels",   "buttons": ["Base — clears small", "Off-road — clears medium", "Monster — clears large"] },
    { "label": "Engine",   "buttons": ["Standard — top speed 6", "Tuned — top speed 9", "Turbo — top speed 12"] },
    { "label": "Gas tank", "buttons": ["Small tank — 20s of drive", "Mid tank — 30s of drive", "Big tank — 45s of drive"] }
  ],
  "keyboardRowNav": { "initialFocus": 0, "afterDown": 1, "afterUp": 0 },
  "keyboardTierCycle": { "wheelTierBefore": 1, "wheelTierAfterRight": 2, "wheelTierAfterLeft": 1, "wheelTierAfterLeft2": 0 },
  "wheelTierFinal": 2,
  "overlayHiddenAfterConfirm": true,
  "tier2StillMoving": true,
  "consoleErrorsSessionA": ["Failed to load resource: the server responded with a status of 404 (Not Found)"],
  "tier1StillMoving": false,
  "consoleErrorsSessionB": []
}
```
(`consoleErrorsSessionA`'s single entry is the same known-harmless `favicon.ico` 404 noted in the prior acceptance report — cosmetic, not filed.)

Build/deploy checks:
- `vite build` output: `dist/assets/index-7zIL2_go.js`.
- Live deployed site `https://hoanghaithanh.github.io/monster-truck-farm/` serves `assets/index-7zIL2_go.js` — **exact hash match** with the local build from current HEAD (`83ff633`). Deploy confirmed current, not stale.

---

## AC-by-AC assessment

**AC1 (part selection — the driving truck reflects all four builder choices).**
- Status: **MET**
- Evidence: (a) `resolveSpec` (`src/core/stats/resolve-spec.ts`) maps all four axes (`body`, `wheels`, `engine`, `gasTank`) from `TruckBuild` into `TruckSpec`; `GameStore.confirmBuild()` calls it and `main.ts`'s `startDriving` consumes the resulting `spec.clearance` (obstacle partitioning) and `spec.topSpeed` (DrivingSystem construction) directly from the player's confirmed selection, not a hardcoded default (the old `DEFAULT_TRUCK_SPEC` was removed in `83ff633` specifically because it had become dead code once the real builder landed). (b) `game-state.test.ts`: "resolves a non-default selection (highest wheel tier) into a TruckSpec carrying that tier's clearance, not the default" and "resolves a non-default selection across all four axes into the matching stat values" — both pass. (c) **Live, directly exercised for the wheels axis** (the one axis with a currently-wired downstream consumer besides top speed — see clearance test below): selecting the highest wheel tier (Monster, clears large) via real keyboard input and confirming produced measurably different obstacle-clearance behavior in the driving scene versus the default tier — see AC3 below for the exact evidence. This is the first time this axis has been confirmed live end-to-end rather than only traced through code, closing the gap the developer/reviewer had flagged as code-reading-only.
- Caveat: `hitCapacity` and `gasCapacity` are correctly resolved into `spec` (confirmed by (a)/(b) above) but have **no downstream consumer anywhere in `src/` yet** — grepped confirmed zero references outside `resolve-spec.ts`/`tiers.ts`/`builder.ts`'s display strings. This is expected and correct for Sprint 1: the farmer/hit-capacity system (#12–13) and the gas-drain system (#8) are separate, not-yet-built stories that `hitCapacity`/`gasCapacity` are meant to feed once they land. Not a defect against #1–4's scope — see AC2/AC5 below for how this plays out per-criterion.

**AC2 (body tiers — `3 + N` hit capacity before hard game over).**
- Status: **UNABLE TO VERIFY (blocked by a not-yet-built dependency, not a defect in #1–4).**
- Evidence: (a) `BODY_TIERS` in `tiers.ts` defines exactly `3, 4, 5` for tiers 0/1/2, matching the `3 + N` rule, and `resolveSpec` threads `body.hitCapacity` into `spec.hitCapacity` correctly (confirmed live: the builder screen renders "Tier 0 — 3 hits" / "Tier 1 — 4 hits" / "Tier 2 — 5 hits" verbatim, matching the tier table exactly). (b) `game-state.test.ts` non-default-axes test covers a non-default body tier resolving correctly. (c) **Not verifiable live**: there is no farmer/hit-capacity/game-over mechanism implemented anywhere in the codebase yet (issues #12–13, confirmed by grep — `hitCapacity` has no consumer past `resolve-spec.ts`), so "the truck absorbs `3 + N` hits before hard game over" cannot be observed running because nothing yet inflicts a hit. This is the same category of gap as the #18 restart-loop note in the task brief, extended to this AC specifically.

**AC3 (wheel tiers — blocked without penalty above clearance, passes at/below clearance).**
- Status: **MET, and now confirmed live for a non-default tier selection (previously only traced via code reading).**
- Evidence: (a)+(b) `clearance.ts`/`clearance.test.ts` (from the prior slice) implement and cover class-ordering correctly for all three tiers, unchanged by this feature. (c) **Live, this session**: two independent sessions, each holding reverse (`ArrowDown`) continuously for 4.5s from the truck's start position (0, 6) toward the derelict car obstacle at (0, -8) (large, needs tier-2 clearance) — the same obstacle/approach line used in the prior acceptance pass's AC7 evidence:
  - **Session A — builder confirmed with wheel tier 2 (Monster, "clears large") selected via real ArrowDown/ArrowRight/Enter keyboard input**: screenshots at t=4.0s and t=4.5s differ (`tier2StillMoving: true`) — the truck is still moving at that point, i.e. it was **not** blocked by the derelict car it should already have passed by then (predicted contact time for a blocked truck ≈2.9s at this config's reverse acceleration/top-speed, so a truck still moving at 4.0–4.5s is well past where a blocked truck would have already stopped).
  - **Session B — builder left at its default (wheel tier 1, "clears medium")**: same 4.5s reverse hold, screenshots at t=4.0s and t=4.5s are **byte-identical** (`tier1StillMoving: false`) — the truck has stopped, consistent with being blocked by the derelict car (large, above tier 1's clearance), matching the prior slice's AC7 evidence for this same default build.
  - Same duration, same starting conditions, only the wheel-tier selection differs — and the two sessions produce measurably different truck behavior. This directly satisfies the task's ask to confirm a non-default tier selection actually changes truck behavior rather than silently continuing to use defaults.
  - No damage/penalty on block: confirmed by code inspection — `partitionObstacles`/`canClear` (unchanged from the prior slice) never reference hit capacity or any fail-state concept, and no console errors/pageerrors were observed in either live session (`consoleErrorsSessionB: []`; session A had only the pre-existing cosmetic favicon 404).

**AC4 (engine tiers — top speed matches Tier N, strictly greater than Tier N-1).**
- Status: **MET at the logic/wiring level; live-exercised for confirm+drive-start but not for the exact speed magnitude this pass.**
- Evidence: (a) `ENGINE_TIERS` defines strictly increasing `topSpeed` (6, 9, 12); `main.ts` constructs `DrivingSystem(truckController, spec.topSpeed)` directly from the player's resolved spec (not a hardcoded value); `truck-motion.ts`'s cap logic (`Math.min(topSpeed, ...)`) is parameterized by whatever `topSpeed` is passed in. (b) `truck-motion.test.ts`'s speed-cap tests (carried over from the prior slice, unchanged) plus this pass's `game-state.test.ts` non-default-axes test, which explicitly asserts a non-default engine tier resolves to its matching `topSpeed` value in `spec`. (c) Live: the builder screen correctly rendered all three engine options with their exact tier data ("Standard — top speed 6" / "Tuned — top speed 9" / "Turbo — top speed 12"), and confirming a build (with engine left at default) correctly started a driving session with visible truck movement (see AC1's overlay-hidden/session-start evidence). This pass did not additionally measure a live speed differential between two engine tiers the way it did for wheel clearance (the task named wheel clearance as the specific live-behavior example to prioritize); the wiring evidence above is assessed as strong given it uses the same `spec`-threading mechanism just live-confirmed for wheels, but a human may want an explicit live speed-differential check before treating AC4 as fully closed the way AC3 now is.

**AC5 (gas tank tiers — Tier N drives longer than Tier N-1 before empty).**
- Status: **UNABLE TO VERIFY (blocked by a not-yet-built dependency, not a defect in #1–4).**
- Evidence: (a) `GAS_TIERS` defines strictly increasing `capacity` (20, 30, 45s), and `resolveSpec` threads it into `spec.gasCapacity` correctly (confirmed live: builder renders "Small tank — 20s of drive" / "Mid tank — 30s of drive" / "Big tank — 45s of drive" verbatim). (b) `game-state.test.ts` non-default-axes test covers a non-default gas tank tier resolving correctly. (c) **Not verifiable live**: grepped confirmed `gasCapacity` has zero consumers in `src/` outside `resolve-spec.ts`/`tiers.ts`/display strings — there is no gas-drain/regen system yet (issue #8, separate story per `drive-terrain-and-gas.md`), so "drives for Tier N's duration before empty" has nothing to observe running. Same category of gap as AC2.

**AC6 (all tiers freely selectable, no coin-gating — finalized baseline).**
- Status: **MET**
- Evidence: (a) `builder.ts`/`game-state.ts` `selectTier` has no gating logic of any kind — any axis, any tier index, at any time the builder is showing. (c) **Live, directly exercised**: cycled the wheels axis through tier 1 → 2 → 1 → 0 via real `ArrowRight`/`ArrowLeft` keypresses with no blocking, no confirmation dialog, no coin check (`keyboardTierCycle` in the raw results above shows every transition succeeding immediately). Also confirmed boundary safety: two consecutive `ArrowLeft` presses from tier 1 correctly clamp at tier 0 rather than going out of range or wrapping (`wheelTierAfterLeft2: 0`), matching the `Math.max(0, currentIndex - 1)` clamp in `builder.ts`.
- Restart-path half of this AC ("...or after a hard-game-over restart"): see AC7 below — not reachable live this pass for the same reason noted in the task brief (nothing drives the game into `GAME_OVER` yet).

**AC7 (coin counter resets to 0 on restart; no other builder state required to persist).**
- Status: **UNABLE TO VERIFY VIA LIVE UI this pass (same root cause as the #18 restart-loop note in the task brief); MET at the unit level, and that unit-level evidence is treated as legitimate for this criterion.**
- Evidence: (a) `GameStore.restart()` unconditionally sets `_coins = 0` and moves `GAME_OVER -> BUILDER` via `nextScreen`; it does not touch `_build`, so the prior selection is preserved (satisfying the AC's "no other builder state ... required to persist" — i.e. preservation is allowed, not required, and the current implementation happens to preserve it, which the requirements doc explicitly permits). (b) `game-state.test.ts`, `describe('GameStore.restart (builder AC7)')`: "resets coins to 0 (AC7)", "preserves the prior builder selection rather than resetting it back to defaults", "moves the screen from GAME_OVER back to BUILDER", "is a no-op outside GAME_OVER", "notifies subscribers on restart" — all pass. Additionally, `describe('driving-session lifecycle ... (issue #18)')` reproduces the exact start/dispose guard shape `main.ts` uses (start on `BUILDER -> DRIVING` while no session active, dispose on `DRIVING -> GAME_OVER`) against a real `GameStore`, and asserts a full `DRIVING -> GAME_OVER -> BUILDER -> DRIVING` round trip starts exactly 2 sessions and disposes exactly 1 — this is the regression coverage for the bug code-review found and the developer fixed in `83ff633`.
- Caveat, stated plainly per the task brief: **nothing in the current codebase can drive the game into `GAME_OVER` through the real UI** — the farmer/hit-capacity mechanism (#12–13) that's supposed to trigger it doesn't exist yet, so this restart round trip (and therefore AC7's live behavior, and AC6's restart half) could not be exercised end-to-end through the actual running app this pass, only inferred from `GameStore` unit tests plus the `wireFakeDrivingSession` lifecycle-guard reproduction above. That reproduction is a legitimate, faithful copy of `main.ts`'s actual guard logic (same conditions, same store), not a loose approximation — but it is still a unit-level stand-in for `main.ts` itself, which was not exercised end-to-end for this transition. Recommend re-running this specific AC live once #12–13 land and `GAME_OVER` becomes reachable through real play.

---

## Summary table

| AC | Criterion | Status |
|---|---|---|
| AC1 | Builder selection reflected in driving truck | Met (live-confirmed for wheels/clearance path this pass; body/gas confirmed resolved but have no live-observable consumer yet — expected, not a gap) |
| AC2 | Body tier → `3+N` hit capacity | Unable to verify (farmer/#12-13 not built yet — not a defect) |
| AC3 | Wheel tier → obstacle clearance, no penalty | **Met, live-confirmed this pass** for a non-default tier (tier 2 vs. default tier 1, measurably different behavior at the same reverse-hold duration) |
| AC4 | Engine tier → top speed | Met (wiring + tests; live-confirmed for confirm/drive-start, not for the exact speed differential this pass) |
| AC5 | Gas tank tier → drive duration | Unable to verify (gas system/#8 not built yet — not a defect) |
| AC6 | Free tier selection, no coin gating (initial build) | **Met, live-confirmed this pass** (keyboard cycling, boundary clamp) |
| AC6 | Free tier selection (restart path) | Unable to verify live (GAME_OVER unreachable, same root cause as AC7) |
| AC7 | Coin reset + build preservation on restart | Met at unit level (incl. #18 lifecycle regression coverage); unable to verify via live UI (GAME_OVER unreachable this pass) |

**New defects found during this pass:** none. The only console entry seen live was the same pre-existing cosmetic `favicon.ico` 404 already known from the prior slice's report — not re-filed.

**Gaps knowingly left unverified live, for a human to weigh:**
1. AC2 and AC5 have no live-observable path yet — they depend on the farmer/hit-capacity system (#12-13) and the gas-drain system (#8) respectively, neither of which is built. The builder correctly produces and threads the right numbers into `TruckSpec` (code + unit-test evidence), but there's nothing running yet that consumes `hitCapacity` or `gasCapacity`. This is expected sequencing, not a defect in #1-4.
2. AC7 (and AC6's restart half) could not be driven through the real UI because nothing currently triggers `GAME_OVER` — same limitation the task brief flagged for the #18 fix specifically. The `GameStore` unit tests (including the #18 lifecycle-guard reproduction) are legitimate evidence for the underlying mechanism, but a live end-to-end confirmation is still outstanding until #12-13 ship. Recommend a follow-up acceptance pass on this specific slice once the farmer mechanism lands.
3. AC4's exact speed differential between engine tiers was not separately live-measured this pass (wheel clearance was the prioritized live-behavior check per the task brief); the wiring evidence is strong but a human may want an explicit speed-differential live check as a small follow-up.

---

## Recommendation, not approval

Based on the evidence above, I recommend the truck builder feature (#1-4) as substantially meeting its in-scope, currently-testable acceptance criteria: AC1, AC3, AC4, and AC6 are met, with AC3 and AC6 now directly confirmed live this pass (closing the gap previously flagged as code-reading-only). AC2, AC5, and the restart-dependent half of AC6/AC7 are correctly implemented at the code/unit-test level but cannot be verified end-to-end yet because the systems they depend on (#8 gas drain, #12-13 farmer/game-over) haven't been built — this is expected sequencing, not a defect, and no new issues were filed. **This is a recommendation only — I am not the approver.** Please review the evidence above (especially the AC2/AC5/AC7 dependency gaps) and give explicit final sign-off before this feature is considered done per the project's Definition of Done.
