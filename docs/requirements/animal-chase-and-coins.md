# Animal Spawning, Chase & Coin Rewards

Status: Sprint 1.

## Problem statement

The core reward loop of the game is: chase an animal, gently bump it, get coins scaled by how big/fast it was, and (eventually) spend those coins on upgrades. This document specifies animal spawning, the non-violent "boop" interaction, and the coin formula, for Sprint 1's slice of that loop (spawn -> chase -> boop -> earn coins). It deliberately excludes spending coins — confirmed deferred to Sprint 2, see `truck-builder-and-upgrades.md`.

## Goals / Non-goals

**Goals**
- Animals spawn randomly on the terrain for the player to chase.
- Bumping an animal is a positive, non-violent interaction ("boop") that awards coins and never harms the animal or the player.
- Coin value scales with the animal's size and speed, so bigger/faster animals are a more valuable (and harder) target.

**Non-goals (Sprint 1)**
- Spending coins on upgrades — confirmed deferred to Sprint 2 (see `truck-builder-and-upgrades.md`; no longer a candidate/open item, it's a settled decision).
- Animal AI beyond fleeing when approached/booped (no herding, no complex pathing around obstacles required for Sprint 1, though animals should not obviously clip through terrain).
- Named/unique animal characters, cosmetic variety beyond a few species (cows, chickens, pigs, etc., as already specified).

## User stories

1. As a player, I want animals to randomly appear around the farm, so there's always something to chase during a play session.
2. As a player, I want to gently bump ("boop") an animal with my truck to make it scatter and earn coins, so the game rewards me for playing without any violent framing.
3. As a player, I want bigger and faster animals to be worth more coins, so aiming for harder targets (which benefits from a better engine) feels worthwhile.

## Acceptance criteria

### Spawning

- **AC1:** Given an active play session, when the elapsed time/conditions for a spawn trigger are met, then a new animal appears at a random valid location on the terrain (not inside an obstacle or structure, not on top of the player).
- **AC2:** Given a maximum concurrent-animal count (exact number TBD, see Open Question 1) is already reached, then no new animal spawns until one is removed (via boop or despawn).
- **AC3:** Animal species spawned include at least cows, chickens, and pigs, each assigned a size tier and speed tier (see below).

### Boop interaction

- **AC4:** Given the player's truck makes contact with an animal, when contact occurs, then: (a) the animal plays a non-violent "scatter" reaction (e.g., hop/run away, no damage animation, no blood/gore/ragdoll), (b) coins are awarded to the player per the formula below, (c) the animal is removed from play (or relocated) shortly after, and (d) a new animal may spawn later to replace it (subject to AC2).
- **AC5:** Booping an animal never reduces the player truck's body hit capacity, never counts as a "hit," and never contributes to the hard-game-over condition — only the farmer's bump does that (see `farmer-minimal-bump.md` AC3/AC6, confirmed hard game over at 0 hits). Booping animals is purely rewarding, with no downside risk to the player.
- **AC6:** The coin award is visibly communicated to the player at the moment of contact (e.g., a coin count increments and/or a brief on-screen effect), so a young child gets clear, immediate positive feedback.

### Coin scaling by size/speed

- **AC7:** Each animal has a size tier (e.g., Small/Medium/Large) and a speed tier (e.g., Slow/Medium/Fast). Coin value is computed from both: larger size and/or higher speed tier yields strictly more coins than a smaller/slower animal, all else equal.
- **AC8:** The exact numeric formula/table is not fixed by this doc pending Open Question 2 (relative tiers vs. concrete values); whatever is implemented in Sprint 1 must be expressed as data (a lookup table or formula), not hardcoded per-species, so it's tunable without a code change to the coin logic itself.

## Open questions

1. **Spawn cadence and cap:** What's the target spawn interval and max concurrent animal count? Not specified anywhere in current scope. Reasonable to ship Sprint 1 with placeholder/tunable values pending playtesting with the target child, similar to gas drain rates?
2. **Size/speed tiers — relative or concrete?** Can Sprint 1 ship with animals assigned to relative tiers (e.g., cow = Large/Slow, chicken = Small/Fast, pig = Medium/Medium) and a simple multiplier table, or does the human want specific coin values decided now? This is the same open question raised for engine speed tiers in `truck-builder-and-upgrades.md` — recommend resolving both at once since they interact directly (engine tier vs. animal speed tier is the "can I catch it" balance). Still open — not part of the 4 decisions resolved this round.
3. **Despawn behavior:** If an animal isn't booped, does it eventually wander off/despawn on its own (to make room for new spawns and keep the world from getting cluttered), or does it stay indefinitely until the max-concurrent cap forces churn? Minor detail but affects AC2's behavior.

## Constraints

- Non-violence framing is a hard constraint, not a preference: no damage numbers, no pain/hurt animations, no blood, no animal "defeat" state — animals are never harmed, only "booped" and scattered. Any implementation or asset (art, animation, sound) that reads as violent fails acceptance regardless of other criteria being met.
- Runs in-browser (Three.js + Vite) — given constraint, not a decision made here.
