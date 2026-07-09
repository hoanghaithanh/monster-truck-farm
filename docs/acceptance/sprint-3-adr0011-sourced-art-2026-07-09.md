# Acceptance Report — Sprint 3, ADR 0011 Sourced Truck Art (issue #33)

**Date:** 2026-07-09
**Scope:** Re-validation of `docs/requirements/vehicle-and-character-art.md` AC1-AC4/AC10-AC13 and `docs/requirements/truck-cosmetics.md` AC1-AC8 against commits `9bc29bf` ("Swap procedural truck art for sourced CC0/CC-BY low-poly models") and `a7db09a` ("Fix sourced-art follow-up visual defects: floating decals, invisible stripe, muddy tint") on `main`, both `code-reviewer`-reviewed clean (verdict: ready for acceptance validation; two non-blocking test-coverage tech-debt issues filed, #36/#37). This is the *second* validation pass against these ACs this sprint -- the first (`docs/acceptance/sprint-3-adr0011-truck-art-cosmetics-2026-07-09.md`) validated the same criteria against the disclosed procedural-primitive placeholder art (commit `097d6c5`); this pass re-validates against the real sourced Quaternius/Jarlan Perez glTF models that replaced it, per this project's ADR 0011 §2 "real CC0 swap later" follow-up. Also includes a design-reference visual check (`docs/designs/truck/design{1,2,3}.{jpg,png}`) and a CC-BY license-compliance check of `CREDITS.md`, both requested specifically for this pass.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call -- see the explicit ask at the end.

---

## Summary, up front

**No functional/correctness defects found. One pre-existing, non-blocking cosmetic-polish defect independently reproduced and filed as a new issue (#38).** All requirements ACs re-checked against the sourced art hold, including the disposal/lifecycle path (`beginDrivingSession`/pause/resume, ADR 0010 bounded gate) specifically re-verified against the new, meaningfully larger asset payloads (a body model is now up to 754 KB, vs a few KB for the old procedural primitives) rather than assumed to still hold from the prior pass's tiny fixtures. The visual read against the human-supplied design references is a genuine improvement over the primitive-box baseline -- these now read as real, recognizable trucks with a believable tier-upgrade feel, in the project's stylized-low-poly direction, not a pixel-match to the photoreal references (which was explicitly not the target).

Two specific open questions the human asked me to look at with my own eyes, not just re-trust code inspection:
1. **Tier-2 front wheel angle in the builder's small 3D preview** -- confirmed real, confirmed reproducible independently, confirmed cosmetic-only (does not affect the driving scene or gameplay). Filed as **[issue #38](https://github.com/hoanghaithanh/monster-truck-farm/issues/38)**, non-blocking.
2. **Decal legibility (flame accent / racing stripe)** -- confirmed small/subtle as the developer described. My judgment: acceptable given cosmetics are explicitly no-stat/no-gameplay-impact per `truck-cosmetics.md`, but flagged prominently below for the human's own visual judgment call, not silently waved through.

## How this was validated

**(a) Code inspection** -- `src/render/truck-rig.ts` (`paintBody`/`paintWheel`/`tintByMaterialName`/`removeBuiltinWheelNodes`, the "Atlas"/"mat22"/"mat23" material-name-targeted painting this pass introduced), `src/render/truck-sockets.ts` (the re-derived per-tier `bodyScale`/`wheelScale`/socket offsets, including the `a7db09a` design-socket-Y fix), `src/render/cosmetics/cosmetic-manifest.ts` (`getBodyColorTintMaterial`/`getWheelRimTintMaterial`'s additive-emissive tint fix for issue #35, `buildFlameDecal`/`buildStripeDecal`), `src/render/assets/manifest.ts`, `CREDITS.md` -- to understand what changed since the prior pass's validated baseline and where the new risk surface is (real glTF submesh/material-name coupling instead of primitive-geometry whole-object painting).

**(b) Full existing test suite** -- `npx vitest run`: **413/413 passing**, 31 files (up from the prior pass's 398, reflecting `a7db09a`'s new coverage). `npm run build` succeeds cleanly (`tsc --noEmit` + `vite build`); all real `.glb` files emit as their own fingerprinted assets (2.0 kB - 754.25 kB raw), never inlined into the JS chunk (`vite.config.ts`'s `assetsInlineLimit: 0` still holds against much larger payloads than the pipeline was originally exercised with).

**(c) Independent live verification** -- `npm run build && npx vite preview` (port 4322, base path `/monster-truck-farm/`), driven via `puppeteer-core` (installed with `--no-save`, confirmed via `git status`/`git diff` that `package.json`/`package-lock.json` were untouched throughout, uninstalled after) against the system's real Edge (`msedge.exe`), real DOM/GameStore/three.js/Rapier, not mocked. A temporary debug hook (`window.__qa = { store, assetRegistry }`) was added to `src/main.ts` for this pass only, then reverted via `git checkout -- src/main.ts` -- confirmed via `git status --short` (clean) and a post-revert `npx vitest run` (413/413, no regression).

Scripts (scratch-only, run from the repo root so `node_modules` resolved, deleted after the run, confirmed via `git status --short` showing no untracked `.mjs` files): `qa-sourced-art-acceptance.mjs` (tier progression, cosmetics, decal legibility, tier-2 wheel-angle screenshots, rapid churn + confirm/pause battery), `qa-disposal-and-fallback.mjs` (forced network abort, forced network hang for the bounded-gate timing, rapid pause/resume battery against warm-cache real assets).

Screenshots saved under `docs/qa/screenshots/adr-0011-sourced-art-revalidation/` (17 images, committed):
- `builder-tier{0,1,2}-default.png` -- tier progression, default cosmetics.
- `builder-tier2-purple-flame-chrome.png`, `builder-tier2-blue-stripe-redrim.png` -- non-default cosmetic combinations at tier 2 (both required axes: body color, body design, wheel look).
- `zoom-tier2-purple-flame-chrome.png`, `zoom-tier2-blue-stripe-redrim.png` -- cropped close-ups of the preview thumbnail, used for the decal-legibility and wheel-angle judgment calls below.
- `driving-tier2-purple-flame-chrome.png`, `driving-tier0-default.png` -- driving-scene confirmation of the same builds (AC4/AC8).
- `driving-after-churn-1.png`, `driving-after-churn-2.png` -- driving scene after two rounds of rapid tier/cosmetic churn (12 then 8 iterations, no waits) followed by confirm, then pause and a second churn round followed by resume.
- `fallback-builder-body-tier2-failed.png`, `fallback-driving-body-tier2-failed.png` -- `body-tier-2.glb` request aborted at the network level; primitive-box fallback rendered in both the builder preview and the driving scene, real sourced wheel-tier-2 models still correctly attached around it.
- `fallback-driving-body-tier0-hung.png` -- `body-tier-0.glb` request hung indefinitely (never resolved/rejected); driving scene entered anyway via the bounded 3s gate, primitive fallback rendered.

**Methodology note, disclosed (repeat of a known trap):** my first attempt at measuring the bounded-gate timing under a hung request used `store.screen === 'DRIVING'` as the "gate resolved" signal, and got a false ~12ms result -- this is the exact same instrumentation mistake the `docs/acceptance/sprint-3-adr0010-asset-loading-infra-2026-07-08.md` report disclosed and corrected (`store.screen` flips synchronously inside `confirmBuild()`, before the real `await assetRegistry.waitFor(...)` resolves). Caught it because the result was implausible against a genuinely hung network request, and switched to polling the loading-indicator overlay's `style.display` (matching on the caption's exact trimmed text, avoiding that report's own second sub-bug of a `textContent`-based match picking up `#app` itself). Corrected measurement: **3016ms**, squarely in the expected ~2800-4500ms window for the 3000ms gate. Not a product defect -- my own instrumentation mistake, disclosed per this project's established convention.

Also disclosed: my first cosmetics script used the id `'flame'` instead of the real `BODY_DESIGN_OPTIONS` id `'flames'` (`src/render/cosmetics/cosmetic-manifest.ts` line 160) for the flame-accent screenshots -- `store.selectCosmetic('bodyDesign', 'flame')` silently no-ops (no validation, unrecognized id just doesn't match `buildDesignDecal`'s `if` chain, so no decal rendered and no error). This is arguably itself a minor un-flagged silent-failure surface (an invalid cosmetic id is accepted without warning), but it's pre-existing behavior unrelated to this pass's commits and not something either of these commits touched, so I'm not filing it as a new defect against `9bc29bf`/`a7db09a` -- noting it here for visibility rather than burying my own script bug silently. Corrected the id and re-ran; the flame decal is confirmed genuinely present.

---

## Requirements AC-by-AC — vehicle-and-character-art.md (re-validated against sourced art)

| AC | Description | Status | Evidence |
|---|---|---|---|
| **AC1** (body models differ per tier) | **MET, and improved.** | `builder-tier{0,1,2}-default.png`: three visually distinct, escalating body silhouettes -- now real truck-cab shapes (low pickup -> armored pickup -> full armored truck), not primitive boxes. Reads as "upgrading" more convincingly than the prior primitive-box pass. |
| **AC2** (wheel models differ per tier) | **MET.** | Same screenshots: tread pattern and radius visibly escalate tier-over-tier (smooth tire -> knobby off-road tire at two scales, per CREDITS.md's disclosed 2-mesh/3-tier design). |
| **AC3** (engine/gas-tank cue, not full remodel) | **MET.** | Small distinct roll-bar/pole and tank-colored block props visible on/beside the body in every tier-2 screenshot, clearly not a body remodel; unchanged from the prior pass's finding (this commit didn't touch engine/gas-cue assets). |
| **AC4** (builder preview == driving-scene asset) | **MET -- structurally and by live observation.** | Code: both call sites still route through the single `buildTruckRig()` (unchanged architectural guarantee). Live: `builder-tier2-purple-flame-chrome.png` -> `driving-tier2-purple-flame-chrome.png` show the same body shape, tint, decal, and wheel look. |
| **AC10** (perf budget, ~5MB gzipped ceiling) | **MET, smaller margin than before but still comfortable.** | The sourced models are ~30x larger than the old procedural placeholders (`body-tier-2.glb` alone is 754 kB raw vs 11 kB before). Manifest's `approxGzipBytes` for the 12 truck-art assets now sums to noticeably more than the prior pass's ~23.8 KB, but `npm run build`'s reported gzip figures for the largest assets (body-tier-1 ~603 kB raw, body-tier-2 ~754 kB raw) are still well under the 1.5 MB `ASSET_BUDGET_TARGET_GZIP_BYTES` alarm threshold individually, and nowhere near the combined 5MB ceiling even summed. Not independently re-spot-checked via `gzip -c \| wc -c` this pass (the prior pass's spot-check methodology) -- recommend a human or a follow-up pass re-run that specific check now that payloads are meaningfully larger, since "nowhere near the ceiling" was true by a much bigger margin before. |
| **AC11** (builder first paint not blocked) | **MET (structural, re-confirmed against real assets).** | `buildTruckRig` still always returns a usable group immediately via `resolvePart`'s fallback-per-part -- unchanged by this commit's material/scale changes, and now proven against much larger real payloads via the forced-hang scenario below (the builder never blocked while `body-tier-0.glb` hung indefinitely). |
| **AC12** (bounded loading indicator, 3s timeout, never a silent freeze) | **MET, re-confirmed against real asset sizes, corrected methodology.** | With `body-tier-0.glb` forced to hang indefinitely (never resolves or rejects), DRIVING entry (measured via the loading-indicator overlay, not `store.screen` -- see methodology note above) took **3016ms**, squarely matching the expected `TRUCK_GATE_TIMEOUT_MS = 3000` window. `assetRegistry.status('body-tier-0')` was still `'pending'` at entry (fallback correctly in use), no hang, no crash. This specifically re-answers the human's ask #2: the bounded gate holds against the new, meaningfully bigger sourced payloads, not just the old few-KB fixtures. |
| **AC13** (asset failure never crashes) | **MET, live-forced against a real sourced-art file.** | Aborting `body-tier-2.glb`'s network request produced exactly one `console.warn` (`AssetRegistry: failed to load "body-tier-2" ... TypeError: Failed to fetch`), `assetRegistry.status('body-tier-2') === 'failed'`, gate short-circuited in ~51ms (did not wait out the 3s timeout on an immediate rejection, matching the ADR 0010 Pass-1 precedent's ~88ms figure), and a rendered primitive-box fallback in both the builder preview (`fallback-builder-body-tier2-failed.png`) and the driving scene (`fallback-driving-body-tier2-failed.png`) -- with the real sourced wheel-tier-2 models still correctly attached around the fallback box, confirming per-part failure isolation holds even when one real sourced part fails and its siblings succeed. No thrown exception, no crash. Only other console output across every live run in this pass was the pre-existing, unrelated `favicon.ico` 404. |

AC5-AC9 (chicken/farmer art) remain out of scope -- unaffected by this commit.

## Requirements AC-by-AC — truck-cosmetics.md (re-validated against sourced art's new tint/decal mechanism)

| AC | Description | Status | Evidence |
|---|---|---|---|
| **AC1** (cosmetic selection never changes stats) | **MET.** | Unchanged mechanism (`_cosmetics` never read by `resolveSpec()`); this commit only changed *how* the paint is applied (material-name-targeted tint vs whole-object replacement), not whether it affects stats. Stat labels unchanged across cosmetic changes in every screenshot. |
| **AC2** (cosmetic UI structurally distinct) | **MET.** | Unaffected by this commit -- same "🎨 Paint & style" panel structure visible in every screenshot. |
| **AC3** (keyboard-operable) | **MET (carried over, not independently re-driven with a keyboard-only script this pass).** | This commit did not touch `src/ui/builder.ts`'s input handling, only the rendering/painting layer downstream of `store.selectCosmetic()`; the prior pass's keyboard-only live verification (`docs/qa/screenshots/adr-0011-truck-art-cosmetics/09`/`10`) already independently proved the input path itself, and nothing in this diff touches that path. Not re-run this pass since the specific risk surface introduced by this commit (real-model material targeting) has nothing to do with input handling. |
| **AC4** (cosmetic asset-load failure fallback) | **N/A, by design, same as before.** | Cosmetics are still flat-color/decal materials from an in-memory manifest, not network-loaded. |
| **AC5**/**AC6** (full palette selectable regardless of owned/equipped tier) | **MET.** | Confirmed live: with only tier-0 body/wheels equipped, all 5 body colors, all 3 designs, all 3 wheel looks were selectable and applied without ownership checks (unchanged code path, `actOnCosmetic` still never calls `owned()`). |
| **AC7** (tier change carries over cosmetics cleanly, never crashes) | **MET, and specifically stress-tested against the new, much larger real asset payloads.** | Two rounds of rapid tier + cosmetic churn (12 then 8 iterations, zero waits between calls, cycling body/wheel/engine/gas-tank tiers and all three cosmetic axes) each followed by `confirmBuild()`/pause/further-churn/resume, ended cleanly in `DRIVING` both times (`driving-after-churn-1.png`, `driving-after-churn-2.png`), zero console errors beyond the known favicon 404, no visibly broken/missing geometry -- this specifically re-answers the human's ask #2 about the disposal path (`TruckRigResult.dispose()`/rebuild) holding under real asset-loading timing rather than the old near-instant tiny fixtures. A separate, tighter 6x rapid pause/resume battery (`beginDrive()`/`pauseToBuilder()` alternated with no waits, on already-cached real assets) also ended cleanly in `DRIVING`, re-confirming the issue #21 re-entrancy guard holds against this commit's new async asset-loading timing profile, not just the old near-instant one. |
| **AC8** (builder cosmetic choice reflected identically in driving scene) | **MET.** | Same single-`buildTruckRig`-path argument as vehicle-art AC4; live-confirmed `builder-tier2-purple-flame-chrome.png` -> `driving-tier2-purple-flame-chrome.png`. |

---

## The two specific open questions

### 1. Tier-2 ("Monster") front wheel angle in the builder's small 3D preview

**Confirmed real, independently reproduced.** In a completely fresh live session (not reusing the developer's own screenshots), the tier-2 body's front-facing wheel visibly sits apart from the body with a real gap and an angle that doesn't read as "mounted," specifically in the builder's small 3D preview thumbnail at its default oblique camera angle (`builder-tier2-default.png`, `builder-tier2-purple-flame-chrome.png`, `zoom-tier2-purple-flame-chrome.png`). This reproduces with both the developer's fix-pass cosmetics (purple/flames/chrome) and a second, independently-chosen cosmetic combination (blue/stripe/red-rim) -- not a one-off camera-angle fluke.

**Confirmed cosmetic-only, not gameplay-visible.** The driving scene's top-down/chase camera (`driving-tier2-purple-flame-chrome.png`) shows all four wheels symmetrically and correctly attached with no visible gap -- this defect appears specific to the interaction between the tier-2 socket offset and the builder preview's particular close/oblique camera angle, not a socket error large enough to matter during actual gameplay.

**My judgment:** worth filing, not worth blocking. It's a real, reproducible visual rough edge in a small thumbnail that a player might notice while shopping for their tier-2 truck, but it doesn't affect the driving experience, doesn't affect any AC's pass/fail (none of AC1/AC2/AC4/cosmetics-AC8 require the *preview camera angle specifically* to look flawless, only that the same asset renders in both places), and code-reviewer already correctly judged it non-blocking when they flagged it during review. Filed as **[issue #38](https://github.com/hoanghaithanh/monster-truck-farm/issues/38)** with a suggested fix direction (re-derive the tier-2 front-wheel socket against real mesh vertices, same technique `a7db09a` already used for the design-decal-socket fix).

### 2. Decal legibility (flame-accent / racing-stripe)

**Confirmed small/subtle, matching the developer's own self-assessment.** Both decals are now genuinely attached to the body (the `a7db09a` fix is real and holds -- no floating/invisible decal reproduced in this pass), but at the game's normal viewing distances (both the builder preview and the driving-scene chase camera), the flame accent renders as a small orange cluster roughly the size of a fingertip against the body's roofline, and the racing stripe as a thin light-colored line along the roof centerline that's easy to miss without already knowing to look for it. Neither clearly reads as a recognizable "flame" or "stripe" *shape* from a normal viewing distance -- more like "there's a small colored accent up there" than "that's a racing stripe."

**My judgment:** acceptable, not a defect worth blocking or filing, but flagging prominently per the ask rather than silently deciding on the human's behalf. `docs/requirements/truck-cosmetics.md` explicitly frames cosmetics as "just for looks... no cost, no stats" -- the lowest-stakes category of this feature by the requirements doc's own framing -- and both decals are objectively present, attached, and distinguishable from "plain" on closer inspection (which is what AC7's "carries over cleanly" and this pass's churn testing actually verify). Whether "a young child would notice/recognize the specific shape at a glance" clears this project's actual bar for a cosmetic feature is a product-taste call, not a correctness one -- I'd defer to the human's own look at `zoom-tier2-purple-flame-chrome.png` and `zoom-tier2-blue-stripe-redrim.png` before deciding whether this needs a follow-up (e.g., a size increase or an outline for contrast) or is fine as-is.

---

## CC-BY attribution (license-compliance check)

**MET.** `CREDITS.md` at the repo root contains a dedicated section ("Truck body/wheel models (ADR 0011, issue #33 follow-up)") with:
- The 3 Quaternius CC0 body models named, sourced (poly.pizza links), and licensed (CC0 1.0, credited anyway as good practice despite not being required).
- The 2 Jarlan Perez CC-BY wheel models named, sourced, and licensed, **including the actual required attribution text** in blockquote form: `"Vehicle Tire" and "Truck Tire" by Jarlan Perez, licensed under CC-BY 3.0, via poly.pizza.` -- this is a real, substantive attribution string (name + license + source), not just a bare link, satisfying CC-BY 3.0's attribution requirement.
- A disclosed trade-off note (tiers 1 and 2 both reuse the "Truck Tire" mesh at different scales rather than two distinct meshes) -- documented as an intentional decision, not silently hidden.

No compliance gap found. This was checked as a real license-compliance read (does the required attribution text actually exist and actually name the correct license), not merely a "does the file exist" code-quality check.

---

## Disposal/regression-history-specific checks (per this project's #18/#21/#31 history), re-verified against real asset-loading timing

This is the item the human specifically asked to not take on faith from the prior pass's tiny-fixture results:

- **Bounded 3s gate under a genuinely hung real-asset request:** `body-tier-0.glb` (37.6 kB body... actually 273 kB for tier 0's body -- the wheel models are the smaller ~37-41 kB files) intercepted to hang forever -- DRIVING entry still resolved at **3016ms** (measured via the loading-indicator overlay, not the earlier-flip `store.screen`), asset status correctly still `'pending'`, fallback correctly rendered (`fallback-driving-body-tier0-hung.png`), no crash, no hang beyond the bounded window.
- **Fast failure short-circuit against a real sourced-art file:** `body-tier-2.glb` (754 kB, the largest single asset in this pass) aborted outright -- gate resolved in ~51ms, did not wait out the timeout, one `console.warn`, status `'failed'`, clean primitive fallback with the real sourced wheel-tier-2 models still correctly attached around it in both the builder and driving scene.
- **Rapid tier/cosmetic churn (20 total iterations across two rounds) + confirm/pause/resume, real cached asset sizes:** ended cleanly in `DRIVING` both times, zero console errors beyond the known favicon 404, no visibly broken geometry -- exercises `TruckRigResult.dispose()`'s fallback-only-disposal/shared-geometry-non-disposal contract repeatedly under real (not near-instant tiny-fixture) load timing.
- **6x rapid pause/resume battery, no waits between cycles:** ended cleanly in `DRIVING`, re-confirming the issue #21 re-entrancy guard (`startingDriving`, set synchronously before the gate's first `await`) holds against this commit's real asset-loading latency profile, not just the old near-instant one.

All four scenarios passed with no defects. This directly answers the human's ask #2: the ADR 0010 bounded gate, fallback-on-failure, and the #18/#21/#31-history disposal path all continue to hold now that the assets behind them are genuinely large enough to have real load timing, not the prior pass's few-KB fixtures that loaded too fast to naturally exercise these paths.

---

## Summary table

| Requirement AC | Status |
|---|---|
| vehicle-art AC1 (body models per tier) | Met, visual quality improved over primitive baseline |
| vehicle-art AC2 (wheel models per tier) | Met |
| vehicle-art AC3 (engine/gas-tank cue) | Met (unaffected by this commit) |
| vehicle-art AC4 (preview == driving asset) | Met |
| vehicle-art AC10 (perf budget) | Met, margin smaller than before -- recommend a follow-up gzip spot-check |
| vehicle-art AC11 (builder first paint not blocked) | Met, re-confirmed against real asset sizes |
| vehicle-art AC12 (bounded loading indicator) | Met, re-confirmed at 3016ms against a genuinely hung real-asset request |
| vehicle-art AC13 (asset failure never crashes) | Met, live-forced against a real 754 kB sourced-art file |
| cosmetics AC1 (no stat impact) | Met |
| cosmetics AC2 (UI section separation) | Met (unaffected) |
| cosmetics AC3 (keyboard-operable) | Met (carried over, not re-driven -- input path untouched by this commit) |
| cosmetics AC4 (cosmetic asset failure fallback) | N/A (not network-loaded) |
| cosmetics AC5/AC6 (full palette any tier) | Met |
| cosmetics AC7 (tier-change carry-over, no crash) | Met, stress-tested with 20 rapid churn iterations against real asset sizes |
| cosmetics AC8 (builder == driving cosmetics) | Met |
| Visual check vs. `docs/designs/truck/` references | Reads as a real, recognizable truck with a meaningful tier upgrade -- human-confirmed target met |
| Tier-2 front wheel angle (open question #1) | Real, reproduced, cosmetic-only -- filed as issue #38, non-blocking |
| Decal legibility (open question #2) | Small/subtle as developer described -- acceptable given cosmetics' explicit no-stakes framing, flagged for human's own visual judgment |
| CC-BY attribution (`CREDITS.md`) | Met -- real attribution text present and correctly names license + source |

**No functional defects found this pass. One new non-blocking cosmetic-polish issue filed: [#38](https://github.com/hoanghaithanh/monster-truck-farm/issues/38).** Pre-existing non-blocking issues from code-reviewer's pass (#36, #37, test-coverage tech debt) are unaffected by this validation and not re-litigated here.

---

## Recommendation, not approval

The sourced-art swap (commits `9bc29bf`, `a7db09a`, closing out issue #33) **holds up under the same rigor as the prior procedural-art acceptance pass, re-applied specifically against the new risk surface this change introduces**: real glTF submesh/material-name-targeted painting instead of whole-object primitive painting, and asset payloads roughly 30x larger than what the disposal/bounded-gate infrastructure had previously been proven against. I did not assume the ADR 0010 gate/disposal guarantees "still obviously hold" because the code looks structurally similar -- I re-forced a genuine network hang and a genuine network abort against the actual new files (754 kB and 273 kB respectively) and re-measured the bounded gate's timing with corrected methodology, specifically because this project's own history (#18, #21, #31, and the ADR 0010 Pass-1 report's own disclosed measurement bug that I re-encountered and had to re-fix) is that this exact class of async/lifecycle bug survives clean review and passing unit tests. All four disposal/lifecycle scenarios passed.

The two open questions the human flagged for independent eyes both got independent eyes, not a rubber-stamp of the developer's own screenshots: the tier-2 wheel-angle issue is real and now tracked (#38), and the decal-legibility question is answered with my own judgment stated plainly (acceptable-but-flagged) rather than silently resolved either way.

**This is a recommendation only -- I am not the approver.** I'd recommend this feature is ready for final sign-off, with the caveat that issue #38 is left open as tracked, accepted debt (not something blocking sign-off) and the decal-legibility judgment call in particular is one I'd like the human to look at with their own eyes (`docs/qa/screenshots/adr-0011-sourced-art-revalidation/zoom-tier2-purple-flame-chrome.png` and `zoom-tier2-blue-stripe-redrim.png`) before giving final approval, since "does a young child notice/recognize this" is a product-taste judgment I can describe but shouldn't unilaterally decide.

**This is a recommendation only -- I am not the approver.**
