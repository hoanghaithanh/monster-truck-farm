# Driving, Terrain Clearance & Gas System

Status: Sprint 1.

## Problem statement

Once a truck is built, the player needs to drive it around the farm. Driving is where two of the four upgrade stats (wheels, gas tank) actually become observable: wheel tier determines what the truck can physically get over, and gas tank tier/drain determines how long the player can keep driving before slowing down. This document specifies the driving experience on Sprint 1's minimal/stub terrain, obstacle clearance behavior, and the gas drain/regen mechanic.

## Goals / Non-goals

**Goals**
- Simple, short-session-friendly keyboard driving controls suitable for a young child.
- Obstacle clearance behavior that makes wheel tiers (defined in `truck-builder-and-upgrades.md`) observable and testable, backed by real obstacle instances in the Sprint 1 stub terrain.
- A gas drain-while-driving / auto-regen-while-idle mechanic that never produces a hard stop or fail state (this system remains no-fail-state even though the farmer/body-hit system in `farmer-minimal-bump.md` now has a confirmed hard-game-over exception — the two systems are independent).

**Non-goals (Sprint 1)**
- Full farm dressing: windmill, barn, farmhouse, river, and mountains beyond a stub placeholder are explicitly deferred. (Functional obstacle instances — bush/rock/derelict car — are not part of this deferral; see below.)
- Any gas station / manual refill location — regen is auto, idle-triggered only (already confirmed, not open for reinterpretation).
- Touch controls or gamepad support — confirmed keyboard-only for Sprint 1 (see Acceptance Criteria).
- Lap timers, objectives, scoring beyond coins (covered in `animal-chase-and-coins.md`).

## User stories

1. As a player, I want to drive my truck around the farm using simple keyboard controls, so a young child can pick it up and play without instructions.
2. As a player, I want higher-tier wheels to let me get over bigger obstacles that lower tiers can't, so upgrading feels meaningful while I'm actually driving.
3. As a player, I want the stub terrain to actually contain a bush, a rock, and a derelict car, so all three wheel tiers have something real to be tested against this sprint, not just a theoretical stat.
4. As a player, I want my gas tank to drain while I drive and refill automatically when I stop, so I have to manage pacing without ever being hard-blocked from playing.

## Acceptance criteria

### Driving (keyboard-only, confirmed)

- **AC1 (finalized control scheme):** Sprint 1 driving controls are keyboard-only: Up Arrow / W = accelerate forward, Down Arrow / S = brake/reverse, Left Arrow / A = steer left, Right Arrow / D = steer right. No touch or gamepad input is required or expected this sprint.
- **AC2:** Given the truck has been built, when the player presses the accelerate/brake/steer keys, then the truck accelerates/decelerates/turns smoothly, with top speed capped at the built truck's engine-tier value.
- **AC3:** Given a young child as the target user, the control scheme uses exactly these 4 keyboard inputs, with no combo inputs, modifier keys, or precision timing required.
- **AC4:** Given the stub terrain, when the player drives to its edges, then the truck is gently kept within the playable area (e.g., a soft boundary) rather than being able to drive off into an undefined void or getting stuck.

### Wheel-tier obstacle clearance

- **AC5 (obstacle instances present — finalized, confirmed):** The Sprint 1 stub terrain includes at least one placed, functional instance each of: a bush (small obstacle), a rock/boulder (medium obstacle), and a derelict old car (large obstacle) — even though broader farm dressing (windmill, barn, farmhouse, river, mountains) remains deferred. This is required so AC6-AC8 below are actually verifiable this sprint, and is no longer a placeholder/open item.
- **AC6:** Given a truck with wheel Tier 0, when it drives at the bush, then it passes over normally; when it drives at the rock or derelict car, then it is blocked (cannot pass, must go around) with no damage or penalty applied.
- **AC7:** Given a truck with wheel Tier 1, when it drives at the bush or rock, then it passes over normally; when it drives at the derelict car, then it is blocked.
- **AC8:** Given a truck with wheel Tier 2, when it drives at any of the bush, rock, or derelict car, then it passes over normally.
- **AC9:** Being blocked by an obstacle above the truck's clearance never counts as a "hit" against body capacity and never triggers any fail state — it's purely a movement constraint.

### Gas drain and regen

- **AC10:** Given a full gas tank, when the player drives continuously at any throttle above idle, then the tank's remaining capacity decreases at a constant per-second rate (rate itself TBD — see Open Question 1), reaching empty after the built truck's tier-specific duration (see `truck-builder-and-upgrades.md`).
- **AC11:** Given an empty tank, when the player continues to hold throttle, then the truck can still move but its top speed is capped at a reduced "limp" value (proposed: roughly 25% of the truck's normal top speed — see Open Question 2) rather than stopping completely; this is a deliberate no-fail-state design choice and must never be a hard stall.
- **AC12:** Given the truck is idle (no throttle input and effectively stationary) for a continuous period, when idle time accumulates, then the gas tank refills at a defined per-second regen rate (see Open Question 1) up to full capacity, with no separate refill location required.
- **AC13:** Given the tank has regenerated above 0, when the player resumes driving, then full top-speed capability (per the truck's engine tier) is restored immediately — the truck does not require a full tank to leave "limp" mode (proposed; see Open Question 2 — this is the more forgiving of two reasonable interpretations and should be confirmed).
- **AC14:** There is no UI-visible "game over" or blocking failure state anywhere in the gas system — the only visible effect of running out of gas is reduced top speed until idle-regen kicks in. (Contrast with `farmer-minimal-bump.md`, whose body-hit system is the one Sprint 1 system with a confirmed hard-game-over exception; the gas system is not part of that exception.)

## Open questions

The following is now resolved and kept here only for traceability:
- **Input device target:** confirmed keyboard-only for Sprint 1 (arrow keys / WASD, see AC1). Touch and gamepad are out of scope this sprint.
- **Obstacle instances in stub terrain:** confirmed included (see AC5).

Remaining open questions:
1. **Gas drain/regen rate tuning:** Exact numeric drain rate (tank-% per second while driving) and regen rate (tank-% per second while idle) aren't specified. Acceptable to ship Sprint 1 with placeholder/tunable constants (e.g., in a config file) that a human can adjust after playtesting with the target child, rather than get the numbers "right" up front?
2. **Empty-tank "limp mode" behavior:** Two candidate interpretations were considered — (a) capped at a fixed low speed regardless of engine tier (as drafted in AC11), or (b) capped at a fixed *percentage* of the truck's own top speed (so a high-engine-tier truck still limps faster than a low-tier one). AC11 assumes (a) for simplicity; confirm before this is finalized, since it affects whether higher engine tiers stay useful even while low on gas.
3. **Soft boundary behavior (AC4):** Should driving to the terrain edge just gently push the truck back (invisible wall), or should there be a visible edge/fence given the farm setting? This is a minor UX detail but worth a decision before implementation to avoid rework.

## Constraints

- Stub terrain only in Sprint 1 (no full farm dressing), but it must include the three functional obstacle instances per AC5 — this is now confirmed, not a placeholder.
- Keyboard-only input for Sprint 1 (confirmed) — do not design for touch/gamepad this sprint.
- Runs in-browser (Three.js + Vite) — noted as a given constraint, not a decision made here.
