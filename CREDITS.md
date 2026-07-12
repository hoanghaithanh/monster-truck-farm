# Third-party art credits

## Truck body/wheel models (ADR 0011, issue #33 follow-up)

The truck body and wheel models (`src/render/assets/models/body-tier-{0,1,2}.glb`,
`wheel-tier-{0,1,2}.glb`) are real, sourced low-poly models, downloaded via
[poly.pizza](https://poly.pizza) on 2026-07-09. They replace an earlier pass
of procedurally-generated placeholder boxes (`scripts/generate-truck-art.mjs`,
still used for the small engine-cue/gas-cue props, which are unaffected).

### Body models — Quaternius, CC0 1.0 (no attribution required)

| Tier | Model | Source |
|---|---|---|
| 0 | "Pickup Truck" by Quaternius | https://poly.pizza/m/qn4grQgHm8 |
| 1 | "Pickup Truck Armored" by Quaternius | https://poly.pizza/m/RUwMItmU4B |
| 2 | "Truck Armored" by Quaternius | https://poly.pizza/m/VvX8nmoCN5 |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.

### Wheel models — Jarlan Perez, CC-BY 3.0 (attribution required)

| Tier | Model | Source |
|---|---|---|
| 0 | "Vehicle Tire" by Jarlan Perez (smooth tread) | https://poly.pizza/m/2SNngBhunHZ |
| 1 & 2 | "Truck Tire" by Jarlan Perez (knobby off-road tread, reused at two scales) | https://poly.pizza/m/2GuaLHL6p5g |

> "Vehicle Tire" and "Truck Tire" by Jarlan Perez, licensed under
> [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via
> [poly.pizza](https://poly.pizza).

Tiers 1 and 2 both use the "Truck Tire" model at different scales
(`src/render/truck-sockets.ts`'s `wheelScale`/`WHEEL_RADIUS_BY_TIER`) rather
than two distinct tread meshes — see that file's header comment for the
design rationale (disclosed trade-off, not a bug).

## Chicken model (issue #28)

The chicken model (`src/render/assets/models/chicken.glb`) is a real, sourced
low-poly model, downloaded via [poly.pizza](https://poly.pizza) on
2026-07-10. Replaces the placeholder `BoxGeometry` used for animals in
`src/render/scene.ts`.

| Model | Source |
|---|---|
| "Hen" by Poly by Google | https://poly.pizza/m/8Unya0rw9tR |

> "Hen" by Poly by Google, licensed under
> [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via
> [poly.pizza](https://poly.pizza).

592 triangles, single mesh/material with an embedded baked texture (no
vertex-color, no animation). Originally part of Google's now-retired Poly
library, archived on poly.pizza — chosen over other CC0/CC-BY chicken
candidates because it's the only one with a full standing body (legs,
wings, tail) in a faceted low-poly style consistent with the truck body/
wheel models above; other candidates found were either a legless floating
head or a blocky/cube-built style that reads as more abstract than this
project's confirmed art direction (`docs/requirements/vehicle-and-character-art.md`,
"Resolved — Art direction").

## Farm structures — windmill, barn, farmhouse (issue #46)

The three environment structures (`src/render/assets/models/{barn,windmill,farmhouse}.glb`)
are real, sourced low-poly models, downloaded via [poly.pizza](https://poly.pizza)
on 2026-07-10, per `docs/requirements/environment-dressing.md` AC1/AC9 and
`docs/architecture/0012-environment-dressing-and-terrain-features.md` §2.

### Barn and Tower Windmill — Quaternius, CC0 1.0 (no attribution required)

| Model | Source |
|---|---|
| "Barn" by Quaternius | https://poly.pizza/m/vSqQNA7ez6 |
| "Tower Windmill" by Quaternius | https://poly.pizza/m/52yaPyaAAG |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.
Same author/pack family as the truck body models (see above) — chosen partly
for style consistency. The windmill's blades are a separate glTF node
(`TowerWindmill_Blades_Cylinder.006`) from the tower body, so a future pass
could add the optional cheap blade-spin animation ADR 0012 §2 allows (not
required — static satisfies AC8).

### Farm house — Poly by Google, CC-BY 3.0 (attribution required)

| Model | Source |
|---|---|
| "Farm house" by Poly by Google | https://poly.pizza/m/bHyQe5jzdiQ |

> "Farm house" by Poly by Google, licensed under
> [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via
> [poly.pizza](https://poly.pizza).

**Modified from the original**: the source file's single embedded baked
texture was 2048×2048 (~980KB, ~991KB gzipped on its own — more than half
of ADR 0010 §3's entire 1.5MB driving-scene asset budget for one building).
Downscaled to 512×512 (~200KB gzipped) with no visible quality loss at
driving-scene viewing distance — geometry, UVs, and material assignment are
otherwise untouched. Chosen over the alternative Quaternius "Small Farm"
candidate (different, more cottage-like roof style, bundled with plowed-field
terrain geometry not wanted here) and over Poly by Google's own "Farm" model
(a barn+silo combo that would have visually overlapped with the Quaternius
barn above, not read as a distinct farmhouse).

## Mountain landmark (issue #47)

Two low-poly mountain models (`src/render/assets/models/mountain-{a,b}.glb`),
downloaded via [poly.pizza](https://poly.pizza) on 2026-07-10. Originally
sourced for a 12-instance non-collidable backdrop ring placed outside
`TERRAIN_BOUNDS` (ADR 0012 §4, "one, or a few, low-poly mountain .glb(s),
instanced/reused around the perimeter"); mid-Sprint-4 the human superseded
that design in favor of one large, reachable, collidable mountain landmark
placed *inside* `TERRAIN_BOUNDS` (ADR 0012 addendum 2026-07-10, requirements
doc AC3a). Only `mountain-a.glb` (the taller/sharper model) is used by the
shipped landmark; `mountain-b.glb` has no consumer as of this redesign but
is left registered/committed (harmless, same "kept even if unused"
precedent as the manifest's `test-fixture-cube` entry).

| File | Model | Source |
|---|---|---|
| `mountain-a.glb` | "Mountain" by Quaternius (484 tris, taller/sharper) — used as the landmark | https://poly.pizza/m/XY4ej3Zg3I |
| `mountain-b.glb` | "Mountain" by Quaternius (194 tris, shorter/rounder) — unused as of the AC3a redesign | https://poly.pizza/m/7HYR2s9JVi |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.
Same author/pack family as the truck body, barn, and windmill models above.
Ships with a corrective node transform (a 100x scale plus a -90° X rotation
fixing the Z-up export to Three.js's Y-up convention), so unlike the
chicken/farmhouse models above, no manual scale-correction workaround was
needed for orientation/units — the raw glTF loads at an already-sensible
size (final display scale is still tuned to a specific target height via
`buildStructureDisplayModel`'s width-driven scaling, same as every other
structure; see ADR 0012 addendum for the exact derivation). Its sourced
"Stone"/"Snow"/"Dirt" materials ship a nonzero `metallicFactor` (unlike
every other structure/asset in this project) — `buildStructureDisplayModel`
now force-overrides `metalness` to 0 on every structure's loaded materials
to compensate for this project's scene having no `envMap` (see that
function's doc comment in `render/scene.ts`).

There is no river asset — per ADR 0012 §3, the river is procedural flat
ribbon geometry generated in `render/`, not a downloaded asset.

## Silo, chicken coop, and fence (issue #54)

Three more low-poly structures (`src/render/assets/models/{silo,chicken-coop,fence}.glb`),
downloaded via [poly.pizza](https://poly.pizza) on 2026-07-12, per
`docs/requirements/farm-layout-and-fields.md` AC7/AC8/AC11 and
`docs/architecture/0019-farmstead-layout-and-breakable-fences.md`. All three
come from the same **Farm Buildings Bundle** the barn/windmill (issue #46)
were already partially sourced from — near-zero incremental sourcing cost,
exactly as the requirements doc anticipated.

| File | Model | Source |
|---|---|---|
| `silo.glb` | "Silo" by Quaternius | https://poly.pizza/m/5GhLrv5Ce3 |
| `chicken-coop.glb` | "ChickenCoop" by Quaternius | https://poly.pizza/m/DM0F8siLam |
| `fence.glb` | "Fence" by Quaternius (picket style — the bundle ships two fence variants; this one chosen by the human 2026-07-12 over the plainer post-and-rail alternative for its stronger silhouette and more satisfying "smash through it" presence, matching AC8's breakable-barrier mechanic) | https://poly.pizza/m/U7g0Wxpt63 |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.
Same author/pack family as the truck body, barn, windmill, and mountain
models above.

All three are structurally simple compared to some earlier sourced assets —
each is a **single mesh, single root node**, multiple primitives sharing
flat vertex-color materials (`LightRed`/`White`/`DarkRed`/`Brown`/`Grey` for
the silo; similar flat palettes for the other two), **no textures, no
animation**. No exclusion/rename workarounds needed (contrast the truck
bodies' built-in wheel nodes, or the windmill's separate blade node) — the
whole file loads and displays as one piece.

Raw bounding boxes (glTF native units, pre-`buildStructureDisplayModel`
scaling), for whoever derives each structure's target `footprintRadius`
the same width-driven way the mountain's was derived (see that structure's
CREDITS.md entry above and ADR 0012's addendum for the method):

| Model | Root node name | bboxMin (x,y,z) | bboxMax (x,y,z) |
|---|---|---|---|
| Silo | `Silo_Cylinder.007` | (-1.750, -0.049, -1.665) | (1.917, 9.019, 1.845) |
| ChickenCoop | `ChickenCoop_Cube.015` | (-1.203, -0.003, -0.948) | (1.205, 1.848, 1.206) |
| Fence | `Fence2_Cube.024` | (-2.945, -0.009, -0.083) | (2.945, 1.164, 0.083) |

The fence's bounding box is notably long/thin (≈5.89 wide × 1.17 tall ×
0.166 deep) — it's a single boundary *segment* meant to be placed with a
per-instance `rotationY` and repeated along a line (per ADR 0019's
`FenceInstance` design), not a single all-purpose prop like the other
structures.

## Decorative tree (issue #54 amendment — cliffs/waterfalls/forest redesign)

`src/render/assets/models/tree.glb`, downloaded via
[poly.pizza](https://poly.pizza) on 2026-07-12, per the dated 2026-07-12
amendment to `docs/architecture/0019-farmstead-layout-and-breakable-fences.md`
§A4. Loaded once and cloned per instance (~25-45 times across the map, per
the fields' established "load-once, clone-many" pattern) — deliberately
**not** `THREE.InstancedMesh` (`farm-layout-and-fields.md`'s non-goal).

| Model | Source |
|---|---|
| "Tree" by Quaternius | https://poly.pizza/m/qZtx0AHhcy |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.
Same author/pack family as every other sourced structure in this project.

**Modified from the original**: unlike every other structure sourced so far
(all flat vertex-color, no textures), this model ships 3 real textures (bark
base color + normal map, leaf base color, each 1024×1024) — the source file
is 2.54MB, more than the entire ADR 0010 §3 driving-scene gzipped budget on
its own. Downscaled to 128×128 per texture (2.54MB → 423KB raw, ~263KB
gzipped) via `@gltf-transform/cli resize`, with no visible quality loss at
driving-scene viewing distance (side-by-side rendered comparison, same
verification method as the farmhouse downscale above) — geometry and UVs
untouched, only texture resolution reduced. Chosen over Quaternius's
"Ultimate Stylized Nature Pack" bundle variants for being a single
already-isolated model (no bundle-extraction overhead) with a full,
naturally-shaped canopy silhouette that reads clearly as "tree" at a
distance, consistent with this project's stylized/low-poly art direction.

## Farmer model (issue #29)

The farmer model (`src/render/assets/models/farmer.glb`) is a real, sourced,
rigged/animated low-poly model, downloaded via [poly.pizza](https://poly.pizza)
on 2026-07-10, per `docs/requirements/vehicle-and-character-art.md` AC7-AC9.
Replaces the `CapsuleGeometry` placeholder in `render/scene.ts`.

| Model | Source |
|---|---|
| "Farmer" by Quaternius (from the "Ultimate Modular Men Pack") | https://poly.pizza/m/7pn3R6hPvE |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.
Same author/pack family as the truck body, barn, windmill, and mountain
models above.

Unlike every other art asset sourced so far, this model ships a full
62-joint skeleton and a bundled animation library (24 clips, most of them
combat/tool actions not used here). Three clips are used to give the
farmer's FSM states (`PURSUING`/`TIRED`/`LEAVING`, ADR 0007) real
pose-driven distinction per AC8 — `CharacterArmature|Run` for PURSUING,
`CharacterArmature|Idle` for TIRED (paired with the existing
`FARMER_TIRED_COLOR` amber tint as a supplementary cue, since no clip in
this library reads as a literal "winded/hands-on-knees" pose — searched
both this library and poly.pizza's own catalog, nothing matching this art
style existed), and `CharacterArmature|Walk` for LEAVING. This is the first
model in this codebase driven by `THREE.AnimationMixer` rather than a
static swap-in-place — every other model here (truck parts, chicken,
structures) is a static mesh.

Its materials ship a nonzero `metallicFactor` (0.4, same pattern already
hit and fixed for the mountain landmark above) — needs the same
`metalness = 0` force-override this project already applies in
`buildStructureDisplayModel`, since the scene has no `envMap` for metallic
surfaces to reflect.

## Pig and cow models (issue #48)

Two low-poly animal models (`src/render/assets/models/{pig,cow}.glb`),
downloaded via [poly.pizza](https://poly.pizza) on 2026-07-10, per
`docs/requirements/farm-animals-pig-cow.md` AC9/AC10. Add pig and cow as new
chaseable species alongside the existing chicken.

| Model | Source |
|---|---|
| "Pig" by Quaternius | https://poly.pizza/m/TNvG3QUFlp |
| "Cow" by Quaternius | https://poly.pizza/m/5XSc2Fka3F |

License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
— public domain, no credit required. Credited here anyway as good practice.
Same author/pack family as the truck body, barn, windmill, mountain, and
farmer models above.

Unlike the chicken (a plain static mesh), both models are rigged
(`SkinnedMesh`, `Armature` skeleton) with real animation libraries — pig
ships `Idle`/`Jump`; cow ships `Idle`/`Walk`/`Run`/`WalkSlow`/`Death`. Per
ADR 0016, only `Idle` (standing) and one flee clip per species (`Jump` for
pig, `Run` for cow) are ever referenced — `Death` and cow's unused
`Walk`/`WalkSlow` are never wired up, matching the kid-safe clip-exclusion
discipline already established for the farmer's unused combat/gun clips.
Measured sizes (re-measured at implementation time, `gzip -9` against the
committed files, matching `manifest.ts`'s `PIG_GZIP_BYTES`/`COW_GZIP_BYTES`
exactly): pig 59,419 bytes gzipped, cow 135,288 bytes gzipped — combined with
the existing driving-scene total (~656KB: chicken, barn, windmill, farmhouse,
mountains, farmer), the new total is ~0.87MB against ADR 0010 §3's 1.5MB
target, comfortably within budget with no clip-trimming needed. (Off by ~11
bytes each from this section's original sourcing-time figures — a rounding/
gzip-invocation difference, not a file change; negligible either way.)
