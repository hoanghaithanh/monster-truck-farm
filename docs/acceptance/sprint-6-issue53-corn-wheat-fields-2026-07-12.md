# Acceptance Report — Corn/Wheat Fields (issue #53)

Date: 2026-07-12
Validator: test-engineer
Milestone: Sprint 6 (#6) — stretch item

Scope: `docs/requirements/farm-layout-and-fields.md` AC1-AC4 (the #53 fields scope) plus the
cross-cutting AC12/AC13. AC5-AC11 (farmstead layout, silo/coop/fence, breakable fences) belong to
sibling issue #54 and were already independently validated in
`docs/acceptance/sprint-6-issue54-farmstead-redesign-2026-07-12.md` — not re-litigated here.

Validated against the current uncommitted working tree at the time of this pass (`git status`:
`src/core/terrain.ts` — `STUB_FIELDS`/`DECORATIVE_CROPS`/`scatterFieldEdgeCrops`;
`src/render/scene.ts` — `buildFieldPatchMesh`/`buildCropPrimitive`/`buildCropDisplayModel` plus the
2026-07-12 gap-fix retune of `FIELD_SURFACE_Y_OFFSET`/`FIELD_PATCH_SEGMENTS`;
`src/render/assets/manifest.ts` — `CROP_ASSET_KEYS`; two new staged assets `corn.glb`/`wheat.glb`).

## Method

- `npm run test` (Vitest): 658/658 passing, before and after this pass's live driving (re-run
  after the temporary QA hook was reverted, to confirm no regressions from this pass's own
  instrumentation).
- `npx tsc -p tsconfig.json --noEmit`: clean, before and after.
- `npm run build` (real production build via `tsc + vite build`): clean, served via
  `npx vite preview --port 4411`.
- Live-driven via `puppeteer-core` against the real system Chrome
  (`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless), following this project's
  established convention (`CLAUDE.md` "Sourcing real art assets" §2/§5, and the issue
  #29/#48/#49/#54/#62/#63 acceptance passes' method sections). A bang-bang keyboard-driven
  navigator (poll a temporary read-only `window.__qa` telemetry hook for position/heading/speed/
  gas/coins/hitsRemaining, toggle `KeyW`/`KeyA`/`KeyD` key events) drove the truck to specific
  coordinates — **not** the `world.step()`-based teleport helper, per this project's documented QA
  gotcha (CLAUDE.md) that teleporting mid-session can crash Rapier's WASM state. (Note: the first
  attempt at this script had the steer-key mapping inverted relative to `truck-motion.ts`'s own
  documented heading convention, which drove the truck straight into the map boundary and stalled
  there burning gas for the whole run — caught from the telemetry itself (`x` pinned at exactly
  `-50` for every sample) before taking it as real data, fixed, and the whole pass re-run clean.)
- One continuous driving session against the real build, screenshotted at each step: builder →
  confirm → approach corn field from a normal driving distance → into the corn field (6 sampled
  waypoints while continuously moving) → into the wheat field (6 sampled waypoints while
  continuously moving) → back off to a distance glance → four separate field-corner approaches at
  different angles/positions (not reusing the prior gap-fix screenshot angles) → toward the main
  farmyard cluster → a combined mid-map overview → the coop-pen boundary.
- Screenshots and raw telemetry (with real per-sample timestamps) committed under
  `docs/qa/screenshots/issue53-fields-acceptance-2026-07-12/` (15 screenshots + `telemetry.json` +
  `console-errors.json`). The pre-existing implementer screenshots at
  `docs/qa/screenshots/issue53-fields-2026-07-12/` and
  `docs/qa/screenshots/issue53-fields-gap-fix-2026-07-12/` were reviewed for context but **not**
  relied on as this pass's evidence, per this project's "a second, independent look matters"
  convention — every AC verdict below is backed by this pass's own independently-driven
  screenshots/telemetry, taken from different positions/angles than the prior passes.
- **Temporary QA hook, fully reverted:** a read-only `window.__qa` telemetry object
  (position/heading/speed/gas/coins/hitsRemaining) was added to `src/main.ts`'s frame loop for this
  pass and removed once the live driving was complete. Confirmed via `git diff src/main.ts | grep
  -i "__qa"` (no matches) and a `git diff --stat -- src/main.ts` showing no diff at all (main.ts is
  untouched by #53's own implementation diff), plus a final `npm run test` (658/658),
  `npx tsc --noEmit` (clean), and `npm run build` (clean) re-run after the revert.

## AC-by-AC status

### AC1 (fields visually recognizable as corn vs. wheat at a glance) — **MET**

`02-approaching-fields-distance.png` shows the corn field at a normal driving distance (truck
~15-20 units away, not standing inside it): a distinctly darker, more saturated green patch than
the surrounding grass, with tall corn-stalk silhouettes visible along its edge — reads clearly as
"a field of something" from a glance, and the stalk shape (tall, leafy) reads as corn specifically
once close enough to make out the ear/husk shape (`03-inside-corn-field.png`).
`13-midpoint-overview.png` shows both fields together at a comparable driving distance in a single
frame — the wheat field's warm golden-tan ground color is unambiguously distinct from both the
grass and the corn field's dark green, satisfying the "distinct ground texture/color" half of AC1
for both crops simultaneously. Close-up shots (`05-inside-wheat-field.png`,
`10-wheat-field-corner1-undulating-check.png`) show the wheat stalk props as thin spike-topped
stems, distinct in silhouette from corn's taller leafy-eared stalks (`08-corn-field-corner1-
undulating-check.png`) — the two crop kinds are visually distinguishable from each other, not just
from grass.

### AC2 (fields purely decorative, zero mechanical effect) — **MET**

Telemetry from `through-corn-samples` (6 waypoints, ~0.5s apart, continuously driving) and
`through-wheat-samples` (6 waypoints, same cadence) in `telemetry.json` both show `speed` pinned at
a constant `6` for every sample inside each field — no slowdown, no speed-up, entering or exiting.
`gas` drains at a consistent linear rate both inside and outside the fields (approach-to-corn:
~0.965 gas/s; through-corn: ~0.976 gas/s — the two rates match within noise, confirming the field
doesn't change drain rate). `coins` stayed `0` throughout (no unintended crop-contact scoring) and
`hitsRemaining` stayed at `3` for every single sample while inside either field (it later dropped
to `2` after the truck had left both fields entirely, evaluated separately below under
Regressions — not a field-caused hit). `08-corn-field-corner1-undulating-check.png` additionally
shows the truck's body visually overlapping/passing through a corn stalk prop with no visible
collision response, directly confirming "near individual stalk-cluster props" per AC2's own
wording, not just "across/along" the field as a whole. This matches the code-level confirmation
(neither `STUB_FIELDS` nor `DECORATIVE_CROPS` is ever passed to `physics/world.ts` or
`core/spawn/spawn-position.ts` — grep-confirmed, no import path exists) with live corroboration
across a changing path with multiple sample points, not a single static screenshot.

### AC3 (patch + sparse props, not dense instancing) — **MET**

`STUB_FIELDS` defines exactly two fields (corn, wheat); `DECORATIVE_CROPS` is built via
`scatterFieldEdgeCrops(field, kind, 20, ...)` for each — 20 stalk clusters per field, squarely
inside the confirmed 15-30 range, and every screenshot shows the props scattered near the
perimeter, not filling the interior densely (e.g. `03-inside-corn-field.png`,
`05-inside-wheat-field.png` both show mostly-open patch interior with clusters ringing the edges).
`buildCropPrimitive`/`buildCropDisplayModel` clone a loaded source model per instance
(`scene.ts`'s crop-slot loop mirrors the trees' load-once-clone-many pattern) — no
`THREE.InstancedMesh` usage (grep-confirmed, matching the Non-goals constraint), and stalk clusters
carry no collider (confirmed under AC2 above).

### AC4 (fields positioned plausibly relative to the farmstead) — **MET, with a specific caveat worth naming plainly**

This was flagged for independent judgment rather than deferring to the prior code-review's
"plausibly satisfies" call, so here is that independent assessment:

- **The fields are tightly, directly adjacent to the chicken-coop pen** — not the main
  barn/silo/windmill/farmhouse cluster. `13-midpoint-overview.png` and `14-near-coop-pen.png` show
  the corn field's fence-line literally sharing a boundary with the coop pen's own fence (same
  fence run, `STUB_FENCES`), with the chicken coop, corn stalks, and pen fence all in the same
  tight frame — this reads unambiguously as "the coop's fields," a coherent, deliberate
  composition, not a coincidence.
- **The main farmyard cluster (barn/silo/windmill/farmhouse) is numerically far from the fields**
  (~30-40 world units, confirmed via `STUB_STRUCTURES` coordinates vs. `STUB_FIELDS` coordinates)
  — this matches the concern raised going into this pass.
- **However, live driving shows the main cluster is visually reachable from the fields, not
  disconnected**: `05-inside-wheat-field.png` and `06-driving-through-wheat.png` both show the
  barn/windmill/silo/farmhouse cluster clearly visible in the same camera frame while the truck is
  standing inside or just having left the wheat field, over open rolling terrain with no
  obstruction — a child driving through the fields would see the farmhouse on the horizon, not
  experience the fields as isolated or scattered independently across the map. This unobstructed
  sightline is a positive, not neutral, piece of evidence for AC4's actual bar ("reads as belonging
  to the farm... not scattered independently").
- **Net judgment:** the fields read as belonging to the farm via two separate, reinforcing cues —
  direct fence-sharing adjacency with the coop pen, and a clear visual line to the main cluster from
  within the fields themselves. This satisfies AC4's stated evaluation bar ("look at the running
  scene... does it read as belonging to the farm"). The caveat worth naming: a child specifically
  looking for "the fields next to the barn" (the more conventional farmstead-composition reading)
  would find them next to the coop instead — a legitimate, but different, layout choice than "fields
  beside the barn." Given AC4's own text explicitly allows either interpretation ("near/adjacent to
  the farmstead cluster" — the coop pen is itself part of the farmstead per AC6/§A1 of the sibling
  #54 report) and does not mandate proximity specifically to the barn, this is Met, not a partial
  or conditional pass.

## Cross-cutting

### AC12 (wheel-tier clearance system unchanged) — **MET**

658/658 tests pass, including the pre-existing `clearance.test.ts` suite, unmodified by this diff.
`FieldPatch`/`CropInstance` are structurally confirmed (by code inspection) to never enter
`partitionObstacles`/`clearance.ts` — no import path exists from `core/terrain.ts`'s new field/crop
data into that module, and `ObstacleClass`/the wheel-tier table gained no new entries.

### AC13 (consumes bounds, doesn't define them) — **MET**

`TERRAIN_BOUNDS` (`core/terrain.ts`) is untouched by this diff. `STUB_FIELDS` (x21-37, z9-20) sits
comfortably within the existing −50..50 bounds, confirmed by both `terrain.test.ts`'s clearance
assertions (658/658 passing) and live driving never crossing the boundary unexpectedly during this
pass's field-focused route.

## Independent re-check of the previously-fixed ground-poking-through gap defect

The code-review-caught-and-fixed defect (visible grass-green triangles poking through the field
patch on undulating terrain, root-caused to two independently-triangulated height-sampled grids
disagreeing, fixed via `FIELD_SURFACE_Y_OFFSET`/`FIELD_PATCH_SEGMENTS` retuning) was re-verified
from angles and positions genuinely independent of the fixing developer's own verification pass:
`08-corn-field-corner1-undulating-check.png`, `09-corn-field-corner2-undulating-check.png`,
`10-wheat-field-corner1-undulating-check.png`, `11-wheat-field-corner2-undulating-check.png` — four
separate corner approaches per the two fields, each showing a clean field-to-grass edge with no
grass poking through the patch surface. The fix holds under this independent re-check.

## Regression checks (systems adjacent to this diff)

- **Console errors:** only the same pre-existing, previously-disclosed benign favicon 404 seen in
  prior acceptance passes — no new errors across this pass's session.
- **hitsRemaining drop from 3 to 2 observed mid-pass:** occurred strictly *after* the truck had
  already left both fields (all in-field telemetry samples for both fields show `hitsRemaining: 3`
  throughout; the drop is first visible in the `corn-corner-1` sample, captured after a separate
  drive leg back toward the coop-pen boundary). Fences/structures/trees are all documented as
  no-damage (AC7/AC8/§A4 of the sibling #54 report) and this pass's own data confirms fields/crops
  never touch `hitsRemaining` while inside them — the most likely explanation is an unrelated
  farmer-bump event (farmer spawn/chase is stochastic and outside this pass's control). This is
  flagged as an observed, unremarkable regression-surface event, not a defect in this feature — it
  is not reproduced/explained further here since it falls outside #53's scope, and the sibling #54
  acceptance report already covers farmer-bump behavior as its own regression check.
- **Asset loading:** `corn.glb`/`wheat.glb` both loaded and rendered as real sourced art in every
  screenshot (not primitive fallbacks) — no console errors accompanying their load.

## Summary table

| AC | Status |
|---|---|
| AC1 (fields visually recognizable, corn vs. wheat) | **Met** |
| AC2 (zero mechanical effect, incl. near stalk props) | **Met** |
| AC3 (patch + ~20 sparse props, not dense instancing) | **Met** |
| AC4 (positioned plausibly relative to the farmstead) | **Met** — adjacent to the coop pen specifically, not the barn cluster; see caveat above |
| AC12 (wheel-tier clearance unchanged) | **Met** |
| AC13 (consumes bounds, doesn't define them) | **Met** |
| Ground-poking-through gap fix (independent re-check) | **Holds** |

## Recommendation

All four fields-specific acceptance criteria (AC1-AC4) plus the two cross-cutting criteria
(AC12/AC13) are **Met**. No defects were found in this pass. The one thing worth the human's
attention before sign-off is not a defect but a layout characterization: the fields sit right
against the chicken-coop pen, sharing its fence line, rather than against the main
barn/silo/windmill/farmhouse cluster — a legitimate and, in this validator's independent judgment,
AC4-satisfying choice (direct fence-adjacency to a farmstead structure, plus a clear sightline to
the main cluster from inside the fields), but a different composition than "fields beside the barn"
if that was the mental picture going in. Worth a quick look at
`docs/qa/screenshots/issue53-fields-acceptance-2026-07-12/13-midpoint-overview.png` and
`14-near-coop-pen.png` before confirming.

Per this project's convention, I am recommending, not approving — final sign-off is the human's
call.
