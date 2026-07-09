# Truck Wheel Motion (Rolling & Steering)

Status: **Resolved, ready for developer.** Open Question 1 resolved by the human (2026-07-09): physically-accurate roll rate (option a).

Related: `docs/architecture/0011-truck-model-and-cosmetic-variants.md` (the current rig assembly this builds on top of); `docs/requirements/vehicle-and-character-art.md` (the sourced-art truck body/wheel models this animates); `docs/requirements/drive-terrain-and-gas.md` (the existing driving/speed/steering math this reads from); `docs/requirements/truck-cosmetics.md` (wheel-look material cosmetics — unaffected by this doc, orthogonal concern).

## Problem statement

Direct human playtest feedback (2026-07-09), after the sourced-truck-art work: the truck visually slides across the ground rather than driving — its four wheels stay perfectly static while the truck moves, and never turn angle when the player steers left or right. This breaks the "real vehicle" feel the recent art upgrade was meant to deliver. The underlying speed and steering data already exist every frame (`src/core/driving/truck-motion.ts`, `src/systems/driving-system.ts`, `src/input/keyboard-input.ts`); it is simply never used to animate the wheels, because `buildTruckRig()` (`src/render/truck-rig.ts`) currently assembles the truck as a single opaque `THREE.Group` with no individual wheel objects tracked or exposed, and `setTruckTransform()` (`src/render/scene.ts`) moves/rotates only that one rigid group per frame.

## Goals / Non-goals

**Goals**
- All four wheels visibly roll (rotate around their axle) while the truck is moving, at a rate that responds to the truck's current speed, and stop rolling when the truck is stationary.
- The two front wheels visibly turn (yaw) left/right in response to the player's steer input, independent of the rolling rotation; the two rear wheels do not yaw.
- This is a purely visual/cosmetic motion layer — it must not change the truck's collision geometry, its kinematic character controller behavior, or any driving/physics math already specified in `drive-terrain-and-gas.md`.
- Applies identically regardless of which wheel tier or wheel-look cosmetic (`standard`/`redRim`/`chrome`, per `truck-cosmetics.md`) is equipped — this is a rig/motion concern, not a material concern.

**Non-goals**
- Suspension travel, bounce, or body tilt/lean while driving or cornering (a separate, larger animation concern; not requested here).
- Tire deformation, skid marks, dust/particle effects, or drift behavior.
- Any change to the truck's actual movement, top speed, turn rate, or collision response — those remain exactly as specified in `drive-terrain-and-gas.md` / ADR 0001 §2.
- Animating the builder screen's stationary 3D truck preview (`buildTruckRig`'s second call site) — there is no driving simulation running there (no speed/steer state to animate from), so the preview's wheels may remain static.
- Any interaction with obstacle geometry (e.g. wheels visually conforming to a slope or ramp) — that is the separate, larger concern raised in `docs/requirements/truck-obstacle-climbing.md`. This doc is flat-ground wheel motion only.

## User stories

1. As a player, I want the truck's wheels to visibly roll while I'm driving, so the truck looks like it's actually driving instead of sliding across the ground.
2. As a player, I want the front wheels to visibly turn when I press the steer keys, so steering feels connected to what I see on screen.

## Acceptance criteria

- **AC1 (wheels roll while moving):** Given the truck has non-zero speed (forward or reverse, per `TruckMotionState.speed`), when the frame renders, then all four wheels visibly rotate around their axle (the axis running through the wheel's own hub), with rotation direction reversing when the truck is reversing.
- **AC2 (wheels stop when stationary):** Given the truck's speed is zero (not accelerating, not coasting), when the frame renders, then no wheel rotates — the truck reads as parked, not perpetually spinning.
- **AC3 (roll responds to current speed, not a canned loop):** The per-frame roll amount is derived from the truck's actual current speed each frame (not a fixed-rate looping animation independent of gameplay state), so slowing down, stopping, or speeding up is reflected in the visible roll rate without a perceptible lag beyond normal frame latency. The exact mapping from speed to rotation amount is the physically-accurate, per-tier-radius formula resolved in Open Question 1 below.
- **AC4 (front wheels steer):** Given the player is holding a steer input (left or right), when the frame renders, then the front-left and front-right wheels visibly rotate about a vertical (yaw) axis toward the pressed direction, independent of and in addition to their rolling rotation.
- **AC5 (steering releases smoothly):** Given the player releases the steer input, when no steer key is held, then the front wheels return to a centered/straight orientation (an instant snap is acceptable; a brief smooth return is also acceptable — either satisfies this AC, exact easing is an implementation/tuning detail, not gated here).
- **AC6 (rear wheels never yaw):** The rear-left and rear-right wheels roll (AC1) but never yaw with steer input, matching a real vehicle's non-steering rear axle.
- **AC7 (cosmetic/tier independence):** Wheel roll and steer-yaw behave identically regardless of which wheel-look cosmetic or wheel tier is equipped — the paint/material swap (`truck-cosmetics.md`) and this motion layer are independent and must not interfere with each other.
- **AC8 (no physics/collision change):** This feature makes no change to the truck's Rapier collider dimensions, the kinematic character controller's movement resolution, or any value in `drive-terrain-and-gas.md`'s acceptance criteria — verifiable by the existing driving/obstacle-clearance test suite continuing to pass unmodified.
- **AC9 (perf budget):** Wheel animation does not introduce a perceptible frame-rate regression, consistent with the existing perf/loading NFR budget in `vehicle-and-character-art.md` (AC10-AC13) — this is additive motion on already-loaded geometry, not new asset loading, so the budget impact should be negligible, but is called out so it isn't silently ignored.

## Open questions

1. ~~**(Blocking) Roll-rate realism bar.**~~ **Resolved by the human (2026-07-09): option (a), physically-accurate.** Roll rate matches actual distance traveled per frame divided by each wheel tier's real circumference (`2 * PI * WHEEL_RADIUS_BY_TIER[tier]`, `src/render/truck-sockets.ts` — tier radii are 0.28/0.4/0.58, so a fixed speed rolls a Tier-0 wheel visibly faster than a Tier-2 wheel at the same truck speed, matching a real vehicle).
2. **(Non-blocking) Front-wheel max steer-yaw angle.** How far the front wheels visually turn at full steer input (e.g. a fixed ~25-35 degree cap, independent of the turn-rate/heading math in `truck-motion.ts`, which already governs the truck's actual turning) is a tuning value left to the architect/developer, not gated here — any value that reads as "clearly turning" satisfies AC4.
3. **(Non-blocking) Roll source when blocked by an obstacle.** While sliding along a blocking obstacle (drive AC6-AC9), the truck's internal speed state may be non-zero even though little/no actual displacement is applied that frame (Rapier's kinematic controller absorbs the blocked component). Rolling wheels while visually stuck against an obstacle is arguably realistic (a real stuck vehicle's wheels can spin), so no AC forces a specific behavior here — left to the architect/developer as an implementation detail, not a blocking question.

## Constraints

- Builds on the existing `buildTruckRig()` / `TruckRigResult` seam (`src/render/truck-rig.ts`) and the single-assembly-path invariant from ADR 0011 §4 (driving scene and builder preview both call the same function) — must not fork that invariant.
- `TruckRigResult` today exposes only the assembled `group`, with no individual wheel references tracked. Implementing this will need some extension to that interface (or an equivalent seam) to give per-frame code a handle on each wheel — left entirely to the architect, not decided here.
- Must read from data that already exists per frame — `DrivingSystem`'s returned `{ position, heading }` plus its internal speed (`src/systems/driving-system.ts`), and `KeyboardInput.getIntent().steer` (`src/input/keyboard-input.ts`) — rather than introducing a second, independent source of truth for speed/steer.
- Runs in-browser (Three.js + Vite), consistent with the rest of the render layer; no new asset loading required (this is procedural rotation of already-loaded/fallback wheel objects).
