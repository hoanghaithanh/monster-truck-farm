# ADR 0016 — Pig & cow species: per-instance skeletal animation on the animal lifecycle

Status: Proposed (Sprint 5)
Date: 2026-07-10
Related: `docs/requirements/farm-animals-pig-cow.md` (this issue, #48 — AC1-AC12, esp. AC9-AC11 art/scatter and AC12 fallback); `docs/requirements/animal-chase-and-coins.md` (AC4a-c scatter reaction, unchanged); **ADR 0015** (farmer skeletal animation — the closest precedent; this ADR reuses its `getAnimated`/`SkeletonUtils.clone`, per-instance material-clone, `precise` skinned-bbox, and mixer-per-frame decisions, and deliberately diverges where the lifecycle differs); ADR 0010 (§1 `.glb`/`GLTFLoader`, §3 payload budget, §4 progressive-upgrade-over-primitive, §6 manifest, §7 fallback); ADR 0001 §4/§7 (`core/` purity, `render/` as a dumb reflector).
Amends: ADR 0010 §3 (adds pig/cow to the driving-scene payload running total — see Risks; the developer must re-measure and update the total on commit).

## Context

Issue #48 adds **pig** and **cow** as two new chaseable species alongside the existing chicken. Tiers, coin values, spawn weighting, the `MAX_CONCURRENT_ANIMALS` raise (1 → 5), the art (staged Quaternius CC0 models), and the "play a species-appropriate flee clip" scatter design are all already decided (see the requirements doc + the issue hand-off) and are **not** re-litigated here. What is genuinely new — and the reason this needs a design — is that the pig and cow assets are **rigged `SkinnedMesh` models with animation clips** (pig: `Armature|Idle`, `Armature|Jump`; cow: `Armature|Idle`, `Armature|Walk`, `Armature|Run`, `Armature|WalkSlow`, `Armature|Death`), whereas the chicken is a plain static mesh with zero clips.

ADR 0015 already added the codebase's skeletal-animation machinery, but for the **farmer**, whose lifecycle is the opposite of an animal's: the farmer is a **singleton**, created on one FSM transition and fully torn down on another, held in a single nullable record. Animals are `UpgradableObject`-based (primitive box first, upgrade-in-place once the asset loads), **continuously spawned/despawned**, and **up to 5 concurrent** (mixed species, several pigs/cows alive at once) — each needing its own independent `AnimationMixer` and clip state. This ADR designs how per-instance skeletal animation attaches to that many-concurrent, high-churn, upgrade-in-place lifecycle, reusing every ADR-0015 mechanic that transfers and changing only what the different lifecycle forces.

## Decision

Seven coupled decisions. The through-line: **reuse ADR 0015's render-layer machinery verbatim; the only structural change is that per-instance animation state moves from one singleton record into a per-animal record keyed in the existing `animalSlots` map.**

### 1. Thin core/plumbing changes (additive, no `core/` logic changes)

- `AnimalSpecies` (core/types.ts) widens `'chicken'` → `'chicken' | 'pig' | 'cow'`. `ANIMAL_SPECIES` (core/spawn/species.ts) gains two rows: `pig` (medium/medium, radius ~0.6) and `cow` (large/medium, radius ~0.9) — the additive follow-up that file's own comment already anticipated. The coin formula is untouched (constraint): the tiers alone produce 20/30 via `computeCoins`.
- A weighted species picker in `systems/animal-system.ts` (chicken 0.7 / pig 0.25 / cow 0.05) selects the species per spawn; the id prefix follows the species (`pig-N`, `cow-N`). This is the only behavioral change in `animal-system.ts`.
- `ANIMAL_ASSET_KEYS: Record<AnimalSpecies, AssetKey> = { chicken, pig, cow }` in `render/assets/manifest.ts`, mirroring the shipped `STRUCTURE_ASSET_KEYS` map, plus `pig`/`cow` manifest entries. `render/` never hardcodes a species→key string.
- `AnimalSystemCallbacks.onSpawn` gains a `species` parameter (already carried in `AnimalState`); `onScatter`/`onRemove` are unchanged. Species reaches `render/` only as a string key (ADR 0001 §4 / ADR 0010 §6 seam preserved).

### 2. A per-instance `AnimalRecord` replaces the raw `UpgradableObject` map; the mixer lives *beside* the slot, not inside it

`animalSlots: Map<string, UpgradableObject>` becomes `animalSlots: Map<string, AnimalRecord>`, where:

```ts
interface AnimalRecord {
  slot: UpgradableObject;              // the primitive→model swap (unchanged mechanism)
  species: AnimalSpecies;              // fixed at spawn; picks the builder & asset key
  mixer?: THREE.AnimationMixer;        // set only once a pig/cow upgrades to its real model
  idleAction?: THREE.AnimationAction;  // pig/cow only
  scatterAction?: THREE.AnimationAction; // pig→Jump, cow→Run
  currentAction?: THREE.AnimationAction;
  ownedMaterials?: THREE.Material[];   // per-instance cloned materials to dispose (pig/cow only)
  previousPosition?: Vec2;             // for the facing/orientation concern (§7)
}
```

The mixer is **not** pushed inside `UpgradableObject`: that abstraction is deliberately generic (it wraps a single mesh swap and is shared by truck/structures/animals) and ADR 0015 already rejected teaching it about mixers. Keeping the mixer/actions/ownedMaterials as sibling fields on `AnimalRecord` — exactly the shape `FarmerRecord` uses — confines all animation state to the one map that already tracks animals, and leaves `UpgradableObject` untouched. For a chicken (or any not-yet-upgraded primitive), the animation fields simply stay `undefined`, so **chicken is never forced through any animated machinery** (Q1).

### 3. Two display-model builders: static (chicken) and animated (pig/cow)

- The existing `buildChickenDisplayModel(source)` is generalized to **`buildStaticAnimalDisplayModel(source, targetHeight)`** — identical body (measured-bbox scale, center on all three axes), just parameterized on the target height so it isn't chicken-hardcoded. Chicken remains its only caller.
- A new **`buildAnimatedAnimalDisplayModel(source, targetHeight): { model, ownedMaterials }`** for pig/cow. It is `buildFarmerDisplayModel` minus the amber-tint machinery: clone every material (so this instance owns them), force `metalness = 0` (Quaternius ships `metallicFactor` with no scene `envMap` — the same fix structures/farmer already apply), measure with the skinned-safe **`Box3.setFromObject(source, true)` after `updateMatrixWorld(true)`** (ADR 0015 §2 / issue #57 — a plain bbox reads the un-posed rig at ~1/500 scale and mis-scales the model), and correct **base-on-ground** (`y -= box.min.y`, x/z centered) because pig/cow are standing figures a full-center would sink halfway underground. No `tintTargets` are collected — pig/cow have no state-tint requirement.

This keeps the static and animated paths cleanly separate; neither species is bent through the other's code (Q6).

### 4. Per-frame handling (mixer update **and** upgrade-in-place) moves into `tickEffects`

`tickEffects(dt)` already iterates structures for their upgrade-in-place check and drives the farmer mixer. Animals join it with one loop over `animalSlots`:

- **Upgrade-in-place check** (moved out of `upsertAnimal`): for each not-yet-upgraded record whose species asset reports `ready`, build via the species' builder and `slot.upgrade(...)`. For pig/cow this also constructs the `AnimationMixer(model)` + idle/scatter actions and starts **Idle** playing. Moving this out of `upsertAnimal` closes a latent gap: an animal is only re-`upsert`ed at spawn and while scattering, so a slow-loading asset would otherwise never upgrade during the stationary pre-boop window. `tickEffects` runs every frame regardless, and this mirrors exactly how structures already upgrade. Each record stops being checked the instant `slot.upgraded` flips (same cheap `status()`-then-`get`-once pattern as today).
- **`record.mixer?.update(dt)`** for every animated record, alongside the existing `farmer?.mixer?.update(dt)`. Up to 5 low-poly skinned meshes — negligible.

`upsertAnimal(id, position, species)` is thereby reduced to: create the record (primitive slot + species) on first call, then reposition. No asset logic remains in it.

### 5. Scatter clip: a cosmetic overlay, driven idempotently by the existing `onScatter` — `core/scatter.ts` is untouched (Q3)

`core/scatter.ts` stays **exactly as-is**: it remains the sole source of the fleeing animal's position (a uniform `SCATTER_SPEED` velocity away from the truck for `SCATTER_DURATION_SECONDS`). The Jump/Run clip is a **purely cosmetic overlay** on top of that position-driven motion — no root motion, no physics change — precisely as the farmer's clips are cosmetic while `farmer-system.ts` owns his kinematics. This is the right call: nothing in the scatter needs the mesh to *move itself*, and adding root motion would fight the existing velocity integration.

The clip switch is triggered by the **existing `onScatter` callback**, routed to a new scene method `scatterAnimal(id, position)` that (a) repositions, (b) updates facing (§7), and (c) crossfades `currentAction → scatterAction`. The crossfade helper is made **idempotent** (`if (record.currentAction === next) return` at the top), so calling it on every scatter tick switches Idle→Jump/Run on the first frame and is a no-op thereafter.

This is a *reasoned deviation* from ADR 0015 §4, which insisted clip changes come only from one-shot transition callbacks and forbade `onMove` from touching clips. That rule existed because the farmer's `onMove` was **ambiguous** — it fired in both PURSUING and LEAVING, two states with *different* target clips, so it couldn't pick one. `onScatter` has no such ambiguity: it means one and only one thing ("this animal is fleeing"), maps to exactly one clip, and is safe to drive the crossfade directly once the crossfade is idempotent. No new one-shot callback is needed. (Chicken, having no `scatterAction`, just repositions — its behavior is byte-for-byte unchanged.)

### 6. Idle clip pre-boop: yes (Q4)

A spawned pig/cow plays its `Idle` clip while standing around, rather than freezing in bind pose. The clip already exists, the mixer/action-lookup machinery is identical either way, and `tickEffects` already drives the mixer — so this is a free, real visual upgrade. Missing-clip degradation follows ADR 0015 §3: a clip looked up by exact name that isn't found yields no action (never a throw), and `Death` is **never referenced by name** (kid-safe tone), unreachable by construction exactly like the farmer's combat clips.

### 7. Spatial orientation is its own concern: face the flee direction (designed separately from clip selection)

*(Per the post-Sprint-4 convention, and specifically to not repeat the farmer's issue-#57 "never turns to face movement" bug — which went undesigned in ADR 0015, then unimplemented, then uncaught through review and two live passes.)*

A cow playing its Run clip while sliding sideways/backwards would be that exact bug again. So orientation is designed as a distinct concern from "which clip plays":

- **Pre-boop:** the animal is stationary (no wander — out of scope), so it faces its default source orientation. Acceptable for a standing Idle animal (chicken already does this).
- **During scatter:** `scatterAnimal` derives a heading from the position delta (`previousPosition → position`) and applies it to the model root's `rotation.y`, using the **same `0 = +Z`, `atan2(dx, dz)` convention and epsilon guard** as `computeFarmerHeading` (reuse that function, or a trivially shared 2-arg helper — animals need no truck-reference fallback since a scatter always has a prior spawn position to diff against). Because the flee velocity is constant, the heading is stable after the first frame. This makes the cow run *forward, away from the truck*.
- **Orientation applies only to animated pig/cow.** Chicken (static mesh, no legs animating) keeps its current no-rotation behavior — not forced through new machinery (Q1).
- **Source-forward-axis assumption:** this assumes the pig/cow source meshes face `+Z` at `rotation.y = 0`, like the farmer/truck. This **must be verified with a live screenshot** (the farmer's did; the chicken never needed it). If a source faces a different axis, a per-species corrective yaw offset is added at build time — the orientation stays a render-only concern regardless.

The vertical placement reuses the farmer's idiom directly: `setFarmerTransform` picks `y = mixer ? 0 : 0.75`; `upsertAnimal`/`scatterAnimal` pick `y = record.mixer ? 0 : 0.3` — animated model base-on-ground at `y = 0`, primitive box / static chicken centered at `y = 0.3`.

### 8. Disposal: `removeAnimal` disposes owned materials + stops the mixer for animated instances only (Q5)

`removeAnimal` today does no dispose — correct for the chicken/primitive case, where `get()`'s `clone(true)` shares geometry **and** materials by reference with the app-lifetime cached source. That stays true for chicken and primitives.

But animated pig/cow instances now **own per-instance cloned materials** (§3), and with up to 5 concurrent + continuous spawn/despawn, an undisposed-material leak would accumulate fast — this is the churn-amplified version of the exact missed-dispose bug code review caught on the farmer. So `removeAnimal` gains an animated branch mirroring `farmerDespawn`:

- If `record.ownedMaterials` is set (animated): `record.mixer?.stopAllAction()`, remove from scene, and `dispose()` each owned material — **but not the geometry**, which `SkeletonUtils.clone` shares by reference with the cached source (disposing it would break the source and every other live instance). This is the same narrower-than-ADR-0015-§3-wording deviation `farmerDespawn` already documents.
- Otherwise (chicken/primitive): remove from scene only, exactly as today.

## Alternatives considered

- **Put the mixer inside `UpgradableObject`.** Rejected for the same reason ADR 0015 rejected it for the farmer: the slot is a generic single-mesh-swap abstraction shared by truck/structures; a sibling field on `AnimalRecord` fits without contaminating it.
- **Add a one-shot `onBoop`/`onScatterStart` callback for the clip switch (strict ADR-0015 §4 style).** Rejected: unnecessary here. `onScatter` is unambiguous (unlike the farmer's `onMove`), so an idempotent crossfade driven by it is correct and cheaper. The farmer's one-shot rule was a response to *ambiguity* that doesn't exist for scatter.
- **Give the scatter clip root motion / drive position from the animation.** Rejected: `core/scatter.ts` already owns position via velocity integration; root motion would fight it and pull movement logic into `render/`, violating ADR 0001. Cosmetic overlay matches the farmer precedent.
- **Keep the upgrade check in `upsertAnimal` (like chicken today).** Rejected in favor of `tickEffects`: `upsertAnimal` isn't called during the stationary pre-boop window, so a slow asset could fail to upgrade; `tickEffects` runs every frame and already hosts the structure upgrade + mixer loop.
- **A single unified builder with an `isAnimated` flag.** Rejected: the static (center-all-axes, no materials owned) and animated (base-on-ground, precise skinned bbox, cloned materials, mixer) paths differ enough that two named builders read more clearly and keep chicken's simple path simple.

## Consequences

- `animalSlots` changes value type (`UpgradableObject` → `AnimalRecord`); `upsertAnimal` gains a `species` param and sheds its asset logic; a new `scatterAnimal` method appears; `removeAnimal` gains an animated-dispose branch; `tickEffects` gains an animal upgrade+mixer loop. All localized to `render/scene.ts` + `manifest.ts` + the two core additive rows + the picker in `animal-system.ts`.
- The codebase now has **two** consumers of the skeletal pipeline (farmer + animals), validating that ADR 0015's `getAnimated`/`SkeletonUtils.clone`/precise-bbox extension generalizes — no further registry changes are needed. A *third* future animated species (or the deferred wander/flee-on-approach story) would slot in as another `ANIMAL_SPECIES` row + asset + clip names, with the animated builder and record already in place. (Not designed here — noted only to confirm the seam is clean, as requested.)
- What becomes harder: animals are now the highest-churn owner of per-instance cloned materials in the app; the `removeAnimal` dispose path is load-bearing in a way it wasn't, and a future refactor that "simplifies" it back to no-dispose would leak. A code comment on the animated branch documents why (mirroring `farmerDespawn`'s).
- Coin/boop/scatter mechanics, non-violence framing, and spawn-validity are entirely unchanged — pig/cow inherit them for free (AC6-AC8).

## Component / data design

```
systems/animal-system.ts:
  weighted species pick (0.7/0.25/0.05) -> spawnAnimal(id, species, pos)
  AnimalSystemCallbacks.onSpawn(id, pos, species)   // +species
  (onScatter/onRemove unchanged; core/scatter.ts UNCHANGED)

main.ts frame loop:
  animalSystem.update(dt, pos, {
    onSpawn:   (id, p, sp) => scene.upsertAnimal(id, p, sp),   // create/reposition
    onScatter: (id, p)     => scene.scatterAnimal(id, p),      // reposition + face + Jump/Run
    onRemove:  (id)        => scene.removeAnimal(id),
  })
  ...
  scene.tickEffects(dt)   // animal upgrade-in-place + mixer.update loop, beside farmer's

render/assets/manifest.ts:
  ASSET_MANIFEST += pig, cow            // measured gzip bytes on commit (budget check)
  ANIMAL_ASSET_KEYS: Record<AnimalSpecies, AssetKey> = { chicken, pig, cow }

render/scene.ts:
  animalSlots: Map<string, AnimalRecord>
  buildStaticAnimalDisplayModel(source, targetHeight)        // chicken (was buildChickenDisplayModel)
  buildAnimatedAnimalDisplayModel(source, targetHeight)      // pig/cow: clone mats, metalness=0,
                                                             //   precise skinned bbox, base-on-ground
  upsertAnimal(id, pos, species):  create record; reposition (y = mixer ? 0 : 0.3)
  scatterAnimal(id, pos):          reposition; face flee dir; idempotent crossfade -> scatterAction
  removeAnimal(id):                animated -> stopAllAction + dispose ownedMaterials (NOT geometry);
                                   chicken/primitive -> remove only
  tickEffects(dt):                 for each record: upgrade-if-ready (builds mixer+Idle for pig/cow),
                                   then record.mixer?.update(dt)

core/types.ts:        AnimalSpecies = 'chicken' | 'pig' | 'cow'
core/spawn/species.ts: + pig (medium/medium, r~0.6), cow (large/medium, r~0.9)

Clip names referenced (Death NEVER referenced — kid-safe, unreachable by construction):
  pig:  'Armature|Idle'  (idle),  'Armature|Jump' (scatter)
  cow:  'Armature|Idle'  (idle),  'Armature|Run'  (scatter)
```

## Risks

- **Payload budget breach (cross-ADR interaction with ADR 0010 §3).** ADR 0015 §5 put the driving-scene running total at **≈ 1.25 MB gzipped** against a **1.5 MB target / 2.0 MB alarm**, i.e. ~0.25 MB headroom. Two *rigged* Quaternius animals could plausibly consume much or all of that (the farmer alone was 0.32 MB). This is the same shape as the Sprint 1 fairness bug — two separately-reasonable decisions (ADR 0010's budget; this ADR's "two new rigged assets") that only conflict at their intersection. **Reconciliation:** the developer must measure the committed `gzip -9` sizes of `pig.glb`/`cow.glb`, add them to the ADR 0010 §3 running total, and confirm ≤ target (or, if over, apply the already-established mitigations — offline clip-trimming, which ADR 0015 §5 noted could reclaim ~half the farmer's size, or texture downscaling per the farmhouse precedent — *before* accepting the alarm). Amend ADR 0010 §3 with the new total. Noticed by `core/assets/budget.ts` and the build-size check.
- **Scatter clip vs. `SCATTER_DURATION_SECONDS` (0.4 s) — visual-completeness coupling.** The Jump/Run clip plays for only the 0.4 s flee window before `onRemove` despawns the animal (`core/scatter.ts` / animal-chase AC4c owns that duration). If a clip's natural length is much longer than 0.4 s, only its opening (a pig's crouch-and-launch, a cow's first strides) shows — which still reads as "startled flee," so **no AC is violated** (unlike the fairness bug, this breaks no invariant). But it *is* a coupling: if `SCATTER_DURATION_SECONDS` is later retuned *down* toward, say, 0.1 s, AC11's "distinct scatter reaction" silently degrades to an imperceptible twitch. Treat **~0.3 s as a soft floor** for that constant below which AC11's distinct-reaction guarantee no longer holds, and note in `core/scatter.ts`'s constant doc-comment that it is now shared by chicken's position-only scatter *and* pig/cow's clip-length assumption — retune it for both, not one in isolation. Optionally fit the clip to the window via `mixer.timeScale` later (render-only, deferrable). Noticed in the live-screenshot/playtest pass, in motion (not a static shot).
- **Source-forward-axis wrong → cow runs sideways/backwards (issue-#57 class).** The §7 orientation assumes `+Z`-forward source meshes. If a source faces another axis, the flee looks wrong despite the correct clip. Noticed only by *looking* in motion — mandate a live driving screenshot of a booped pig and cow specifically, and add a per-species corrective yaw if needed.
- **Material leak on despawn (churn-amplified).** Up to 5 concurrent + continuous spawn/despawn; a missed `dispose()` on the animated branch of `removeAnimal` accumulates GPU memory over a session far faster than the singleton farmer would. Noticed as growing memory across a long play session. Guarded by §8's dispose branch + a doc comment; add a unit test asserting `removeAnimal` on an upgraded pig/cow disposes its owned materials and stops its mixer (the farmer's equivalent gap is exactly what review caught).
- **Concurrent-animation perf (MAX_CONCURRENT_ANIMALS 1 → 5).** Up to 5 mixers + 5 upgrade checks per frame, plus the farmer and truck rig. Low-poly skinned meshes make this trivial on the target hardware, but it is a real step up from the singleton farmer; noticed via frame-time if a future high-poly animal is added. No mitigation needed now; flagged so a heavier future asset re-checks it.
</content>
</invoke>
