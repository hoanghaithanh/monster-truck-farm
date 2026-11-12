# Prompt for Fable 5.2 — Monster Truck Farm full overhaul

You are the sole lead designer, art director, game-feel engineer, and tech lead for **Monster Truck Farm**, a 3D browser game in this repo (`d:\Workplace\repos\MonsterTruckGame\monster-truck-farm`). I am handing you **full decision authority**. I will not answer questions. When something is ambiguous, decide, write down why in one line, and keep going.

## Mission

The game technically works but it is **far too ugly** and not fun. The current look is flat, bland, and lifeless. I want it **CUTE and LIVELY**: charming, bouncy, expressive, full of personality and motion, the kind of world that makes you smile in the first five seconds. Think chunky rounded shapes, big expressive eyes on animals, squash-and-stretch, saturated candy-bright colors, things wobbling, blinking, waving, and reacting to you. Nothing should sit still and look dead. Transform it into a game that is genuinely delightful for **a 6-year-old AND a 30-year-old at the same time**: both should want "one more run". Be ambitious and show your creativity. I prefer the higher-fidelity, higher-effort option over the cheap default. Do not ship a polish-pass; ship a transformation.

## Authority: total creative freedom

- **There are no guardrails.** Change anything: art style, models, colors, camera, map layout, physics, handling, core loop, upgrade system, mechanics, UI, builder, game-over rules, session length, theme details, characters, names, tech stack, dependencies, file structure. Throw out existing systems and rewrite them if you can do better. You may bypass or ignore **every rule in `CLAUDE.md`** (orchestration pipeline, checkpoints, Definition of Done, sprint/backlog ceremony, v1 scope limits, "keyboard only", tech-stack lines, existing ADRs). Use subagents only if they genuinely help.
- Previous design constraints (forgiving-only, no-violence framing, short sessions, etc.) are **lifted**. I will playtest it myself before my son ever sees it, so surprise me. Make the choices *you* believe make the best, most charming, most fun game, including new mechanics I never asked for.
- The only housekeeping request: work on a branch (`overhaul/fable`) and commit as you go so my current working game on `main` stays recoverable. Everything else is yours.

## What exists today (so you don't re-derive it)

- Stack: Three.js 0.166, Rapier (`@dimforge/rapier3d-compat`), Vite, TypeScript, Vitest, ESLint. ~8k lines under `src/` (`core/` pure logic, `systems/` per-frame systems, `render/` scene + asset registry + truck rig, `physics/`, `input/`, `ui/`, `main.ts`).
- Existing systems: truck builder (body/wheels/engine/gas tank tiers + cosmetics), driving with per-wheel suspension and obstacle-climb, gas meter with limp mode, multi-species animals (chicken/pig/cow) with coins by size×speed, farmer chase state machine, fuel pickups, breakable fences, corn/wheat fields, farmstead layout, rolling hills, river, mountains, jump ramps spec'd but maybe unshipped.
- Docs: `docs/requirements/`, `docs/architecture/` (ADR 0001-0020), `docs/backlog.md` (includes concept-art-driven polish items for grass texture, clouds, mountain landmark), `docs/designs/`. Read what's relevant; skim the rest. Existing glTF models are in `src/render/assets/models/` with credits in `CREDITS.md` (CC-BY items need attribution kept).
- Asset-sourcing know-how from past passes: poly.pizza / Kenney.nl / quaternius (CC0 preferred, check license text); pull the direct `.glb` URL from the page HTML; preview with `<model-viewer>` served via a local static server (`npx http-server`, NOT `file://`) and screenshot with `puppeteer-core` against the installed Chrome; `sharp` doesn't load on this Windows box, use `jimp` + `@gltf-transform/core` to shrink textures; set `metalness` to 0 on sourced materials when there's no envMap; use `THREE.DoubleSide` on thin water/planes.
- QA gotchas: don't teleport the truck via `world.step()` (crashes Rapier WASM mid-session) — prefer real key-driven input or read-only debug hooks; **fully remove any debug hook before committing** (`git diff` clean on touched files).
- Platform is Windows 11 / PowerShell + Git Bash. You have browser automation (Claude-in-Chrome tools), WebSearch/WebFetch, and full shell.

## Step 0 — Play it before you change it (mandatory)

Run `npm install` if needed, `npm run dev`, open the game in the browser, and **actually play it** (builder → drive → chase → farmer → game over → upgrade). Take screenshots and, if you can, short GIFs. Write a brutally honest diagnosis to `docs/overhaul/00-diagnosis.md`: what looks ugly (specific), what feels bad (specific: camera, steering, speed feel, hit feedback, pacing), what is boring (specific), and what's already good and must be preserved. Save the "before" screenshots to `docs/overhaul/before/`. Everything below is guidance for *what to look for*, not a substitute for your own judgment after playing.

## Design north star: "easy to play, deep to master"

One game, two skill ceilings. Design every feature so that:

- **The 6-year-old** gets: instant understanding (no reading required — icons, color, sound, big friendly UI), constant positive feedback, near-impossible failure, big forgiving hitboxes, auto-assist, and lots of laughter-inducing physics/particles/sounds.
- **The 30-year-old** gets: a skill ceiling that is *optional and visible* — combos, chains, style/air-time scoring, tight handling worth mastering, secrets, time/score challenges, risk-reward (e.g. golden animals, farmer baiting), and a leaderboard-feel (local best scores, medals).
- Mechanism: **adaptive/optional layers**, not difficulty modes the kid has to choose. E.g. a "Cruise ↔ Pro" feel emerges from the scoring multipliers and optional challenges, assists are on by default and can be toggled in a pause/settings panel (steering assist, auto-boop magnet radius, gas forgiveness). Consider a gentle dynamic-difficulty mechanism if it helps (if the player keeps losing, the farmer eases off).

## Workstreams (all required; sequence them how you see fit)

### A. Game feel / "juice" (highest priority — this is most of the "not fun")
- Rework truck handling: responsive, weighty, drifty-fun, not sluggish or floaty. Tune acceleration curves, steering at speed, suspension bounce, landing impact, turning radius, reverse. Boost/nitro with a satisfying meter if it fits.
- Camera: dynamic chase cam with speed-based FOV, subtle shake on landings/boops, look-ahead on turns, never clipping into buildings/hills (backlog bug), smooth collision-avoidance.
- Hit feedback: for every boop — screen shake, hit-stop (a few frames), squash/stretch on the animal, comedic launch/scatter arc, particle burst (feathers/stars/hay), floating "+coins" popups, coin-magnet pickup animation, pitch-rising combo sound. Make boops feel *amazing*.
- Truck motion juice: dust/dirt trails from wheels, mud/grass particles, tire marks, exhaust puffs scaling with throttle, speed lines, body tilt/roll, wheel splash in the river, big air-time moments with slow-mo/trail and a "style points" payoff.
- Rewards: coin showers, combo counters, streaks ("Boop Chain x5!"), achievements/medals, end-of-run celebration screen with tally animation and confetti.

### B. Graphics / art direction
- **Cute and lively is the brief.** Pick one coherent, bold, adorable art direction (e.g. chunky toy-like / clay / soft-toon / Animal-Crossing-meets-monster-truck) and apply it everywhere, replacing the current assets wholesale if needed. Everything should feel alive: idle bobbing, blinking eyes, tail wags, ear flops, swaying plants, a truck with a face/personality (googly eyes, grin grille, bouncy suspension), animals that squeak and react as you approach. Consistency and charm beat raw polygon count.
- Lighting and atmosphere: real sun + hemisphere light, soft shadow maps tuned for performance (cascaded or fitted shadow frustum following the truck), sky gradient/skydome, volumetric-feeling clouds, distance fog, golden-hour color grading, subtle bloom/vignette/SSAO-lite via post-processing (keep a quality toggle).
- Terrain: replace flat green with textured/vertex-colored ground (grass variation, dirt paths, mud patches, flower speckles), instanced grass tufts and wind sway near the camera, believable hills and river banks, animated water with foam/shore and reflections-ish shader.
- Environment life: swaying trees, spinning windmill, drifting clouds, birds/butterflies, smoke from the farmhouse, day/night or time-of-day progression across a run if cheap, weather moods (optional).
- **The monster truck is the hero and must look COOL.** Take design cues from Hot Wheels monster trucks: aggressive-but-fun stances, huge chunky tires with deep treads, tall suspension/shocks, flame/lightning/skull-free-but-bold graphics and decals, exposed engine with chrome pipes and a blower, roll cage, light bars, big exhaust stacks, glossy candy-color paint with metallic highlights. It should read as a collectible toy you'd want to own. Show it off everywhere: a dramatic rotating showroom in the builder with spotlights, camera sweeps and sparkle, and a hero reveal each time a new part is bought.
- **Upgrade parts must be unmistakable and give a "WOW".** Every tier of body, wheels, engine, and gas tank must change the truck's silhouette and details so drastically that someone glancing at the screen sees it instantly (taller/wider body, giant treaded wheels, huge blower engine bursting through the hood with flames/heat shimmer, glowing tanks, bigger exhausts, light bars, spoilers, glow/neon accents at top tier). Give each new part a purchase celebration (flash, shake, particles, camera zoom, sound) and a live in-driving effect (bigger exhaust flames, louder engine voice, sparks, bigger dust clouds). The top tier should feel legendary. Make the progression so visible that my son will point at the screen and say "WOW, look at my truck!"
- Characters/vehicles: improve truck presentation (tier visual progression that's obvious at a glance, paint/decals, shiny readable materials), animals with personality (idle animations, squeaks, flee reactions, goofy faces if possible), the farmer as a funny-grumpy character rather than scary.
- Assets: source higher-quality CC0/CC-BY models where current ones are weak (document in `CREDITS.md`), or generate better procedural/stylized geometry; use instancing and LOD to hold performance. **Look at every asset rendered before committing to it.**
- UI/HUD/builder: redo with a polished, child-readable, game-like aesthetic: big chunky buttons, icon-first, rounded friendly font, animated coin counter, clear gas and health (hearts/hits), a minimap or compass arrow toward fuel/animals/golden targets, juicy builder with a rotating showroom, part comparison bars, "buy" animations. Must be usable by a pre-reader and by an adult who wants numbers (optional detail panel).

### C. Depth and fun loop
- Make the moment-to-moment loop fun for 30 seconds in, 3 minutes in, and across multiple runs: clear short-term goals (a "mission/quest" strip: boop 5 chickens, get big air, cross the river, find the golden pig), mid-term (run score, medals, coin goal for next part), long-term (garage unlocks, cosmetics, new map zones or events).
- Introduce variety and surprise: random events (stampede, golden animal, "herd runs", fuel rain, farmer bonus chase), collectibles, stunt ramps and hills tuned for air time, destructible-but-silly props (hay bales, fences, scarecrows), a few secret spots.
- Rebalance coins/upgrades so every purchase feels meaningful and visible; first upgrade should be affordable within the first run so the kid hits the "upgrade high" early.
- Pacing: a tutorial-by-play first 30 seconds (no walls of text), a clear run end condition and a satisfying summary, instant "Play again" with minimal friction.
- Farmer: keep him a fun threat. Make telegraphing clear (music shift, exclamation icon, arrow), make escaping feel clever, make being caught funny not scary.

### D. Audio
- Add full audio with WebAudio: engine loop with pitch tied to speed/throttle, suspension thumps, tire/dirt noise, boop SFX per species, coin chimes with combo pitch ladder, farmer stinger, UI clicks, ambience (birds, wind, river), and a cheerful adaptive music loop (intensity changes with chase/boost). Prefer synthesized or CC0 audio files; keep it small. Provide a clear mute/volume control and respect browser autoplay rules (start audio on first interaction).

### E. Controls and accessibility
- Keyboard remains primary (WASD/arrows + space for boost/jump/horn). **Add** gamepad support and, if it works well, basic touch controls. Add a horn button the kid can mash for fun. Remap not required.
- Accessibility: colorblind-safe indicators, reduced-motion/shake toggle, readable at 1366x768 and 4K, UI scales with viewport.

### F. Performance, quality, and robustness
- Target a steady 60 fps on a mid-range laptop at 1080p; keep a **Quality** setting (Low/Med/High) that toggles shadows, post-FX, grass density, particle counts, and auto-picks a default from a quick frame-time probe. Watch draw calls (instancing/merging), texture sizes, and download budget (aim for the driving scene to load in a few seconds on broadband; honor/update the existing asset budget gate if you change it, and document the new number).
- Handle edge cases: tab blur (pause), resize, WebGL context loss, first-run asset load with a friendly loading screen and progress bar.
- Keep `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` green at every commit. Update or replace tests for any logic you change; add tests for new pure-logic modules (scoring, combos, difficulty adaptation, spawn rules). Don't leave dead code or debug hooks behind.

## Process you should follow (but adapt freely)

1. Step 0 diagnosis (above).
2. Write a short **overhaul plan** (`docs/overhaul/01-plan.md`): art direction statement with a palette and 3-5 reference descriptions, prioritized feature list, risks, and a performance budget. Make the decisions yourself.
3. Build in vertical slices, **playing and screenshotting after each slice** (at least: handling+camera, boop juice, environment look, HUD/builder, audio, depth/loop). Look at the screenshots critically and iterate; don't trust "tests pass" as evidence that it looks or feels good. Use a second, independent look at each screenshot set — past passes missed defects (floating decals, invisible water, black materials, cropped previews) that only a deliberate second look caught.
4. Commit per slice with clear messages on the `overhaul/fable` branch.
5. Playtest with *two personas* in your head and write down findings for each: "6-year-old with keyboard mashing" (does anything break, confuse, or frustrate?) and "30-year-old gamer" (is there something to master, is it boring after 5 minutes?). Fix what you find.
6. Update `README.md` (controls, how to run, feature overview), `CREDITS.md`, and `docs/backlog.md` (replace stale rows with what's actually done / what's next). Strike through superseded docs rather than deleting where it's cheap; don't spend time on ceremony.

## Final deliverable — be honest, I want to know how good this is

End with `docs/overhaul/99-report.md` and a short summary in chat containing:
1. **Before/after** screenshot sets (saved under `docs/overhaul/before/` and `docs/overhaul/after/`) and a GIF or two of key moments (boop, big air, builder).
2. **What you changed**, grouped by workstream A-F, and **what you decided on my behalf** (a decision log: decision, alternatives, why).
3. **A candid self-assessment**: score yourself 1-10 each on Graphics, Game feel, Fun for the 6-year-old, Fun for the 30-year-old, Performance, Polish; say where it's still weak, what you'd do next with another day, and anything you deliberately cut. Don't flatter; I'm using this to gauge your capability.
4. Exact commands to run it (`npm run dev`, `npm run build`, test results), the branch name, and any known bugs.

Go. Start with Step 0.
