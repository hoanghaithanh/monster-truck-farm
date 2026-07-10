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
