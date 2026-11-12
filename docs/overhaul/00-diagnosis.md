# 00 — Diagnosis (played 2026-11-11, `main` @ 94f7141)

Played at 1366x768 in real Chrome (RTX 3070 Ti, ~140 fps) with scripted keyboard input: builder → drive ~75 s around the farm → idle ~60 s. Screenshots in `before/`.

**Headline finding:** in ~2.5 minutes of play I earned **0 coins, booped nothing, and never saw the farmer**. A script isn't a child, but a game where random driving produces *no event at all* for two minutes has a pacing problem, not just an art problem.

## What looks ugly

- **The ground is one flat green colour.** No texture, no variation, no grass, no paths. ~70% of every frame is a single `#44753a` fill (`before/02`, `17`).
- **No shadows, no atmosphere.** One white directional + grey ambient. Nothing is grounded; trees and truck float. Sky is a single flat blue with no clouds, sun, fog or horizon.
- **The world visibly ends.** Drive 20 s in any direction and you see the hard edge of a green slab against blue void (`before/08`, `17`-`22`). Reads as a tech demo.
- **The truck is nearly black.** Dark teal body + pure black tyres with no readable tread, face, lights or shine (`before/02`). In the builder it's a 220 px thumbnail that's ~60 px of actual truck (`before/01`).
- **Mismatched asset styles.** Realistic gnarled trees, a photo-textured grey farmhouse, low-poly rocks, a grey box-art boulder, spindly dark corn. Four art styles in one frame (`before/10`).
- **Everything is dark and desaturated.** Fences/trees/corn render near-black (sourced PBR materials with no environment light). The palette is army-green/brown/black — the opposite of "candy".
- **The river is a flat dark-blue strip** with no banks, motion, or foam.
- **Animals are tiny dark specks** (a chicken is ~10 px, dark red on dark green — `before/10`). No faces visible at play distance.
- **Builder UI is a developer form**: dark panel, text rows reading "Tier 0 — 3 hits", "clears medium", "20s of drive". Unusable for a pre-reader, joyless for an adult.
- **HUD** is a small grey box; the gas bar is unlabeled.

## What feels bad

- **Speed.** Stock top speed is 6 units/s with 6 u/s² accel; crossing the map takes ~30 s of holding W. No sense of speed at all — fixed FOV, no particles, no camera motion.
- **Steering is on rails.** Constant turn rate, zero slip, zero body roll that reads. No weight.
- **Camera** is rigidly bolted behind the truck — no lag, look-ahead, FOV kick or shake.
- **Nothing reacts.** No dust, no tracks, no sound *at all* (the game is completely silent).
- **Gas is a punishment loop.** 20 s of driving, then limp at 25% speed until you stop and wait. The core verb (drive) is rationed and the recovery verb is "do nothing".
- **No vertical play.** Truck is glued to the ground; hills only tilt it. No jumps, no air.
- **Farmer** is capped at 1/3 truck speed — he is not a threat while moving, and losing to him = lose everything (hard reset), so the only way to lose is the most frustrating one.

## What is boring

- **Sparse:** max 5 animals on a huge map, new one every 4 s, tiny and hard to see. Most of a session is driving across empty green.
- **One verb, one reward:** touch animal → number goes up. No combos, goals, surprises, secrets, or run structure. There is no "run" — no end, no summary, no best score.
- **Upgrades are invisible in play** — +3 top speed and one extra heart; the first purchase needs 40 coins that took me >2 min to not earn.
- **No onboarding and no goal communicated** once driving starts.

## What's good and must be preserved

- The **core fantasy** (build a monster truck → chase farm animals → upgrade) is right.
- **Four upgrade axes with distinct jobs** (body = hearts, wheels = what you can drive over, engine = speed, tank = fuel) is a clean, kid-legible structure.
- **Animals "boop and scatter", never harmed.** Keep the tone.
- **Farm setting & landmarks** (barn, windmill, silo, river, fields, fences that break).
- **Clean pure-logic `core/` with tests, lint boundary, CI.** Keep the discipline, not the code.
- **Performance headroom is huge** (140 fps): plenty of budget for shadows, post-FX, grass and particles.
