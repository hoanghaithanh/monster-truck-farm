# Backlog

The single prioritized list of work not yet pulled into a sprint. Owned by the `project-manager` agent (ordering/prioritization); populated by the `requirements-analyst` agent (new stories) as it writes requirements docs.

Ordered top-to-bottom by priority. Entries move out of this list into a sprint milestone during sprint planning, and back in if they're descoped or carried over undecided.

| Priority | Story | Size | Requirements doc | Status |
|---|---|---|---|---|
| 1 | As a player, I want to choose a body part when building my truck, so my truck's hit capacity (damage capacity) is set | S | [truck-builder-and-upgrades.md](requirements/truck-builder-and-upgrades.md) | Sprint 1 |
| 2 | As a player, I want to choose wheels when building my truck, so the size of obstacle my truck can drive over is set | S | [truck-builder-and-upgrades.md](requirements/truck-builder-and-upgrades.md) | Sprint 1 |
| 3 | As a player, I want to choose an engine when building my truck, so my truck's top speed is set | S | [truck-builder-and-upgrades.md](requirements/truck-builder-and-upgrades.md) | Sprint 1 |
| 4 | As a player, I want to choose a gas tank when building my truck, so how long I can drive before needing a break is set | S | [truck-builder-and-upgrades.md](requirements/truck-builder-and-upgrades.md) | Sprint 1 |
| 5 | As a player, I want to drive my truck around the stub farm terrain with simple keyboard controls (confirmed: arrow keys/WASD, no touch/gamepad this sprint), so a young child can play short sessions easily | M | [drive-terrain-and-gas.md](requirements/drive-terrain-and-gas.md) | Sprint 1 |
| 6 | As a player, I want higher-tier wheels to let me get over bigger obstacles (bush -> rock -> derelict car) that lower tiers can't, so upgrading feels meaningful while driving | M | [drive-terrain-and-gas.md](requirements/drive-terrain-and-gas.md) | Sprint 1 |
| 7 | As a player, I want the stub terrain to actually include a bush, a rock, and a derelict car, so all three wheel tiers are testable this sprint even though full farm dressing is deferred (confirmed, finalized — not a placeholder) | S | [drive-terrain-and-gas.md](requirements/drive-terrain-and-gas.md), [truck-builder-and-upgrades.md](requirements/truck-builder-and-upgrades.md) | Sprint 1 |
| 8 | As a player, I want my gas tank to drain while I drive and auto-refill while idle, so I have to pace my play without ever being hard-blocked | M | [drive-terrain-and-gas.md](requirements/drive-terrain-and-gas.md) | Sprint 1 |
| 9 | As a player, I want animals to randomly appear around the farm, so there's always something to chase | M | [animal-chase-and-coins.md](requirements/animal-chase-and-coins.md) | Sprint 1 |
| 10 | As a player, I want to gently "boop" an animal with my truck to scatter it and earn coins, with no violent framing | M | [animal-chase-and-coins.md](requirements/animal-chase-and-coins.md) | Sprint 1 |
| 11 | As a player, I want bigger/faster animals to be worth more coins, so aiming for harder targets (which rewards a better engine) feels worthwhile | S | [animal-chase-and-coins.md](requirements/animal-chase-and-coins.md) | Sprint 1 |
| 12 | As a player, I want an angry farmer to occasionally appear and bump my truck, draining one hit, so the body's hit-capacity stat has a testable payoff (minimal Sprint 1 version — no chase timer/tired logic yet) | M | [farmer-minimal-bump.md](requirements/farmer-minimal-bump.md) | Sprint 1 |
| 13 | As a player, when my hit capacity reaches 0, I want the run to end (hard game over) and return me to the truck builder to start a fresh run, so the stakes of the farmer mechanic are clear | M | [farmer-minimal-bump.md](requirements/farmer-minimal-bump.md) | Sprint 1 — finalized: hard game over confirmed by the human as a deliberate exception to the general no-fail-state bias (recorded in project CLAUDE.md); supersedes the earlier "soft recovery" draft of this story |
| 14 | As a player, I want to spend the coins I've earned to buy an upgrade in one of the four builder categories, so my truck actually gets stronger over time | M | [truck-builder-and-upgrades.md](requirements/truck-builder-and-upgrades.md) | Sprint 2 |
| 15 | As a player, I want the farmer to chase me for ~10 seconds at 1/3 my speed and then give up ("tired") if he doesn't catch me, so encounters feel fair and skippable | M | [farmer-minimal-bump.md](requirements/farmer-minimal-bump.md) | Sprint 2 |
| 16 | As a player, I want the farm dressed with a windmill, barn, farmhouse, river, and mountains so the world feels like a real place, not just a stub | L | N/A — will get its own requirements doc when scheduled | Backlog (Sprint 2+) |

<!-- Example row:
| 1 | As a user, I want to reset my password via email | M | [docs/requirements/password-reset.md](requirements/password-reset.md) | Backlog |
-->
