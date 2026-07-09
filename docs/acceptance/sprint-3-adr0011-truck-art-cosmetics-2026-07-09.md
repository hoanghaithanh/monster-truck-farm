# Acceptance Report — Sprint 3, ADR 0011 Truck Body/Wheel Art & Cosmetic Customization (issues #27, #30)

**Date:** 2026-07-09
**Scope:** `docs/requirements/vehicle-and-character-art.md` AC1-AC4 and AC10-AC13 (truck body/wheel art, shared NFR budget), `docs/requirements/truck-cosmetics.md` AC1-AC8 (cosmetic paint/design/wheel-look, independent of tier), against commit `097d6c5` on `main` ("Implement truck body/wheel art and independent cosmetic customization (#27, #30)"), which `code-reviewer` already reviewed (verdict: ready to merge, one non-blocking Minor filed as #34, a preview-rebuild-on-every-keypress perf nit). Design reference: `docs/architecture/0011-truck-model-and-cosmetic-variants.md` (ADR 0011), used in lieu of a separate mockup image per this project's convention.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Summary, up front

**No defects found.** The developer's 398/398 passing test suite (`npx vitest run`, 31 files) was not re-litigated line by line this pass — code-reviewer already traced the disposal/material-sharing correctness carefully and found it sound — but per this project's Sprint 1 retrospective (`docs/retrospectives.md`: bugs #18/#21 both survived clean code review + full unit tests and were only caught by live interaction), I did not stop at "tests pass." I built the app for real (`npm run build && npx vite preview`) and drove it end-to-end in the system's real Edge via `puppeteer-core` (temporarily installed `--no-save`, removed afterward — confirmed via `git status`/`git diff` that `package.json`/`package-lock.json` are untouched), covering every AC in both requirements docs plus the two disposal/failure-path scenarios this project's bug history (#18, #21, #31) specifically calls for extra scrutiny on. All checks passed: visually distinct, escalating body/wheel tiers; visible engine/gas-tank cue props; a structurally separate, keyboard-only-operable cosmetics section; identical builder-preview-vs-driving-scene assembly; stat display unaffected by cosmetic choice; no crash or console error across a rapid tier/cosmetic churn + pause/resume battery; and a clean primitive-fallback with no crash when a truck `.glb` request was forced to fail.

## How this was validated

**(a) Code inspection** — `src/render/truck-rig.ts`, `src/render/truck-sockets.ts`, `src/render/cosmetics/cosmetic-manifest.ts`, `src/render/assets/manifest.ts`, `src/render/scene.ts`, `src/ui/builder.ts`, `src/main.ts`, `src/core/types.ts`/`game-state.ts`'s cosmetics additions, `docs/architecture/0011-truck-model-and-cosmetic-variants.md` §1-§6 — to understand the single-assembly-path guarantee (`buildTruckRig`, called from exactly `scene.ts` and `builder.ts`) that AC4/cosmetics-AC8 rest on, and the ownership rules for disposal (`TruckRigResult.dispose()` only frees fallback-primitive and decal geometry it created itself, never the `AssetRegistry`'s shared cached geometry or the cosmetic manifest's shared paint materials).

**(b) Full existing test suite** — `npx vitest run`: **398/398 passing**, 31 files, including `truck-rig.test.ts` (11 tests), `cosmetic-manifest.test.ts` (10 tests), `manifest.test.ts` (4 tests, ADR 0011-specific), and 71 new lines in `game-state.test.ts` covering `selectCosmetic`. `npm run build` succeeds cleanly (`tsc --noEmit` + `vite build`); the 12 real `.glb` files are each emitted as their own fingerprinted asset (2.14 kB - 17.82 kB raw), never inlined into the JS chunk.

**(c) Independent live verification** — `npm run build && npx vite preview` (port 4321, base path `/monster-truck-farm/`), driven via `puppeteer-core` against the system's real Edge (`msedge.exe`), real DOM/GameStore/three.js/Rapier, not mocked. A temporary debug hook (`window.__qa = { store, assetRegistry }`) was added to `src/main.ts` for this pass only — same disclosed-and-reverted convention as the ADR 0010 Pass-1 acceptance report — then removed; confirmed via `git diff src/main.ts` (empty) after revert, and `npx vitest run` re-run clean (398/398) post-revert.

Scripts (scratch-only, not committed, run from the repo root so `node_modules` resolved — cleaned up via `rm` after each run, confirmed via `git status`): `qa-visual-truck-art.mjs` (tier progression + cosmetics + churn/pause/resume screenshots), `qa-keyboard-and-fallback.mjs` (keyboard-only cosmetic operation + forced asset-failure fallback), `check404.mjs` (baseline console/network-error sweep).

Screenshots saved under `docs/qa/screenshots/adr-0011-truck-art-cosmetics/` (14 images, committed):
- `01` — fresh builder, tier 0 everywhere, default cosmetics (orange/plain/standard).
- `02` — all four functional axes at tier 2 (coins granted via the debug hook, `store.addCoins()`+`store.purchaseTier()`, to reach otherwise coin-gated tiers), default cosmetics.
- `03` — same tier-2 build, cosmetics changed to purple body / flame-accent design / chrome wheels.
- `04-*-tier-{0,1,2}` — body+wheels stepped through all three tiers with cosmetics held constant (purple/flames/chrome), for a direct visual tier-progression comparison.
- `05` — final build before confirming (tier 2 everywhere, purple/flames/chrome).
- `06` — driving scene immediately after `beginDrive()` from `05`'s state (AC4/AC8 check).
- `07` — builder after an 8-iteration rapid tier+cosmetic churn loop, paused mid-run ("Resume driving!" label confirms `pausedMidRun` routing).
- `08` — driving scene after resuming from `07`'s churned state.
- `09`/`10` — cosmetic section reached and operated using **only** synthetic `ArrowDown`/`ArrowRight`/`Space` keydown events (no store calls, no mouse) — body color → blue, wheel look → chrome.
- `11`/`12` — `body-tier-0.glb` request forced to fail (`request.abort('failed')`) in the builder and again after confirming into the driving scene — primitive box fallback rendered both places, no crash.

---

## Requirements AC-by-AC — vehicle-and-character-art.md

| AC | Description | Status | Evidence |
|---|---|---|---|
| **AC1** (body models differ per tier, builder + driving) | **MET.** | Screenshots `04-tier-{0,1,2}` show three visually distinct, escalating body silhouettes (low flat tier 0 → taller boxed tier 1 → tallest tier 2 with visible roll-bar-like top structure and enlarged proportions) in the builder preview; `06`/`08` confirm the driving-scene truck is the same asset. Reads as "upgrading," matching ADR 0011's design intent. |
| **AC2** (wheel models differ per tier) | **MET.** | Same `04-tier-{0,1,2}` sequence: wheel radius and tread visibly grow tier-over-tier (confirmed also in code: `WHEEL_RADIUS_BY_TIER` = 0.3/0.4/0.5, `truck-sockets.ts`). |
| **AC3** (engine/gas-tank cue, not full remodel) | **MET.** | `02` shows small distinct props on top of/beside the tier-2 body (thin pole/roll-bar-like engine cue, a small tank-colored block) — visibly present but clearly not a body remodel. Confirmed in code: `engineCueAssetKey`/`gasCueAssetKey` resolve to small dedicated `.glb`s (2.15-5.57 kB, an order of magnitude smaller than the body/wheel models), attached at `sockets.engine`/`sockets.gasTank`. |
| **AC4** (builder preview == driving-scene asset, no mismatch) | **MET — structurally and by live observation.** | Code: both `ui/builder.ts` and `render/scene.ts` call the identical `buildTruckRig(build, cosmetics, assetRegistry)`, so a mismatch is not just untested but architecturally impossible (ADR 0011 §5). Live: `05` (builder, purple/flames/chrome, tier 2 everywhere) and `06` (driving scene immediately after) show the same body shape, paint color, decal, and wheel look. |
| **AC10** (perf budget, ~5MB gzipped combined ceiling) | **MET, large margin.** | Manifest's declared `approxGzipBytes` for all 12 real truck-art assets sum to ~23.8 KB — spot-checked two real files via `gzip -c \| wc -c` against `dist/`: `body-tier-0` declared 752 B / actual 764 B, `wheel-tier-2` declared 5041 B / actual 4792 B (both within ~5%, no material misrepresentation). Total is `core/assets/budget.ts`'s `ASSET_BUDGET_TARGET_GZIP_BYTES` (1.5 MB) territory at roughly **1.6% of target**, nowhere near the combined 5MB ceiling even before accounting for `environment-dressing.md`'s assets (not in this commit). |
| **AC11** (builder first paint not blocked) | **MET (carried over from ADR 0010 Pass 1, re-confirmed structurally).** | `buildTruckRig` always returns a usable group immediately — primitive fallback per part if the registry doesn't have it ready yet (`resolvePart`) — so the builder's `rebuildPreview()` never awaits a network response. Not independently re-timed this pass (ADR 0010 Pass 1 already measured this mechanism directly); this pass confirms the same code path is what real truck assets now flow through. |
| **AC12** (bounded loading indicator, 3s timeout, never a silent freeze) | **MET, re-confirmed against real assets.** | With `body-tier-0.glb` forced to fail outright (screenshots `11`/`12`), `store.beginDrive()` still reached `DRIVING` (not stuck in `BUILDER`) within the expected ~3-4s window (4000ms poll caught it settled), consistent with `TRUCK_GATE_TIMEOUT_MS = 3000` in `main.ts`. No hang observed. |
| **AC13 (asset failure never crashes)** | **MET, live-forced.** | Aborting `body-tier-0.glb`'s network request (`request.abort('failed')`) produced exactly one `console.warn` (`AssetRegistry: failed to load "body-tier-0" ... TypeError: Failed to fetch`), `assetRegistry.status('body-tier-0') === 'failed'`, and a rendered primitive box fallback in both the builder preview (`11`) and the driving scene (`12`) — no thrown exception, no crash, no broken/missing geometry. Only other console error across every live run was the pre-existing, unrelated `favicon.ico` 404 (confirmed via `check404.mjs`, same known non-issue flagged in the ADR 0010 Pass-1 report). |

AC5-AC9 (chicken model, farmer model/state art) are **out of scope for this pass** — this commit (`097d6c5`) only implements the truck body/wheel/cosmetics slice (issues #27/#30); the chicken and farmer art are separate, not-yet-implemented stories per the same requirements doc.

## Requirements AC-by-AC — truck-cosmetics.md

| AC | Description | Status | Evidence |
|---|---|---|---|
| **AC1** (cosmetic selection never changes stats) | **MET — structurally, plus live-confirmed.** | Code: `resolveSpec()`/`TruckSpec` resolution never reads `_cosmetics` (ADR 0011 §3, "crossed edge" in the component diagram) — a structural guarantee, and the existing pure-logic tests assert it. Live: after applying purple body / flame design / chrome wheels, the functional-tier button labels ("Tier 0 — 3 hits", "Tier 1 — 4 hits", "✅ Tier 2 — 5 hits", etc.) were read directly from the live DOM and were byte-identical to their pre-cosmetic-change text — no stat text changed. |
| **AC2** (cosmetic UI structurally distinct from functional picker) | **MET.** | Every screenshot shows a visually separate "🎨 Paint & style" panel (own heading, own subtly-tinted background/border, "Just for looks — pick any style, any time. No cost, no stats." subtitle) below the four functional rows, never interleaved row-by-row. |
| **AC3** (keyboard-operable, no mouse-only) | **MET — live-confirmed with a keyboard-only, no-mouse, no-store-call script.** | Screenshots `09`/`10`: reached the cosmetic section using only synthetic `ArrowDown`/`ArrowRight`/`Space` keydown events from a fresh page load (no `store.selectCosmetic()` call, no click), and confirmed via `store.cosmetics` read-back that `bodyColor` became `"blue"` and `wheelLook` became `"chrome"` purely from the keyboard sequence, with the (unrelated) `build` still untouched at all-tier-0. |
| **AC4** (cosmetic asset-load failure falls back to default, no crash) | **N/A this pass, by design — not a network-loaded asset.** | ADR 0011 §2 deliberately makes cosmetics flat-color/plain materials resolved from an in-memory manifest (`cosmetic-manifest.ts`), not network-fetched textures — there is no cosmetic "asset load" to fail. Confirmed in code: `getBodyColorMaterial`/`getWheelLookMaterial` fall back to `DEFAULT_BODY_COLOR`/`DEFAULT_WHEEL_LOOK` for any unrecognized id via `??`, a synchronous default-lookup, not a loader with a failure path. |
| **AC5** (full body-color/design palette selectable regardless of owned/equipped body tier) | **MET.** | With only tier-0 body owned (screenshot `01`/`09`/`10`), all 5 body colors and all 3 body designs were selectable and applied (no lock icon, no ownership check in `actOnCosmetic` — code confirms cosmetics never call `owned()`). |
| **AC6** (full wheel-look palette regardless of owned/equipped wheel tier) | **MET,** same evidence and code path as AC5, wheel axis. |
| **AC7** (tier change carries over or resets cosmetic cleanly, never crashes/looks broken) | **MET — carry-over confirmed live.** | Screenshots `04-tier-{0,1,2}`: body/wheel tier stepped 0→1→2 (and the 8-iteration churn loop in `07`) with cosmetics (purple/flames/chrome, then random per-iteration) staying applied and rendering correctly at every tier, no missing/broken geometry, no console error — consistent with ADR 0011 §2's shared-palette-material design that makes carry-over "always clean" by construction. |
| **AC8** (builder cosmetic choice reflected identically in driving scene) | **MET.** | Same single-`buildTruckRig`-path argument as vehicle-art AC4, live-confirmed by `05`→`06` (purple/flames/chrome, tier 2 everywhere) and `07`→`08` (post-churn state, whatever it settled on). |

---

## Disposal/regression-history-specific checks (per this project's #18/#21/#31 history)

- **Rapid tier/cosmetic churn → pause → resume:** an 8-iteration loop cycling `body`/`wheels` tiers and `bodyColor`/`wheelLook` cosmetics with no waits between calls, then `pauseToBuilder()`, then further churn, then `beginDrive()` to resume — ended cleanly in `DRIVING` (screenshot `08`), zero console errors beyond the known unrelated favicon 404, no visibly broken/missing geometry. This exercises the same `TruckRigResult.dispose()`/rebuild path code-reviewer traced statically (fallback-only disposal, shared-geometry/material non-disposal) under real repeated churn, not just a single change.
- **Forced asset-load failure (`body-tier-0.glb` aborted at the network level):** confirmed AC13 above — clean primitive fallback, one `console.warn`, no crash, in both the builder preview and after actually starting to drive with the failure still in effect.

## Methodology notes, disclosed

- A temporary debug hook (`window.__qa = { store, assetRegistry }`) was added to `src/main.ts` to let the live scripts grant coins (`store.addCoins()`) and drive `store.selectTier`/`selectCosmetic`/`purchaseTier`/`beginDrive`/`pauseToBuilder` directly — needed because reaching tier 1/2 body and wheels through the real coin-earning gameplay loop (boop animals while driving) would have taken many real playthrough minutes per tier per axis, with no such fast-forward already exposed to the browser console. This is the same disclosed-and-reverted convention the ADR 0010 Pass-1 acceptance report used for its own debug hook. Reverted via `git checkout -- src/main.ts` before this report was written; confirmed via `git diff src/main.ts` (empty) and a clean 398/398 `vitest run` afterward. AC3 (keyboard-only operability) was deliberately validated through a *separate* script path that used **only** synthetic keyboard events, specifically so the debug hook's convenience for the tier/coin scenarios wouldn't quietly stand in for the one AC that's actually about the real input path.
- Scratch scripts (`qa-visual-truck-art.mjs`, `qa-keyboard-and-fallback.mjs`, `check404.mjs`) were written and run from the repo root (not the session scratchpad) so `node_modules` resolution worked for the temporarily-installed `puppeteer-core`; all three were deleted after the run, confirmed via `git status --short` showing no untracked `.mjs` files remain.
- I did not attempt to re-verify the loading-indicator overlay's `style.display` toggling directly this pass (the specific technique the ADR 0010 Pass-1 report used) — that mechanism is unchanged by this commit (still `main.ts`'s `loadingIndicator.show()`/`hide()` straddling the same `assetRegistry.waitFor()` call, just gated on a different asset-key list per `truckAssetKeysForBuild`), and AC12's observable behavior (gate resolves within the bounded window, doesn't hang) was independently reconfirmed via the forced-failure scenario's timing instead.

---

## Summary table

| Requirement AC | Status |
|---|---|
| vehicle-art AC1 (body models per tier) | Met |
| vehicle-art AC2 (wheel models per tier) | Met |
| vehicle-art AC3 (engine/gas-tank cue, not remodel) | Met |
| vehicle-art AC4 (preview == driving asset) | Met — structural + live |
| vehicle-art AC5-AC9 (chicken/farmer) | Out of scope this commit |
| vehicle-art AC10 (perf budget) | Met, large margin |
| vehicle-art AC11 (builder first paint) | Met (carried over, re-confirmed structurally) |
| vehicle-art AC12 (loading indicator, bounded) | Met, re-confirmed against real assets |
| vehicle-art AC13 (asset failure never crashes) | Met, live-forced |
| cosmetics AC1 (no stat impact) | Met — structural + live |
| cosmetics AC2 (UI section separation) | Met |
| cosmetics AC3 (keyboard-operable) | Met — live, keyboard-only script |
| cosmetics AC4 (cosmetic asset failure fallback) | N/A — not network-loaded by design |
| cosmetics AC5 (full body palette any tier) | Met |
| cosmetics AC6 (full wheel-look palette any tier) | Met |
| cosmetics AC7 (tier-change carry-over, no crash) | Met |
| cosmetics AC8 (builder == driving cosmetics) | Met |

**No defects found this pass. No new GitHub issues filed** (the one pre-existing non-blocking Minor, #34, was already filed by code-reviewer and is unrelated to this pass's findings).

---

## Recommendation, not approval

The truck body/wheel art and independent cosmetic customization (issues #27, #30, commit `097d6c5`) is **soundly implemented and behaves correctly under live interaction**, not just in its 398/398 passing test suite. Given this project's history of runtime/rendering bugs (#18, #21) surviving clean code review and full test coverage — explicitly called out in the Sprint 1 retrospective as the reason this gate exists — I independently drove the real built app in a real browser rather than trusting the test suite and code-reviewer's static trace alone, specifically targeting: the tier-progression visual read (does it actually look like upgrading, not just "different"), the builder-preview/driving-scene asset identity guarantee, cosmetic-vs-functional independence as observed in the live DOM (not just asserted in a unit test), true keyboard-only operability (a separate check from the debug-hook-driven scenarios, so convenience access couldn't stand in for the actual input path), a repeated rapid-churn + pause/resume battery against the same dispose/rebuild path this project has had two prior Blocker-severity bugs in, and a forced real network failure of a truck asset. All checks passed with no defects found.

**This is a recommendation only — I am not the approver.** I'd recommend this feature is ready for final sign-off. Please review the evidence above — particularly the AC4/AC8 preview-vs-driving-scene screenshots and the churn/pause/resume and forced-failure results given this project's history with issues #18, #21, and #31 — before giving final approval.

**This is a recommendation only — I am not the approver.**
