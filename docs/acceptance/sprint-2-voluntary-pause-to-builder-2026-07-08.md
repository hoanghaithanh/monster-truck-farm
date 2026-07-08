# Acceptance Report — Sprint 2, Voluntary Pause-to-Builder (issue #25)

**Date:** 2026-07-08
**Scope:** `docs/architecture/0009-voluntary-pause-to-builder.md` (all 6 decision sections + the ADR's own Testing/Risks sections), against the developer's implementation of `nextScreen` pause/resume events, `GameStore.pauseToBuilder/resumeDriving/beginDrive`, `GasSystem`'s `initialRemaining` seed, `FarmerSystem`'s opaque `snapshot()`/`seed` carry, and `main.ts`'s dispose/recreate wiring. Commit validated: uncommitted working tree at session start (developer's diff on top of `5e400ae`), plus this pass's own test additions. This is the highest session-lifecycle-risk change of Sprint 2 given issues #18 (dispose/recreate) and #21 (recursive re-entrancy).

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Summary, up front

**No defects found in the product.** Test coverage was extended by 4 tests (278 total, up from 274): a genuine unit-level gap (the pause-vs-game-over farmer-snapshot ordering) and a genuine composition gap (chain-purchase T1→T2 before resume) that the developer's own report did not explicitly cover at either the unit or live level. All 278 tests pass. An independent live Puppeteer pass (real Edge, real DOM/GameStore/three.js/Rapier, not mocked — written from scratch against the ADR's own scenario text, not copied from the developer's `qa-pause-resume.mjs`) re-verified the two riskiest scenarios named in the task: farmer-carry-across-a-pause and the crash/re-entrancy battery, plus a supplementary live check of the body-heal/anti-exploit path through the real UI click path (not just `store.purchaseTier()` calls). All checks passed. Two methodology mistakes in my own first-draft scripts were caught and corrected before this report was written (disclosed below, per this project's established convention) — neither was a product defect.

## How this was validated

**(a) Code inspection** — `src/core/game-state.ts`, `src/systems/gas-system.ts`, `src/systems/farmer-system.ts`, `src/main.ts`, `src/ui/hud.ts`, `src/ui/builder.ts` against ADR 0009 §1-§6.

**(b) Review of the developer's existing tests (critical read, not rubber-stamp).**
- `src/systems/farmer-system.test.ts`'s snapshot/seed round-trip: verified it is a *real* round-trip assertion, not a tautology — `restored.snapshot()` is compared via `toEqual` against the *original* seed object, so a constructor bug that drops/mis-copies any field (`state.kind`, `position`, `spawnElapsed`, `invuln.remainingSeconds`, `spawnDelay`) would show up as a mismatch. It covers ABSENT (no re-roll), PURSUING (no reset-to-ABSENT), and the invuln timer specifically. Verdict: **substantive, covers every field in the blob** because the whole-object seed shape makes partial coverage structurally impossible — a missed field in the constructor would fail the `toEqual`.
- **Gap found:** nothing in the suite pinned "snapshot only happens on pause, not game-over" at the unit level — this ordering (ADR §2c, called out in the ADR's own Risks section as "fails quietly") was only exercised by the developer's live smoke test. `main.ts` itself can't be unit-tested directly (imports three.js/Rapier browser globals), same limitation the pre-existing `#18` lifecycle test block in `game-state.test.ts` already works around by mirroring the subscriber's guard shape against a fake session object rather than importing `main.ts`. I used the identical technique: added `describe('main.ts dispose-branch farmer-snapshot ordering ...')` in `game-state.test.ts`, mirroring the *exact* dispose-branch line (`pausedFarmerState = store.pausedMidRun ? driving.snapshotFarmer() : undefined; driving.dispose();`) against a fake session, asserting (1) snapshot is captured strictly before dispose on a pause exit, (2) no snapshot capture at all on a game-over exit, and (3) a stale pause-snapshot doesn't leak through a subsequent resume→game-over. **Caveat, disclosed:** this pins the *intended logic shape*, not literally `main.ts`'s source — same caveat the pre-existing `#18` test carries. A future refactor could in principle drift `main.ts` away from this shape without tripping the test; only the live smoke test (developer's and mine) actually exercises the real file. Worth flagging to the architect/developer as a longer-term idea (extracting the subscriber body into an exported, pure-testable function) but not a blocker — the ADR itself accepted this limitation ("Three.js/Rapier can't be exercised in core/'s unit tests").
- **Gap found:** the developer's "last purchase wins when buying tier 1 then tier 2" test asserts intermediate `hitsRemaining` after each purchase but never calls `resumeDriving()` afterward, so it didn't actually confirm the *resume* state reflects tier 2, not tier 1 (the task's specific ask). Added a dedicated test that chain-purchases then resumes and asserts against `BODY_TIERS[2].hitCapacity`.
- **Anti-exploit re-equip test** (`does not heal on selectTier`): read closely and confirmed real — it takes a bump while equipped on the *owned* tier before pausing, snapshots `hitsRemaining`, calls `selectTier` (not `purchaseTier`) to swap to a different owned tier, and asserts no change. This correctly exercises the coin-cost gate, not a fresh-full-hits coincidence (hits were already partial going in).
- Gas-clamp-on-resume and `beginDrive()` routing: both already covered adequately (smaller-tank-while-paused clamp, bigger-tank-no-refill, and both branches of `beginDrive`) — no gap found, no test added.

**(c) New tests added this pass** (`src/core/game-state.test.ts`, 4 new tests, total suite 278/278 passing):
1. `chain-purchase before resume: buying tier 1 then tier 2 in the same pause, resumeDriving reflects tier 2's capacity, not tier 1's` — closes the composition gap above.
2. `captures the farmer snapshot BEFORE dispose on a voluntary pause exit`
3. `does NOT capture a farmer snapshot on a game-over exit`
4. `a pause followed by a resume-then-gameOver correctly drops the stale farmer blob on the second (game-over) exit`

Ran `npx vitest run` before and after: 274/274 → 278/278, no regressions. `npx vite build` succeeds (pre-existing bundle-size warning only, unrelated).

**(d) Independent live/running-system exercise** — `vite build && vite preview` (port 4180, to avoid colliding with any other running preview instance), driven via `puppeteer-core` against the system's real Edge (`msedge.exe`), real keyboard/click events, real DOM/GameStore/three.js/Rapier — not mocked. Scripts were written from scratch against the ADR's own Testing-section scenario descriptions; I read the developer's `qa-pause-resume.mjs` for awareness of the QA-hook shape only, and did not execute or copy it, per the task's explicit ask for an *independent* re-verification.

A temporary debug hook (`window.__qaGameStore`, `window.__qaFarmer`) was added to `src/main.ts` for this pass only — same disclosed-and-reverted convention used in the Sprint 1/2 acceptance reports (and by the developer's own smoke test). Reverted via a direct `Edit` removing exactly the added block before this report was written; confirmed via `git diff src/main.ts | grep -c "__qa"` → `0`, and a fresh `vite build` producing the **byte-identical output hash** (`index-DaY0o7dy.js`) as the very first build made before the hook was added — the strongest possible confirmation the reverted tree is what's actually being signed off on, not just a diff eyeball.

Scripts (scratch-only, not committed): `qa-independent-pause25.mjs` (farmer-carry + crash/re-entrancy battery) and `qa-independent-bodyheal25.mjs` (body-heal + anti-exploit via real UI clicks).

---

## ADR 0009 §1-§6 — decision-by-decision

**§1 (two new FSM transitions, coins untouched).**
- Status: **MET (code + tests).** `nextScreen`'s pause/resume cases and `pauseToBuilder()`'s "preserved by omission" design match the ADR exactly; unit tests confirm coins/ownership/build/hits/gas are bit-for-bit unchanged across a pause.

**§2 (dispose/recreate carry: hits store-owned, gas mirror, farmer opaque snapshot).**
- Status: **MET (code + tests + independent live verification) — the ADR's own highest-risk item.**
- Evidence: (b/c) the new ordering-pin tests above close the one unit-level gap in this area. (d) **Independent live**: Scenario A (farmer-carry) — drove to a real farmer bump (PURSUING, adjacent, RNG-timed, not seeded), paused immediately, confirmed the held snapshot was `PURSUING` at the pre-pause position (within 0.5 units), resumed, and confirmed the *live* farmer was already `PURSUING` at the continued position ~60ms after resume (not `ABSENT`), then confirmed a re-bump landed within 5s (proving continuity — a fresh spawn would have taken 6-12s minimum). Full run log:
  ```
  Farmer state at bump time:      PURSUING @ (-0.196, 5.284)
  Snapshot held during pause:     PURSUING @ (-0.159, 5.418), invuln 0.778s remaining, spawnDelay 9.37
  Live farmer ~60ms after resume: PURSUING @ (-0.082, 5.700), invuln 0.705s remaining, spawnDelay 9.37 (unchanged, correctly not re-rolled)
  Re-bumped within 5s of resume: true
  hitsPreservedAcrossPause: true
  ```
  This independently confirms §2c's central claim — the farmer genuinely keeps chasing across the dispose/recreate boundary, at the right position, with the invuln timer carried, not reset.

**§3 (resume state rules: gas absolute-preserve+clamp, hits preserve+body-heal, farmer opaque restore).**
- Status: **MET (code + tests + independent live verification).**
- Evidence: (b/c) gas-clamp-on-smaller-tank and no-refill-on-bigger-tank both already covered; the new chain-purchase test closes the one composition gap. (d) **Independent live** (`qa-independent-bodyheal25.mjs`): forced 2 bumps (hits 3→1), paused via a real click, funded coins, clicked the real "Tier 1 — 4 hits" builder button (not `store.purchaseTier()` directly) → hits jumped 1→4 (tier 1's full capacity) through the actual UI click path, not just the store API. Then resumed, took a real bump (4→3), re-paused, clicked the already-owned "Tier 0" button → hits stayed at 3 (no heal on re-equip), confirming the anti-exploit gate holds through the real UI too, not just the store method in isolation.

**§4 (single guarded `startDriving()` call site, #21 preserved).**
- Status: **MET (code + independent live verification).**
- Evidence: (a) code inspection confirms `resumeDriving()` and `confirmBuild()` both only ever set `screen` and emit — no second `startDriving()` call site exists; the module-scoped `startingDriving` guard covers both. (d) **Independent live crash/re-entrancy battery**: 8s zero-input idle (0 new console/page errors), 8x rapid pause↔resume cycles with the screen correctly alternating BUILDER/DRIVING each time (0 new errors), a rapid triple-click on the Shop button specifically targeting the pause direction of the guard (0 new errors, ended cleanly in BUILDER), and a final 5s zero-input idle after all that churn (0 new errors) to rule out an orphaned rAF loop or leaked session from the preceding stress. Full result set: every one of 6 crash-battery assertions passed; only non-JS console output across the whole run was one unrelated `404` resource-load message (consistent with a missing favicon, not a `pageerror`).

**§5 (subsystem changes: `GasSystem`/`FarmerSystem`/`GameStore` minimal, encapsulated).**
- Status: **MET (code + tests).** `GasSystem`'s default-unchanged-caller guarantee and clamp are both unit-tested; `FarmerSystem`'s whole-blob `snapshot()`/`seed` shape is exactly as specified, opaque to `main.ts`.

**§6 (UI: pause button click-only/no-keyboard-shortcut, contextual "Resume driving!" label, `beginDrive()` dispatch).**
- Status: **MET (code + tests + live).** Confirmed in `hud.ts` there is no keydown handling anywhere near the pause button (only `onclick`), matching human decision 1; `builder.ts`'s `render()` conditional label and `beginDrive()`'s dispatch are both unit-tested and were exercised live via real clicks throughout both independent scripts without incident.

---

## Methodology corrections, disclosed (per project convention)

Two mistakes in my own first-draft scripts, both caught and fixed before this report was written — neither is a product defect:
1. **`qa-independent-pause25.mjs`**, first run: `hitsPreservedAcrossPause` came back `false`. Root cause: my own check read `hitsRemaining` *after* the deliberate "prove fast continuity via a re-bump" wait loop, so it was comparing post-re-bump hits against pre-pause hits — the re-bump is an intentional additional hit by design. Fixed by moving the preservation check to immediately after resume, before the continuity-proving wait. Re-ran: `true`.
2. **`qa-independent-bodyheal25.mjs`**, first run: the "re-equip doesn't heal" check was vacuously true. Root cause: I called `store.bump()` while the screen was still `BUILDER` (paused) — `bump()` is a guarded no-op outside `DRIVING`, so the intended "take damage before re-equip" step silently did nothing, leaving hits already at full and the "no heal" comparison trivially passing regardless of correctness. Fixed by resuming, taking the real bump while `DRIVING`, then re-pausing before the re-equip click. Re-ran with a real 4→3 hit transition preceding the re-equip check: `true`.

---

## Summary table

| ADR 0009 item | Status |
|---|---|
| §1 FSM transitions, coins untouched | Met (code+tests) |
| §2 Dispose/recreate carry (hits/gas/farmer) — highest-risk item | **Met — code+tests+independent live, including a new unit-level ordering pin the developer's report didn't have** |
| §3 Resume state rules (gas clamp, body-heal, farmer restore) | **Met — code+tests+independent live, including a chain-purchase composition gap closed this pass** |
| §4 Single guarded `startDriving()` / #21 preserved | Met — code + independent live crash/re-entrancy battery |
| §5 Subsystem changes (`GasSystem`/`FarmerSystem`/`GameStore`) | Met (code+tests) |
| §6 UI (pause button, label, dispatch) | Met (code+tests+live) |

**No defects found this pass. No GitHub issues filed.**

---

## Recommendation, not approval

Voluntary pause-to-builder (issue #25, ADR 0009) is **soundly implemented at the code, unit-test, and independent live-verification level**, with no defects found. Given the stakes explicitly called out in the task — this is the highest session-lifecycle-risk change of Sprint 2, on top of the #18/#21 history — I independently re-verified the two riskiest live scenarios from scratch (farmer-carry, crash/re-entrancy battery) rather than trusting the developer's own 5-scenario smoke-test report, and additionally re-verified body-heal/anti-exploit through the real UI click path. All checks passed; the two script bugs I hit and fixed along the way were my own tooling mistakes, disclosed above, not product defects. I also closed two genuine coverage gaps at the unit level (the pause-vs-game-over snapshot ordering, and the chain-purchase-then-resume composition case) that neither the developer's unit tests nor their live report explicitly covered.

**This is a recommendation only — I am not the approver.** I'd recommend this feature is ready to proceed to code review. Please review the evidence above — particularly the §2/§4 live results, given this project's history with issues #18 and #21 — before giving final sign-off.

**This is a recommendation only — I am not the approver.**
