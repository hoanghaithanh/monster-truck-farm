# Fuel Pickups

Status: Sprint 2 (added mid-sprint during review of the farmer chase-timer design — confirmed by the human as in-scope for this sprint, not deferred).

## Problem statement

The existing gas system (`drive-terrain-and-gas.md`) only lets a player refill by stopping and idling — a passive, do-nothing wait that doesn't fit a driving game aimed at short, energetic play sessions for a young child. This document specifies fuel pickups: a map item, spawned the same way animals are, that the player drives over to refill gas instead of waiting for it to regen. It gives the player an active, exploration-rewarding alternative to idling, without changing the underlying no-fail-state gas mechanic it plugs into.

## Goals / Non-goals

**Goals**
- Fuel pickups spawn randomly on the stub terrain, using the same validity rules (not inside an obstacle/structure, not on top of the player) already established for animal spawns.
- Driving over a fuel pickup is a positive, passive, non-violent interaction — explicitly not a "boop": nothing flees or scatters, since a fuel pickup isn't alive.
- Collecting a fuel pickup refills the player's gas tank, giving pacing an active option alongside the existing idle-regen path — it does not replace or change idle-regen (`drive-terrain-and-gas.md` AC12 stays as-is).

**Non-goals (Sprint 2)**
- Any change to the existing gas drain rate, idle-regen rate, or limp-mode behavior — this doc only adds a new way to add gas to the tank; `drive-terrain-and-gas.md` AC10-AC14 are unchanged.
- Coin rewards for collecting fuel — collecting fuel never awards coins, and booping an animal never affects gas. The two pickups are reward-orthogonal.
- Any interaction with the farmer/chase-timer mechanic (ADR 0007, still in progress) — fuel pickups are a resource-management/exploration mechanic, independent of farmer difficulty. This doc does not take a position on the farmer speed-floor question.
- New art/asset direction beyond "a recognizable fuel item" (e.g., gas can/jerry can) — exact visual asset is an art/architecture decision, not specified here.
- Multiple fuel item types/tiers (e.g., "big" vs "small" fuel pickups with different refill values) — Sprint 2 ships one fuel pickup type with one refill value.

## User stories

1. As a player, I want fuel pickups to randomly appear around the farm, so I have an active way to manage my gas besides idling.
2. As a player, I want driving over a fuel pickup to refill my gas tank, so exploring the farm is rewarded without any violent or negative framing.
3. As a player, I want fuel pickups to feel like collecting a resource rather than booping an animal, so it's visually and behaviorally clear they're a different kind of pickup.

## Acceptance criteria

### Spawning

- **AC1:** Given an active play session, when the elapsed time/conditions for a fuel-pickup spawn trigger are met, then a new fuel pickup appears at a random valid location on the terrain (not inside an obstacle or structure, not on top of the player) — the same validity rules already used for animal spawns (`animal-chase-and-coins.md` AC1).
- **AC2:** Given a maximum concurrent-fuel-pickup count (exact number TBD, see Open Question 1) is already reached, then no new fuel pickup spawns until one is collected or otherwise removed.
- **AC3 (independent from animal spawns — decision, not open):** Fuel pickup spawning runs as its own parallel system with its own spawn timer and its own concurrent cap, entirely separate from `MAX_CONCURRENT_ANIMALS`/the animal spawn timer. An animal and a fuel pickup can both be active on the map at the same time; collecting or not collecting one has no effect on the other's spawn cadence or cap.
- **AC4:** Fuel pickup spawn timing and positioning behave equivalently in spirit to the animal spawn system (same fairness/validity rules — random, not clustered near the player, not inside obstacles) even though it is a separate system with its own tunable interval/cap.

### Collection mechanic

- **AC5:** Given the player's truck makes contact with a fuel pickup, contact is detected via the same style of circle-overlap check already used for animal boop contact (truck radius + pickup radius), applied here to the fuel pickup's radius instead of an animal's.
- **AC6 (decision — passive "drive over," not a boop):** Fuel pickup collection is explicitly not framed as a boop: there is no scatter/flee reaction, since the pickup is inanimate. On contact: (a) the gas tank is refilled per the payoff rule below, (b) a brief, positive, non-violent pickup effect plays (e.g., a glow/sparkle burst and/or pickup sound — exact asset is an art/dev decision, not specified here), (c) the fuel pickup is removed from play immediately (see Visual/despawn behavior below), and (d) a new fuel pickup may spawn later, subject to AC2.
- **AC7:** Collecting a fuel pickup never awards coins, never reduces or increases the truck's hit capacity, and never interacts with the farmer/hard-game-over condition in any way — it affects the gas system only.
- **AC8:** The gas refill is visibly communicated to the player at the moment of contact (the on-screen gas gauge visibly increases), so a young child gets clear, immediate positive feedback, matching the coin-award feedback pattern in `animal-chase-and-coins.md` AC6.

### Payoff (gas refill amount)

- **AC9:** A collected fuel pickup adds a flat amount of gas (same units as gas capacity/drain, i.e., "seconds of drive" per `drive-terrain-and-gas.md`) to the current tank level — not a percentage of the tank's capacity. Exact numeric value is a placeholder pending tuning (see Open Question 2), analogous to the existing gas drain/regen rate placeholders in `drive-terrain-and-gas.md` Open Question 1.
- **AC10:** The refill is clamped so the tank never exceeds the truck's current built gas capacity (mirrors the existing regen clamp in `drive-terrain-and-gas.md` AC12) — collecting fuel with a nearly-full tank simply tops it off rather than overflowing or being wasted/blocked.
- **AC11 (flat amount, deliberately not scaled by tank tier):** Because the refill is a flat amount rather than a percentage, it restores a larger fraction of a smaller (Tier 0) gas tank than a larger (Tier 2) tank — this is intentional: fuel pickups matter more to a player who hasn't upgraded their gas tank yet, giving early-game trucks a meaningful reason to seek pickups out, while still being useful (just less relatively impactful) on upgraded tanks.
- **AC12:** Given the tank is already full, when the player collects a fuel pickup, then nothing negative happens (no penalty, no coins lost) — the pickup is simply consumed with the excess refill discarded, and it still despawns per AC13.

### Visual/despawn behavior

- **AC13 (decision — instant collect, not scatter-then-despawn):** Unlike an animal boop (which plays a brief scatter/flee animation before despawning, per `animal-chase-and-coins.md` AC4a), a fuel pickup is removed from play immediately on contact, accompanied only by the brief pickup effect described in AC6b. There is no flee/scatter motion, since an inanimate fuel item has nothing to flee toward.

## Open questions

1. **Spawn interval and concurrent cap:** What's the target spawn interval and `MAX_CONCURRENT_FUEL` value? Not specified by this doc. Recommend shipping Sprint 2 with placeholder/tunable constants (mirroring `SPAWN_INTERVAL_SECONDS`/`MAX_CONCURRENT_ANIMALS` in `src/core/spawn/config.ts`) pending playtesting, consistent with how animal spawn cadence was left open in Sprint 1. As a starting placeholder, a somewhat longer interval than animal spawns (fuel pickups are a secondary, lower-frequency mechanic relative to the core chase loop) seems reasonable but is not a product-intent question — safe to leave as a tunable default.
2. **Refill amount:** What flat amount should a fuel pickup restore? As a placeholder consistent with AC9-AC11's intent (matters more on a small tank), something in the range of ~15 units — roughly 50-75% of the Tier 0 tank (20 units) but only ~33% of the Tier 2 tank (45 units) — seems like a reasonable starting constant, tunable after playtesting. Not a blocking question; a tuning constant like gas drain/regen rates already are.
3. **Visual asset:** What should a fuel pickup look like (gas can, jerry can, fuel drum, glowing canister, etc.)? Art/asset decision, not a requirements question — flag for architect/developer, non-blocking.
4. **Cross-spawn overlap avoidance (nice-to-have, not a hard requirement):** Should a fuel pickup's spawn position also avoid overlapping an already-active animal's current position (and vice versa), beyond the existing obstacle/truck avoidance? Would be a small polish item if the two systems' spawn-position logic is easy to share; not required for Sprint 2 acceptance given AC3's independence decision.

## Constraints

- Non-violence/positive framing is a hard constraint, same as the animal boop system: no damage/negative framing, no "using up" the pickup in a way that reads as loss — collecting fuel is purely a reward.
- Runs in-browser (Three.js + Vite) — given constraint, not a decision made here.
- Must integrate with the existing gas system's clamping/no-fail-state behavior (`drive-terrain-and-gas.md` AC10-AC14) without altering it — fuel pickups are additive to that system, not a replacement.
