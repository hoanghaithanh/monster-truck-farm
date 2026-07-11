# Acceptance Report — Terrain Expansion & Visual Hills (issue #49, ADR 0017)

Date: 2026-07-11
Validator: test-engineer
Scope: `docs/requirements/terrain-expansion-and-hills.md` AC1-AC10, validated against the current tip of `main` at the time of this pass (implementation + unit tests + code review already complete and clean per the hand-off). This pass covers the acceptance criteria the hand-off flagged as unprovable by unit tests alone — the visual/experiential ones — plus a full regression sweep.

## Method

- `npm run test` (Vitest): 563/563 passing, unchanged from the hand-off.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npm run build` (real production build via `tsc + vite build`): clean, served via `npx vite preview --port 4401`.
- Live-driven via `puppeteer-core` against the real system Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless), following this project's established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue #29/#48 acceptance passes' method sections).
- A temporary, read-only QA debug hook was added to `src/main.ts` (`window.__qa`: per-frame telemetry of truck position/heading/climb `{lift,pitch,roll}`, `store.coins`/`store.hitsRemaining`, a `teleport(x,z)` helper to reach distant map regions without multi-minute real-time drives, an animal-spawn log, and a `terrainHeightAt(x,z)` passthrough) and `src/render/scene.ts` (a `debugPick`/`debugCamera` raycast helper used only for defect triage, see below). **Both hooks were fully reverted before concluding this pass** — confirmed via `git diff src/main.ts src/render/scene.ts` showing no QA-hook text remaining, and `npm run test` (563/563), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert (all three re-confirmed at the top of this section).
- The `teleport` helper only calls the same `TruckController.setPosition` + a single `world.step()` the game's own boundary-clamp path already uses (`src/systems/driving-system.ts`) — it does not bypass or alter any driving/physics code path, only lets this pass reach far corners of the now-100×100 map without an impractically long real-time drive.
- Six driving sessions against the real build, using keyboard-event dispatch (`KeyW`/`A`/`S`/`D`, matching `KeyboardInput`'s real key-code mapping) plus the teleport helper for cross-map jumps:
  1. Builder → driving start, baseline HUD/state screenshot.
  2. An ordinary forward-and-turn drive out from spawn into open, previously-empty map area (AC5/AC10).
  3. A teleport-assisted approach to the mountain landmark for a hills-vs-mountain scale comparison (AC6).
  4. A sustained, varied-heading (9-leg, alternating W/A/D) drive across multiple hills with full per-frame telemetry capture (AC7/AC8).
  5. A teleport-assisted sweep to each of the three obstacles, four structures (incl. mountain), and the river (AC3).
  6. A longer loosely-driven session (24 legs) to observe live spawn placement across the full map (AC4), plus direct `terrainHeightAt` sampling at obstacle/structure/open-field coordinates.
- **Defect triage side-investigation:** an initial visual read of two screenshots (near the barn and near the mountain) showed what looked like a solid black wedge/hole in the ground — the exact class of defect this project's CLAUDE.md flags as screenshot-only-catchable (the prior invisible-river/near-black-mountain incidents). This was **not** assumed to be fine or logged as a defect on sight — it was root-caused live using the temporary raycast hook (`debugPick`) plus direct pixel sampling (`npm install jimp --no-save`, reverted after use — see below) before writing this report. See AC3 for the finding: it was the barn/mountain's own pre-existing dark-shaded material facets (raycast-confirmed hit on `Barn_Cube005-Mesh`, color `#4f4f4f`/`#7c3a32`, not the ground), not a hill-displacement defect. `jimp` and `puppeteer-core` were installed via `npm install --no-save` (ephemeral dev tooling, not written to `package.json`/`package-lock.json` — confirmed via `git diff --stat package-lock.json` showing no change); node_modules is git-ignored so no repo state was affected either way.
- Screenshots and raw telemetry committed under `docs/qa/screenshots/issue49-terrain-hills-acceptance-2026-07-11/`.

## AC-by-AC status

### AC1 (bounds expanded, ~6x area) — **MET**

Unit-proven per the hand-off (`terrain.test.ts`). Live-corroborated: this pass's spawn log recorded a live animal spawn at `(-47.16, 31.29)` (`spawn-log.json`) — well outside the old 40×40 (±20) footprint and close to the new ±50 edge — and `terrainHeightAt` was sampled successfully at `(40, -40)`, confirming the expanded field is live and reachable, not just present in test fixtures.

### AC2 (soft boundary still works at the new size) — **MET (unit-proven; not independently re-stress-tested at the exact edge this pass)**

Unit-proven per the hand-off (`boundary.test.ts` extended to the new extent). This pass's driving spanned from spawn out to `x≈-47` (`hill-climb-telemetry.json`, `06-content-*` teleports) without any stuck-at-edge or void behavior observed, consistent with the clamp working, but this pass did not specifically hammer the exact `±50` boundary line at length — the hand-off's unit coverage is the primary evidence here, this pass is corroborating, not exhaustive.

### AC3 (existing content remains functional in place) — **MET**

Live-verified reachability and visual/functional integrity for all eight pieces of existing content:

- **Bush** (`06-content-bush.png`): truck approaches and sits correctly at ground level next to it; `terrainHeightAt(6, 0) = 0` (flatten mask confirmed, `height-samples.json`).
- **Rock** (`06-content-rock.png`): truck sits flush against it, no floating/sinking.
- **Derelict car** (`06-content-derelict-car.png`): reachable, correctly planted.
- **Windmill** (`06-content-windmill.png`): reachable, correctly planted, river visible nearby unaffected.
- **Barn** (`06-content-barn.png`): reachable, correctly planted. **Triage note:** an initial look at this screenshot showed what appeared to be a black hole in the ground near the frame's bottom-left corner — flagged immediately as a possible defect matching this project's known "invisible geometry" bug class, not dismissed on sight. Root-caused live via raycast (`debugPick`) and direct pixel sampling: the region is the barn's own model geometry (`Barn_Cube005-Mesh`, materials `#4f4f4f`/`#7c3a32`) seen edge-on from a very close angle, rendering as a near-black unlit facet — **not** a ground/hill defect. A parallel pixel check confirmed the surrounding "hill" shading elsewhere in frame is a genuine dark green (`rgb(66,114,56)`), distinct in both hue and origin from this near-gray (`rgb(28,28,28)`, matching the barn's own dark material, not the page background or a rendering hole).
- **Farmhouse** (`06-content-farmhouse.png`): reachable, correctly planted.
- **Mountain** (`06-content-mountain.png`): reachable, correctly planted; `terrainHeightAt(-14, 5) = 0` (flatten mask confirmed). The same near-black-facet pattern seen at the barn appears here too (a low-poly obstacle/structure facet unlit from this angle) — same investigated-and-cleared class, not a new defect, and pre-existing to this feature (unrelated obstacle/structure art, not hill geometry).
- **River** (`06-content-river.png`): visible, reachable, unaffected by the terrain change.

No floating, sinking, or z-fighting was observed on any of the eight pieces of content across this pass. One thing worth flagging to the human as a minor, non-blocking, **pre-existing** cosmetic note (not introduced by #49): the rock/barn/mountain's low-poly primitive/placeholder facets render quite dark (near-black) from some close viewing angles under the single directional light — cosmetic polish, unrelated to hills, out of this doc's scope.

### AC4 (spawns use the full new area) — **MET**

Live spawn log (`spawn-log.json`) from a 24-leg loosely-driven session recorded 5 spawns spanning `x` from `-47.16` to `36.99` and `z` from `-40.32` to `31.29` — clearly using the full new ±50 extent, not clustered in the old ±20 core. Species mix (chicken/cow/pig) also confirms the animal-spawn pipeline is unaffected by the bounds change.

### AC5 (hills visible across the expanded terrain) — **MET**

`01-driving-start.png` and `02-hills-region-a.png` (ordinary chase-camera views, default driving angle, no special vantage point) show clearly visible rolling, rounded elevation changes in the ground shading and silhouette — a soft ridge crossing the frame in `01`, and a distinct convex hill crest against the sky horizon in `02`. This reads as gentle rolling terrain, not a flat plane, and not canyons/cliffs/jagged terrain — consistent with the "golf-course-like" character required.

### AC6 (hills are visually distinct from the mountain landmark) — **MET**

`04-mountain-vs-hills-scale.png` frames the mountain landmark, a rock obstacle, and the background rolling hills in one shot: the mountain totally dwarfs both the rock and the subtle background hill shading, an unambiguous, dramatic scale difference. Hills read as a background texture; the mountain remains the map's one large dramatic feature, exactly as designed (amplitude ~1.4 vs. mountain's ~16.3 rendered height, ADR 0017 §Decision-1).

### AC7 (driving over a hill produces a visible climb response) — **MET**

`hill-climb-telemetry.json` (9 samples across a varied-heading, 9-leg drive) shows nonzero, varying `lift` (0.008 to 0.55, matching the field's bounded ~±1.4 amplitude) and `pitch` (up to ±0.048 rad) tracking the truck's position as it crossed hill terrain — the same lift+pitch mechanism the truck already exhibits over obstacles, now visibly responding to hills too. `05-hill-climb-end-state.png` shows the truck visibly tilted/raised mid-hill, not flat-shaded-backdrop-ignoring-truck.

### AC8 (hard safety constraint — truck movement unaffected by hills) — **MET**

Structural guarantee already unit-proven per the hand-off (hill field never reaches the sim). This pass's live-driven confirmation: across the 9-leg varied-heading hill-crossing session plus the ~6 teleport-and-drive content-reachability legs (15+ total legs over hilly terrain, multiple approach headings each), the truck never got stuck, never flipped, never launched, and required no special input precision — ordinary W/A/S/D driving crossed every hill encountered without incident. Telemetry confirms `roll` was `0` throughout (matches `maxRoll: 0` in `DEFAULT_CLIMB_CONFIG`) and `pitch` never exceeded `0.048` rad against a `maxPitch` clamp of `0.45` rad (`src/core/driving/config.ts`) — nowhere near the clamp, i.e., hills produced a gentle, bounded, clearly-not-chaotic response. No console errors or page errors were logged during any of the six sessions (only the same pre-existing benign Rapier init deprecation notice and, on the builder screen, a benign favicon 404 — neither new to this pass nor related to terrain).

### AC9 (hills are not a clearance-gated obstacle class) — **MET (unit-proven; structural, not independently re-tested live)**

Unit-proven per the hand-off; structurally trivial (hills never enter `core/clearance.ts`). Not re-verified live in this pass beyond the general observation that hill-crossing behaved identically regardless of which obstacles were nearby (no wheel-tier-dependent hill behavior was ever visible).

### AC10 (hills are perceivable without special camera work) — **MET**

Every screenshot in this pass (`01` through `07`) used the game's real, unmodified default chase camera (behind-and-above the truck, per `src/render/scene.ts`'s existing `camera.position.set(cameraPos.x, 5, cameraPos.z)` logic) — no freecam, no debug camera, no map-edge vantage point. Hills are visibly readable from this ordinary in-session viewing angle in `01`/`02`/`04`, satisfying AC10 directly.

## Regression checks

- **Console errors:** only the pre-existing, previously-disclosed benign favicon 404 and a benign Rapier WASM init deprecation notice (present on every session, unrelated to terrain/hills — an existing `RAPIER.init()` call-signature notice, not a new warning introduced by this feature). No new errors across any of the six sessions.
- **Farmer/coins/HUD:** `hits` visibly dropped from 3 to 2 mid-session during the sustained hill-driving pass (telemetry + screenshots), consistent with the pre-existing, unrelated farmer-bump mechanic firing normally on hilly ground — confirms the farmer system is unaffected by the terrain change. HUD coin/heart display rendered correctly throughout.
- **Gas/driving feel:** no limp-mode, speed, or control anomalies observed while crossing hills at varied headings/speeds.
- **Temp QA hooks and ephemeral tooling fully reverted:** confirmed via `git diff src/main.ts src/render/scene.ts` showing no QA-hook code remaining, `git diff --stat package-lock.json` showing no change from the ephemeral `jimp`/`puppeteer-core` installs (both `--no-save`, and `node_modules/` is git-ignored regardless), and `npm run test` (563/563), `npx tsc --noEmit` (clean), and `npm run build` (clean) all re-run successfully after the revert — the exact numbers reported at the top of this document.

## Summary table

| AC | Status |
|---|---|
| AC1 (bounds expanded, ~6x area) | **Met** |
| AC2 (soft boundary still works at the new size) | **Met** — unit-proven; live driving out to the new edge showed no issues, not an exhaustive edge stress-test |
| AC3 (existing content remains functional in place) | **Met** — all 8 pieces of content reachable/planted; one visual finding investigated live and cleared as pre-existing barn/mountain material shading, unrelated to hills |
| AC4 (spawns use the full new area) | **Met** — live spawns recorded from x=-47.16 to x=36.99 |
| AC5 (hills visible across the expanded terrain) | **Met** |
| AC6 (hills visually distinct from the mountain landmark) | **Met** |
| AC7 (driving over a hill produces a visible climb response) | **Met** |
| AC8 (hard safety constraint — movement unaffected by hills) | **Met** — structural + live: 15+ hill-crossing legs, zero stuck/flip/launch incidents, roll always 0, pitch well within the 0.45 rad clamp |
| AC9 (hills not clearance-gated) | **Met** — unit-proven, structurally trivial |
| AC10 (hills perceivable without special camera work) | **Met** |

## Recommendation

I recommend **for** sign-off on issue #49. All 10 acceptance criteria are met, verified through a combination of the hand-off's unit-test coverage (AC1/AC2/AC7's math/AC9) and this pass's live-driven confirmation of the criteria unit tests structurally cannot prove — visible hill shading and scale (AC5/AC6/AC10), the climb response (AC7 visually), sustained multi-heading hill-crossing safety (AC8 experientially), full-map spawn coverage (AC4), and hands-on reachability of every piece of existing content (AC3). One visual anomaly surfaced during screenshot review was not waved through — it was actively root-caused via a live raycast/pixel-sampling investigation and confirmed to be pre-existing barn/mountain material shading, not a hill-displacement defect; worth the human's awareness as a minor cosmetic item (dark low-poly facets on rock/barn/mountain from close angles) but not blocking and not introduced by this feature.

Per this project's convention, I am recommending, not approving — final sign-off is the human's call.
