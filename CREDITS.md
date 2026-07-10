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
