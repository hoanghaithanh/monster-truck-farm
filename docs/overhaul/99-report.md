# 99 — Overhaul report

Branch: `overhaul/fable` (your working game is untouched on `main`). Date: 2026-11-12.

The game was rebuilt rather than polished: new simulation, new physics, new art, new UI, new audio. About 5,100 lines of TypeScript replaced about 15,700; the shipped download went from roughly 7 MB (models + physics WASM) to **185 kB gzipped**, with no asset files at all.

## 1. Before / after

- Before: [`before/`](before/) — 22 screenshots of `main` (builder, driving, idle).
- After: [`after/`](after/) — 14 screenshots (garage at three upgrade levels, boop chain, nitro, big air, first seconds, river, farmer chase and bump, golden hour, pause/settings, summary).
- GIFs: [`after/garage-upgrade.gif`](after/garage-upgrade.gif), [`after/boop-chain.gif`](after/boop-chain.gif), [`after/big-air.gif`](after/big-air.gif).

Best single comparison: `before/02-spawn.png` against `after/07-first-seconds.png`.

## 2. What changed

### A. Game feel
- **New arcade physics** (`src/core/truck.ts`): velocity with lateral slip, so the truck slides and drifts; gravity over the terrain, so it hops crests and flies off ramps; jump; nitro. Stock top speed went from 6 to 16 units/s; the top engine does 30.
- **Chase camera**: lag, look-ahead into turns, speed FOV (60° to 76°, more on nitro), trauma-based shake, follows direction of travel in the air so spins are visible, pulls in around buildings and tree crowns, never dips below terrain.
- **Boop feedback**: hit-stop, shake, suspension kick, per-species particle burst, glowing stars, coins that fly to the truck, floating "+N", species voice plus a coin ping that climbs a pentatonic ladder with the combo.
- **Truck motion**: per-wheel ground following, body pitch/roll/squash on a spring, dust coloured by surface, mud chunks, water spray, drift smoke and tyre marks, exhaust flames, nitro trail, radial blur and speed lines, slow-motion on big air.
- **Rewards**: combo counter with timer bar, chain call-outs, style call-outs, confetti, mission pay-outs with bonus daylight, animated end-of-run tally and medal.

### B. Graphics
- **Art direction "toy-box farm"**, fully procedural: every model is rounded primitives merged into vertex-coloured meshes.
- **World**: vertex-painted terrain (grass patches, dirt tracks, sand banks, mud, field soil), animated water with shore foam, 26k wind-swayed grass tufts that flatten under the truck, flower drifts, corn/wheat/sunflower fields, 240 trees, barn, farmhouse with chimney smoke, silo, spinning windmill, coop, well, arched bridge, 7 ramps, stunt park, pond with island, big hill, rim hills and mountains that hide the world edge, clouds, birds.
- **Lighting**: sun + hemisphere + environment map, soft shadows following the truck, sky gradient with sun disc, fog, bloom, vignette. Time of day runs morning to sunset across each run.
- **The truck**: 4 tiers on each of 4 axes, all visibly different (4^4 = 256 combinations). Candy clear-coat paint, googly headlight eyes that blink and look where you steer, toothy grille, chrome, tall shocks, treaded tyres. Higher tiers add fender flares, bull bar, roll bar, light bar, wing, neon underglow and rims, blower with zoomie pipes, exhaust stacks, rocket nozzles, glowing nitro tanks. 8 paints, 5 decals.
- **Animals**: chicken, pig, sheep, cow with big eyes, blinking, grazing dips, waddle-hops, wide-eyed panic, tumbling flight, squash on landing, dizzy eyes. Rare golden variants.
- **Farmer**: round moustachioed man on a green tractor with angry eyebrow headlights; shakes his fist, gloats, covers up when honked at.
- **UI**: chunky rounded toy style, icon-first; garage with turntable showroom in the farmyard, hover-to-inspect camera, purchase celebration; HUD with coins, hearts, sun-on-a-track day timer, mission cards, nitro bar, combo badge, heading-up minimap, edge arrows to the farmer and golden animal.

### C. Depth and loop
- A run is **one farm day** (150 s, +10 s per mission). Persistent garage instead of a hard reset.
- Combo multiplier to x8, "Strike!" when a flying animal bowls over another, style scoring for air/spins/backflips/drifts/smashes, stunts refill nitro.
- 16 mission types, three shown at a time, the first few chosen so a key-masher completes them by accident.
- Random events (golden animal, stampede, chicken party, nitro drop), 5 hidden golden corn per run out of 10 spots, coin arcs over ramps.
- ~190 smashable props; rocks, boulders and old cars are gated by wheel tier (cars get pancaked).
- Farmer: telegraphed, doubles coins while chasing, one heart per visit, eases off after each catch and after a lost run. Escapes: outrun, juke, jump over, honk-stun, or cross the river.
- Gas became nitro: driving is never rationed.

### D. Audio
- Entirely synthesized WebAudio: engine with a fake gearbox, tyre noise, nitro whoosh, per-species boop voices, startled squeaks, coin ladder, smashes by material, landing thumps, a horn that deepens with engine tier, farmer stinger, UI sounds, and a four-bar adaptive music loop (calm in the garage, driving, faster with snare when chased/boosting/near sunset). Volume and music toggle; starts on first input.

### E. Controls and accessibility
- Keyboard, gamepad, touch buttons. Horn on its own key.
- Pause menu: volume, music, graphics quality, screen shake and flashes (defaults off if the OS asks for reduced motion), driving helpers.
- UI is rem-based and scales from phone-landscape to 4K. Threats are signalled by icon, text and arrow, not colour alone.

### F. Performance and robustness
- Quality Low/Med/High with an auto probe; pause on tab blur; resize; WebGL context loss reloads; loading screen with progress.
- `core/` is a headless deterministic simulation. 27 tests, including bots that play whole runs (competent, key-mashing, maxed truck, determinism).
- Typecheck, lint, tests and build are green at every commit.

### Decision log

| Decision | Alternatives | Why |
|---|---|---|
| Rewrite instead of iterating | Polish existing systems | Kinematic controller could not jump or slide; scene file was 2,000 lines tied to mismatched sourced art |
| Drop Rapier for custom physics | Rapier vehicle controller | Needed drift, air and tricks with full control over feel; removes 2 MB of WASM and a known crash |
| All-procedural art | Source better CC0 packs | One coherent style, everything animatable, no download, no licensing; sourced packs caused the style clash in the first place |
| Timed day with persistent garage | Keep endless session + hard game over | A run needs an end, a score and a "one more go"; losing everything is the wrong punishment for a 6-year-old |
| Gas becomes nitro | Keep drain/limp, or remove the tank | Rationing the core verb was the least fun part; a boost meter keeps the fourth upgrade axis meaningful |
| Farmer on a tractor, one heart per visit | On foot at 1/3 speed; multi-hit chase | On foot he is no threat at the new speeds; bots that ignored a multi-hit farmer were busted in under a minute |
| Backflip only on brake | Throttle flips | Everyone holds the gas over ramps, so flips happened by accident and looked broken on landing |
| Showroom is the farmyard | Separate dark studio scene | Cheaper, and animals wander into shot |
| Paint and decals free | Unlock with medals | Immediate personalisation for a child; unlocks are on the backlog |
| Costs raised and medals at 2.5k/8k/20k/45k | First-draft values | A competent bot earned 1,536 coins and 20k score on a stock truck with the first draft |
| DOM HUD, emoji icons, Google font | Canvas UI, custom icon set, bundled font | Fast and crisp; emoji vary by OS and the font needs a network (falls back to system fonts) |

## 3. Candid self-assessment

| Area | Score | Why |
|---|---|---|
| Graphics | 7.5 | Coherent, bright and charming; a real transformation. Still obviously primitives up close: no textures, animals are rigid bodies without leg animation, buildings are simple. |
| Game feel | 7 | Much is in place and it reads well in captures. But I tuned it through a script and screenshots, never with hands on keys. Handling numbers are a first guess. |
| Fun for the 6-year-old | 7.5 | The first seconds deliver, failure is nearly impossible, the truck progression is loud. Unproven on a real child. |
| Fun for the 30-year-old | 6 | Combos, tricks, farmer baiting, secrets and medals exist, but one map and shallow trick scoring will wear thin within a few sessions. |
| Performance | 6.5 | Locked at 144 fps on the RTX 3070 Ti here even at 4K, which says nothing about a mid-range laptop. ~1.25M triangles on High is more than I planned; the auto probe should step down, but that is untested on weak hardware. |
| Polish | 6.5 | No known crashes, clean console, consistent UI. Rough edges below. |

**What I could not verify**
- **Audio was authored blind.** I cannot hear. It runs without errors and the levels are conservative, but the engine loop or music may be grating. Please listen early; there is a music toggle.
- **No human played it.** Everything was driven by bots in headless Chrome (the Chrome extension was not connected, so I used `puppeteer-core`).
- **Gamepad** is implemented to the standard mapping and untested on a device. **Touch** was only emulated.
- **Mid-range hardware** was not available.

**Weak spots and known bugs**
- Shadows shimmer slightly at speed (no texel snapping).
- The farmer's tractor drives through trees and props.
- Hitting a ramp from the side or back pops the truck upward.
- Animals slide a little on slopes and can clip each other.
- A key-mashing bot spent up to 8.5 s pinned against a prop it could not smash; a child will steer away, but there is no auto-unstick.
- Decals are hidden by the fender flares on bigger bodies.
- Slow-motion does not pitch the audio.
- Emoji icons look different per operating system.

**Cut deliberately:** weather, night driving, limb animation, a second map, medal-gated cosmetics, key remapping, texture work, an online leaderboard.

**With another day:** hands-on handling tuning, an audio pass with ears, leg animation and more idle behaviours, shadow stabilisation, trick depth (wheelies, landing bonus), a seeded daily challenge for the adult, and a pass on weak hardware.

## 4. Running it

```bash
git checkout overhaul/fable
npm install
npm run dev        # http://localhost:5173/monster-truck-farm/
npm run build      # typecheck + production build (dist/, ~185 kB gzipped)
npm test           # 27 tests passing
npm run typecheck  # clean
npm run lint       # clean
```

Controls are in the [README](../../README.md) and in the pause menu. To reset progress, clear the `monster-truck-farm-v2` key in the browser's local storage.
