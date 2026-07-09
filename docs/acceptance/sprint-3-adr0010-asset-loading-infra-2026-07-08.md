# Acceptance Report — Sprint 3, ADR 0010 Asset Loading Infrastructure (Pass 1)

**Date:** 2026-07-08
**Scope:** `docs/architecture/0010-art-asset-pipeline-and-loading.md` §1-§7, against the developer's Pass-1 implementation (commit `d3a58e6`, confirmed pushed to `main`): `AssetRegistry` (`src/render/assets/asset-registry.ts`), `createUpgradableObject` (`src/render/assets/upgradable-object.ts`), the pure gate/budget logic (`src/core/assets/gate.ts`, `budget.ts`), the typed manifest (`src/render/assets/manifest.ts`), the `main.ts` BUILDER→DRIVING truck-asset gate wiring, and the `vite.config.ts` `assetsInlineLimit: 0` fix. This is infrastructure-only, tested against one tiny placeholder `.glb` fixture, not production art (ADR 0011 replaces the fixture with real truck models). AC references are the shared vehicle-art AC10-AC13 NFR (`docs/requirements/vehicle-and-character-art.md`), which this ADR was written to satisfy.

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Summary, up front

**No defects found.** The developer's existing tests (21 across `gate.test.ts`, `asset-registry.test.ts`, `upgradable-object.test.ts`) were reviewed critically and found substantive, not padding — real boundary assertions (gate at exactly 2999ms/3000ms), a real dedup assertion (mock call-count, not just cache presence), and a real disposal assertion (spying on `.dispose()` itself, not inferring it from scene-graph absence). Three genuine coverage gaps were closed this pass (3 new tests, 355 → 358 passing). All scenarios were independently re-verified against the real running app in a real browser (Edge via `puppeteer-core`, temporarily installed for this pass and removed afterward), including forcing the truck's `.glb` request to hang or fail at the network level — something neither the unit tests nor (per the developer's own scope note) the manual smoke test exercised, since the tiny fixture loads too fast over a real connection to naturally hit the 3s gate or a real failure path.

## How this was validated

**(a) Code inspection** — `src/core/assets/gate.ts`, `budget.ts`, `src/render/assets/asset-registry.ts`, `upgradable-object.ts`, `manifest.ts`, `src/render/scene.ts` (the Pass-1 demo probe wiring), `src/main.ts` (the gate call site and its interaction with the existing #18/#21 dispose/recreate + re-entrancy guards), `vite.config.ts` — against ADR 0010 §1-§7.

**(b) Review of the developer's existing tests (critical read, not rubber-stamp).**
- `gate.test.ts`: `truckGateShouldProceed` boundary tests assert both sides of the 3000ms threshold explicitly (`2999→false`, `3000→true`, inclusive). Verdict: substantive.
- `asset-registry.test.ts`: the load-once/dedup test uses a `vi.fn()` call-count assertion (`toHaveBeenCalledOnce()`), not just "same object returned" — a real regression in the dedup guard (`if (this.cache.has(key)) return;`) would be caught. I confirmed this directly (see (c) below) by deliberately breaking dedup and watching the test fail with "expected called once, got 2 times." The "never-prefetched key resolves immediately" behavior the task flagged as a subtle contract was already covered by name (`treats a key that was never load()-ed as already-settled rather than blocking forever`).
- `upgradable-object.test.ts`: the disposal test spies on `geometry.dispose`/`material.dispose` directly on the retired primitive, so it actually proves disposal happens, not merely that the primitive left the scene graph. The add-before-remove ordering test instruments `scene.add` to record call order. Both are real, not tautological.
- **Gaps found and closed** (see (c)):
  1. No test proved `waitFor()` waits for *every* key, not just the first to settle — a `Promise.all`→`Promise.race` regression would have passed the whole suite silently.
  2. No test proved a load that settles *after* the gate's 3s timeout has already elapsed still transitions to `'ready'` afterward (the mechanism that makes a later upgrade-in-place possible even though this particular gate gave up).
  3. No test proved a second `waitFor()` call for an already-settled key (the exact shape of a second BUILDER→DRIVING entry via pause/resume) resolves immediately rather than re-waiting.

**(c) New tests added this pass** (`src/render/assets/asset-registry.test.ts`, 3 new tests, suite 355 → 358 passing):
1. `waits for every key to settle, not just the first -- a fast key settling early does not short-circuit the gate while a slower key is still pending`
2. `a load that settles after the gate already timed out still becomes ready afterward, so a later upgrade-in-place is possible even though this gate gave up on it`
3. `a second waitFor() call for a key that already settled on a previous gate resolves immediately (re-entering DRIVING a second time must not re-wait)`

I verified these are not vacuous by deliberately introducing two real regressions and confirming the new tests catch them, then reverting:
- Disabled the `load()` dedup guard → the *existing* dedup test failed as expected (`expected "spy" to be called once, but got 2 times`).
- Changed `Promise.all` → `Promise.race` in `waitFor()` → my *new* multi-key test failed as expected (`expected true to be false`).

Both reverted; `git diff` on `asset-registry.ts` after cleanup shows no changes — only the test file is modified. Ran `npx vitest run` before and after: 355/355 → 358/358, no regressions. `npm run build` succeeds (pre-existing >500kB chunk-size warning only, unrelated to this pass — the `.glb` itself emits as its own 2.00 kB file, confirming `assetsInlineLimit: 0` works).

**(d) Independent live verification** — `npm run build && npx vite preview`, driven via `puppeteer-core` (installed with `--no-save`, uninstalled afterward — confirmed `package.json`/`package-lock.json` untouched throughout via `git status`) against the system's real Edge (`msedge.exe`), real DOM/GameStore/three.js/Rapier, not mocked. A temporary debug hook (`window.__qa = { store, assetRegistry, TRUCK_GATE_ASSET_KEYS }`) was added to `src/main.ts` for this pass only, then removed — confirmed via `git diff src/main.ts` (empty) and a fresh `npm run build` producing the **byte-identical output hash** (`index-CuXdS6K7.js`) as the very first build made before the hook was added, matching this project's established disclosed-and-reverted convention.

Scripts (scratch-only, not committed, in the session scratchpad directory): `qa-independent-assets-adr0010.mjs`, `qa-gate-timeout-live.mjs`, `qa-pause-resume-battery.mjs`, plus two throwaway debug scripts (`dump-buttons.mjs`, `dump-overlay.mjs`) used to fix a methodology bug (below).

---

## ADR 0010 §1-§7 — decision-by-decision

**§1 (`.glb` via `GLTFLoader`, no Draco/KTX2 this sprint).**
- Status: **MET (code + build verification).** `npm run build` confirms the `.glb` is emitted as its own fingerprinted file (`test-fixture-cube-Du_KEOL_.glb`, 2.00 kB), served with `Content-Type: model/gltf-binary` (confirmed via `curl -I` against the actual preview server), never inlined into `index-*.js`.

**§2 (CC0 sourcing).**
- Status: **N/A for Pass 1** — infrastructure only, no production art sourced yet (ADR 0011's scope).

**§3 (perf/bundle budget, `core/assets/budget.ts`).**
- Status: **MET (code + tests, pre-existing coverage adequate).** `budget.test.ts` (5 tests, not modified this pass) covers the target/alarm thresholds; no gap found.

**§4 (prefetch-during-builder, bounded 3s truck gate, upgrade-in-place, everything-else-never-gates).**
- Status: **MET — code + tests + independent live verification, including the two riskiest sub-scenarios the task specifically called out.**
- Evidence: (c) closes the "settles after timeout" and "never-prefetched-resolves-immediately" contract gaps at the unit level. (d) **Independent live, forcing real network conditions the tiny fixture can't naturally produce**:
  - **Gate timeout, forced via a hung `.glb` request** (`qa-gate-timeout-live.mjs`, Puppeteer request interception that never calls `continue()`/`abort()`): DRIVING entry (confirmed via the loading-indicator overlay's `style.display` flipping back to `'none'`, not `store.screen` — see methodology note below) took **3070ms**, squarely in the expected 2800-4500ms window for a 3000ms gate; asset status was still `'pending'` at entry (load still in flight, fallback correctly used), no console/page errors.
  - **Gate short-circuit on failure, forced via `req.abort()`**: DRIVING entry took **88ms** (did not wait out the 3s gate on an immediate rejection), asset status `'failed'`, no console/page errors, no thrown exception from the "never throws" contract.
  - **Upgrade-in-place over a real network fetch** (`qa-independent-assets-adr0010.mjs`, real unthrottled `.glb` load): asset reached `'ready'` within 1ms of the DRIVING entry check (fixture is tiny), zero page errors or thrown exceptions during the `tickEffects()` frame that performs `demoUpgradeProbe.upgrade(model)` (scene.add/remove/dispose all executed without incident against real three.js objects, not mocks).
  - **Only console output across every live run**: one `404` for `/favicon.ico` (confirmed via a dedicated `check-404.mjs` response-status dump) — unrelated, not a product defect, consistent with the same non-issue the prior Sprint 2 acceptance report flagged.

**§5 (loading indicator: bounded, kid-friendly, dismissed on ready or timeout).**
- Status: **MET (live verification).** Confirmed the overlay (`"Getting your truck ready…"`) shows on gate entry and hides again once the gate resolves (both on timeout and on real settle), via direct `style.display` polling.

**§6 (asset location/manifest, `AssetRegistry` lifetime is app-lived not session-lived).**
- Status: **MET — code + tests + independent live verification, the ADR's own flagged highest-risk item for this pass.**
- Evidence: (c) the new "second `waitFor()` call resolves immediately" unit test pins this exact contract. (d) **Independent live — pause/resume + gate interaction, the specific scenario the task asked for the deepest scrutiny on** (`qa-pause-resume-battery.mjs`):
  - **Rapid pause↔resume battery** (6 cycles, no waits between clicks, now with the async gate on every resume): ended cleanly in `DRIVING`, zero errors — confirms the existing #21 re-entrancy guard (`startingDriving`, set synchronously before the gate's first `await`) still holds across the new async gap.
  - **Pause fired while the gate is still pending** (hung `.glb`, paused ~300ms into a 3s wait, then left alone): `store.screen` correctly stayed `'BUILDER'` even after the stale gate's 3s timeout elapsed in the background — confirming `main.ts`'s `if (store.screen !== 'DRIVING') { startingDriving = false; return; }` guard correctly prevents a now-stale gate from silently constructing a phantom driving session behind the player's back. This is exactly the race the task flagged as worth real scrutiny, and it held.
  - A genuine resume-after-that (still with the `.glb` hanging) was also exercised; the timing figure from that specific measurement is unreliable for the reason disclosed below, but no errors, no phantom sessions, and the app remained responsive.

**§7 (fallback/failure: never-throw, per-asset isolation, texture fallback).**
- Status: **MET (code + tests + independent live verification).** Unit tests cover the 404/rejection path (`transitions pending -> failed and never throws`) and per-asset isolation (`good`/`bad` keys independent). Live: the forced `req.abort()` scenario above is the automated-and-live confirmation the task specifically asked for, beyond the developer's manual smoke test — status correctly becomes `'failed'`, one `console.warn`, no throw, game remains responsive.

---

## Methodology correction, disclosed (per project convention)

One mistake in my own first-draft live script, caught and fixed before this report was written:
- **First attempt at measuring gate-resolution time** used `store.screen === 'DRIVING'` as the "gate resolved" signal. This is wrong: `store.screen` flips to `'DRIVING'` **synchronously** inside `confirmBuild()`/`resumeDriving()`, before `beginDrivingSession()`'s `await assetRegistry.waitFor(...)` has resolved — so polling `store.screen` alone reports the gate as "done" in ~20ms regardless of how long the actual asset wait takes. This produced a false "gate resolved almost instantly even with a hung request" result on the first two runs of `qa-gate-timeout-live.mjs`. Root-caused by checking `main.ts`'s subscriber logic (§4/§6 sections above) and switching the live signal to the loading-indicator overlay's `style.display`, which is driven directly by `beginDrivingSession()`'s `loadingIndicator.show()`/`hide()` calls straddling the actual `await`. A second, smaller bug in that fix (matching on `div.textContent.includes(...)`, which matched `#app` itself since `textContent` concatenates all descendant text) was caught via a throwaway `dump-overlay.mjs` and fixed by matching on exact trimmed text instead. Neither was a product defect — both were my own instrumentation mistakes, disclosed here per this project's established convention (matching the Sprint 2 pause-resume acceptance report's precedent).

---

## Summary table

| ADR 0010 item | Status |
|---|---|
| §1 Format (`.glb`, no compression this sprint) | Met (code + build verification) |
| §2 Sourcing | N/A this pass (no production art yet) |
| §3 Perf/bundle budget math | Met (pre-existing tests adequate) |
| §4 Prefetch + bounded 3s gate + upgrade-in-place | **Met — code+tests+independent live, including a forced-hang and forced-failure live test the tiny fixture can't naturally trigger** |
| §5 Loading indicator | Met (live verification) |
| §6 `AssetRegistry` app-lived lifetime / pause-resume gate re-entry | **Met — code+tests+independent live, the ADR's own flagged highest-risk item, including the specific stale-gate-during-pause race** |
| §7 Fallback/failure never-throw, per-asset isolation | Met — code+tests+independent live (automated abort, not just manual smoke test) |

**No defects found this pass. No GitHub issues filed.**

---

## Recommendation, not approval

ADR 0010 Pass 1's asset-loading infrastructure — `AssetRegistry`, `createUpgradableObject`, the gate/budget pure logic, and the `main.ts` wiring — is **soundly implemented at the code, unit-test, and independent live-verification level**, with no defects found. Given this is a new async layer touching the exact lifecycle that caused issues #18/#21, I independently forced conditions the developer's tiny-fixture manual smoke test couldn't naturally produce (a hung network request to genuinely exercise the 3s timeout, an aborted request to genuinely exercise the failure path, and a pause fired mid-gate to genuinely exercise the stale-gate race) rather than trusting that a fast local fixture load was representative. All checks passed. I also closed three genuine unit-level coverage gaps (multi-key gate correctness, post-timeout late-settle behavior, and second-entry gate re-use) and verified each catches a real regression before counting it as coverage.

Two known, pre-disclosed limitations carried over from the ADR itself, not defects: this pass tests against a placeholder fixture, not production art (ADR 0011's scope), and the demo upgrade probe in `scene.ts` is explicitly temporary infrastructure-proof code the developer flagged for deletion once real truck models exist.

**This is a recommendation only — I am not the approver.** I'd recommend this feature is ready to proceed to code review. Please review the evidence above — particularly the §4/§6 live results given this project's history with issues #18 and #21 — before giving final sign-off.

**This is a recommendation only — I am not the approver.**
