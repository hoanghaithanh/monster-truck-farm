# 01 — Overhaul plan

## Art direction: "Toy-box farm"

Everything looks like a chunky vinyl toy on a sunny play-mat: rounded low-poly shapes, saturated candy colours, big glossy eyes on anything alive (including the truck), soft shadows, warm light. Nothing sits still — everything bobs, blinks, sways or squashes.

**All art is procedural** (built in code from rounded primitives), not sourced glTF. Why: one coherent style across truck/animals/world, every part animatable (squash, blink, tier morphs), ~0 download, and no more mismatched packs. The old `.glb` set is removed.

References (described):
1. Vinyl farm-animal toys — sphere-ish bodies, stub legs, oversized heads and eyes.
2. Die-cast toy monster trucks — tiny cab, absurd tyres, chrome blower, flame decals, candy clearcoat.
3. Soft-toon island/village games — pastel sky gradient, puffy clouds, rounded trees, flower-speckled grass.
4. Stop-motion clay sets — slightly matte world so the glossy truck pops as the hero.
5. Kart-racer juice — speed lines, boost flames, drift smoke, pop-up score text.

Palette: grass `#7ed957` / `#5fc24a`, path `#f2c98a`, water `#4fd0e8`, sky `#6ec6ff → #fff3c4`, barn red `#ff5a4f`, sun yellow `#ffd23f`, pink `#ff8fc7`, purple `#9b6bff`, cream `#fff6e0`, ink `#2b2440` (never pure black).

## Game design decisions

- **A run is one "farm day"**: 150 s sun-rise → sunset (the sky *is* the timer). Completing a mission adds +10 s. Run ends at sunset (celebration) or 0 hearts ("Busted!", keep your coins). Then tally → garage → go again.
- **Persistent garage** (localStorage): coins and parts carry over. The old hard-reset is dropped — "one more run" beats "start over".
- **Gas → Nitro.** The tank no longer rations driving; it's a boost meter (Shift). Regenerates slowly, refilled by fuel cans and stunts.
- **Jump** (Space), **horn** (H/E — startles animals, stuns the farmer briefly), **air tricks** (steer/throttle in the air = spins/flips, scored).
- **Custom arcade physics** (velocity + slip + gravity over the height function); **Rapier removed** (no jumps/drift possible with the kinematic controller, 2 MB WASM, crash-prone).
- **Scoring**: boops chain a combo (x1…x10, 3.5 s window), air/drift/tricks/smashes add style. Medals at score thresholds; local bests.
- **Animals**: chicken, pig, sheep, cow + rare **golden** variants (5× coins, fast). ~40 alive, in herds.
- **Farmer drives a putt-putt tractor.** Telegraphed (icon, arrow, music). Bump = lose a heart + drop coins + comedy spin. Escape by outrunning, crossing the river (he can't), or honking. Chase = coins ×2 (risk/reward). Adaptive: eases off after bumps and lost runs.
- **4 tiers × 4 axes**, each tier dramatically changes the silhouette. First upgrade costs 30 coins (reachable in run one).
- **Missions** (3 visible, icon-first), **random events** (stampede, golden animal, fuel drop), **5 hidden golden corn** per run, **ramps**, **smashables** (hay, fences, crates, pumpkins, scarecrows; rocks and old cars gated by wheel tier).
- **Assists on by default** (steer assist toward nearby animals, big boop radius); toggles in pause menu.

## Priorities

1. Handling + camera + world look (the frame you stare at)
2. Boop juice + combo + audio
3. Truck hero model, tiers, garage showroom
4. Run structure: timer, missions, summary, medals, save
5. Farmer, events, secrets
6. Gamepad/touch, settings, quality probe, docs

## Risks

- Scope: single pass, huge surface → build in vertical slices, screenshot each.
- Procedural art can look programmer-y → big eyes, rounded bevels, strong palette; look at every model in isolation.
- Synth audio can grate → short envelopes, low master gain, mute + volume control.

## Performance budget

- 60 fps on mid laptop @1080p on Medium. Draw calls < 300, triangles < 400k.
- Quality Low/Med/High toggles shadows, bloom, grass density, particle caps, pixel ratio; auto-picked from a frame-time probe.
- Download: JS only, **< 350 kB gzipped total** (was ~5 MB of models + 2 MB WASM). No model/texture/audio files.
