# ADR 0015 — Farmer skeletal model, state-driven animation, and the LEAVING signal

Status: Proposed (Sprint 5)
Date: 2026-07-10
Related: `docs/requirements/vehicle-and-character-art.md` (AC7-AC9 — farmer model + state-distinguishable art + kid-appropriate tone); ADR 0007 (farmer FSM: PURSUING/TIRED/LEAVING states and their durations); ADR 0010 (§1 `.glb`/`GLTFLoader`, §3 payload budget, §4 progressive-upgrade-over-primitive, §6 manifest, §7 fallback); ADR 0011/0012 (prior static-mesh consumers of the same pipeline); ADR 0001 §4 (`core/` purity boundary); issue #29.
Amends: ADR 0007 (adds a render-facing `onLeaving` one-shot callback on the TIRED→LEAVING transition, and couples the TIRED-pose readability to `FARMER_TIRED_DURATION` — see Risks).

## Context

Issue #29 replaces the farmer's `CapsuleGeometry` placeholder (`render/scene.ts`) with a real sourced model and gives the FSM states real pose/animation distinction, not just the existing amber colour tint (vehicle-art AC8: a young child must read the state from the pose, with colour only supplementary). The asset is staged and human-approved: "Farmer" by Quaternius (CC0), a single `CharacterArmature` skeleton (62 joints) driving four `SkinnedMesh` nodes (Feet/Pants/Body/Head), with a 24-clip library of which exactly three are used — `CharacterArmature|Run` (PURSUING), `CharacterArmature|Idle` (TIRED), `CharacterArmature|Walk` (LEAVING). This is the **first skeletal/animated asset in the codebase** — every prior art swap (truck parts, chicken, structures, mountains) is a static mesh routed through `AssetRegistry.get()` → `UpgradableObject`. That pipeline does not handle skinned meshes or animation clips, so this feature has to extend it in two narrow, load-bearing ways and add a per-frame animation update, without disturbing the static-mesh consumers or the `core/` purity boundary.

## Decision

Five coupled decisions.

### 1. Load through `AssetRegistry`, but add a skin-safe clone path (`SkeletonUtils.clone`) and preserve clips

The farmer joins `ASSET_MANIFEST` as key `farmer` (single, non-tiered), prefetched at builder entry like every other non-truck asset — **not** gated by `truckAssetKeysForBuild` (it is not a player truck part; same rationale as chicken/structures, ADR 0010 §4.4). But the registry's existing `get()` returns `entry.source.clone(true)`, and **`THREE.Object3D.clone()` does not rebind a `SkinnedMesh` to cloned bones** — the clone's `skeleton` keeps pointing at the *source* bones, which our mixer never targets, so the mesh would sit frozen in bind pose while the animation plays on invisible cloned bones. `GLTFLoader` also drops `gltf.animations` on the floor today (the registry keeps only `gltf.scene`), so the clips would be unreachable.

Two minimal, additive registry changes (existing static consumers untouched):
- Store `gltf.animations` on the cache entry.
- Add `getAnimated(key): { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | undefined` that clones via `SkeletonUtils.clone` (from `three/examples/jsm/utils/SkeletonUtils.js`) and returns the shared clip array alongside. `SkeletonUtils.clone` shares geometry/material by reference (same as `.clone(true)`) but correctly rebinds skinned meshes to the cloned skeleton. Clips are immutable data — sharing one array across mixers is safe.

`get()` and its `.clone(true)` stay exactly as-is; chicken/structures/truck do **not** route through the new path. This confines the animation-aware code to the one asset that needs it and keeps the regression surface to a single new method.

### 2. Per-instance material clone + `metalness=0` override + eye-safe amber tint

A `buildFarmerDisplayModel(source)` function (sibling to `buildStructureDisplayModel`) runs on each fresh clone:
- Traverse and **clone each material** (`child.material = material.clone()`), so this farmer instance owns its materials. This is required because (a) `SkeletonUtils.clone` shares materials with the app-lifetime source, and (b) the TIRED tint mutates `.color` — mutating a shared material would bleed amber into the source and thus into every *future* respawned farmer. Cloning isolates the mutation to the disposable per-appearance instance.
- Force `metalness = 0` on every `MeshStandardMaterial`. The source ships `metallicFactor = 0.4` with no scene `envMap`, the exact near-black defect the mountain hit (issue #47); this is the same physically-motivated fix `buildStructureDisplayModel` already applies (colour/roughness/textures untouched).
- Collect the tintable materials into a list, **excluding those named `Eye` and `Eyebrows`**, and stash each one's base colour (`material.userData.baseColor`). Amber eyes read as sickly/unwell — skipping them keeps the face friendly and comedic (AC9). The TIRED tint then does `color.copy(baseColor).multiply(FARMER_TIRED_COLOR)` per tintable material — a warm multiply over the model's real colours, preserving his form, rather than flat-replacing every surface with one amber hex (which would flatten him to a featureless silhouette). Computing from the stored base makes the tint idempotent.

Corrective scale/centering follows the chicken's derive-from-measured-bounding-box convention (no magic constant), with base-on-ground (`y -= box.min.y`) like the structures since the farmer is a standing figure.

### 3. AnimationMixer lifecycle: one per farmer instance, `.update(dt)` from `tickEffects`

The scene module holds a single nullable farmer record: `{ root, mixer?, actions?, tintTargets? }`. A farmer exists for one PURSUING→TIRED→LEAVING cycle and is torn down on despawn, matching the placeholder's existing "recreate fresh on respawn" contract (`farmerDespawn` nulls its refs today). So:
- On lazy creation (first `setFarmerTransform` of an appearance), if `assetRegistry.status('farmer') === 'ready'`, build the animated farmer: `getAnimated('farmer')` → `buildFarmerDisplayModel` → `new THREE.AnimationMixer(root)` → three `AnimationAction`s (`Idle`/`Run`/`Walk`), each `LoopRepeat`. Start with `Run` playing (PURSUING is the near-universal creation trigger). Look clips up by exact name via `THREE.AnimationClip.findByName`; a missing clip degrades to no action rather than throwing, and **no other clip name is ever referenced** (AC9 — the combat/gun/melee clips are unreachable by construction).
- `farmerMixer.update(dt)` is called at the top of `tickEffects(dt)` (already invoked every frame from `main.ts`, already receives `dt`), guarded by `if (farmerMixer)`. No new call site in the frame loop.
- `farmerDespawn` disposes the mixer (`mixer.stopAllAction()`), disposes the cloned model's geometries/materials (`disposeObject3D` — safe now that materials are per-instance clones), removes the root, and nulls all refs.

If the asset is not ready (genuine load failure, or the vanishingly small window where a farmer spawns before prefetch settles) or `assetRegistry` is absent (unit-test scene), fall back to the existing `CapsuleGeometry` + single `MeshStandardMaterial`, no mixer. In that degraded mode the amber colour tint remains as the sole state cue (AC13 forgiving fallback). **We deliberately do not upgrade the farmer mid-appearance** (unlike chicken/structures, which are session-persistent and justify per-frame upgrade checks): a farmer appearance is a short-lived, self-replacing entity, so an appearance that started as a capsule stays a capsule and the *next* appearance picks up the real model. Given the asset is prefetched at builder entry and a farmer's first spawn is many seconds later, the fallback path is reached essentially only on real load failure — where the asset never becomes ready anyway.

### 4. State→clip signalling: a new one-shot `onLeaving`, and clip changes driven *only* by one-shot callbacks

`onMove` fires every tick in both PURSUING and LEAVING (it means "position changed, redraw"), so it cannot distinguish the two — it must never touch clips. The one-shot FSM-transition callbacks own all clip changes:

| FSM transition | Callback | Render action |
|---|---|---|
| ABSENT→PURSUING | `onAppear` (existing) → `setFarmerTransform` | lazy-create farmer, `Run` playing |
| PURSUING→TIRED | `onTired` (existing, already carries position) | crossfade to `Idle` + apply amber tint |
| **TIRED→LEAVING** | **`onLeaving` (NEW)** | crossfade to `Walk` |
| LEAVING→ABSENT | `onDespawn` (existing) | dispose mixer + model |
| any tick in PURSUING/LEAVING | `onMove` | reposition root only — **never** a clip change |

The gap is closed by adding `onLeaving(position)` to `FarmerSystemCallbacks`, fired from `farmer-system.ts` on the tick where the TIRED branch's `farmerReduce` flips `kind` to `LEAVING` (mirroring exactly how the PURSUING branch fires `onTired` when it flips to `TIRED`). A **separate explicit signal is chosen over overloading `onTired` or having render infer "the tick after tired = leaving."** Inferring would force render/ to track the FSM's timers, duplicating logic the reducer already owns and re-introducing the class of drift ADR 0007 built the reducer to prevent. One callback per transition keeps render/ a dumb reflector (ADR 0001 §7). Tint persists from TIRED through LEAVING and clears naturally on despawn/respawn (fresh instance, base colours) — no explicit reset needed.

Crossfades use a short `crossFadeTo` (~0.25s) so the pose reads promptly within the short TIRED window (see Risks).

**Resume path (ADR 0009):** a resumed non-ABSENT farmer is placed by a direct `setFarmerTransform` call in `main.ts`, bypassing `onAppear`, so it defaults to the `Run` pose. `main.ts`'s resume block corrects this by calling the matching scene method after placement — `farmerTired()` for a seeded TIRED farmer, the new `farmerLeaving()` for a seeded LEAVING one — reusing the same methods the callbacks use, no dedicated resume API.

### 5. Payload budget

Farmer `.glb`: 1.37 MB raw / **0.32 MB gzipped** (no textures — flat PBR colours). Added to the ADR 0010 §3 "total driving-scene asset payload" budget (target ≤ 1.5 MB gzipped, alarm 2.0 MB). Running total of all prefetched `.glb`s is now ≈ **1.25 MB gzipped** — under target with ~0.25 MB headroom. Skeletal animation adds negligible payload (clip keyframes are tiny); the 0.32 MB is almost entirely mesh. Note ADR 0010 §3 estimated "a rigged farmer with a few clips ~100-250 KB" — ours is ~320 KB, modestly over that per-asset estimate (the 24-clip library and 4-mesh split cost more than a trimmed rig would), but the aggregate still lands under the 1.5 MB target. Trimming unused clips from the `.glb` offline could reclaim ~half of it if the budget later tightens; not needed now.

## Alternatives considered

- **A dedicated farmer loader outside `AssetRegistry`.** Rejected: it would duplicate the prefetch/status/budget/failure-isolation machinery ADR 0010 centralises, and split the manifest into "things in the registry" and "the farmer." The registry extension is ~15 lines and additive.
- **Change `get()` itself to use `SkeletonUtils.clone` for everything.** Rejected: needless risk to four working static-mesh consumers for one animated asset; `SkeletonUtils.clone` is heavier and unnecessary for non-skinned graphs. A separate `getAnimated` isolates the change.
- **Reuse `UpgradableObject` for the farmer.** Rejected: it is a create-once/upgrade-once/permanent slot with no teardown, and it wraps a single mesh, not a mesh+mixer+actions. The farmer is created and destroyed every cycle. A small bespoke record fits far better than bending the slot abstraction.
- **Overload `onTired` (or infer LEAVING from the tick after TIRED) instead of a new `onLeaving`.** Rejected: makes render/ track FSM timing it shouldn't own; a per-transition callback is the established pattern (`onTired`/`onDespawn`) and the cheapest correct option.
- **Flat-replace all materials with one amber hex for the tint (the old single-capsule behaviour, extended).** Rejected: on an 8-material model it flattens the farmer to a featureless amber blob, destroying the pose readability AC8 now depends on. Multiply-over-base preserves his form.
- **Tint the eyes too.** Rejected: amber eyes read as sickly, against AC9's friendly/comedic tone.

## Consequences

- `AssetRegistry` gains an animation-aware clone path and starts retaining `gltf.animations`. The `GltfLoaderLike` test interface widens to `{ scene; animations? }` (optional, so existing fakes still compile).
- The scene module gains its first per-frame `AnimationMixer.update`, its first `SkeletonUtils`/`AnimationMixer` usage, and a farmer record replacing the two `farmerMesh`/`farmerMaterial` fields. `farmerTired` changes from a one-line colour set to a crossfade+multiply-tint; `farmerDespawn` now also tears down a mixer; a new `farmerLeaving` is added and exported.
- `FarmerSystemCallbacks` grows `onLeaving`; `farmer-system.ts` fires it on TIRED→LEAVING; `main.ts` wires it and adds the resume-path pose correction. `core/farmer/farmer.ts` (the pure reducer) is **untouched** — no clip logic leaks into core (ADR 0001 §4).
- Foot-slide risk: the farmer's ground speed is dynamic (ADR 0007 `v/3`, floored at 1.0) but clips play at fixed rate, so feet may skate at the slow end. Accepted for v1 given the stylized look; mitigable later by scaling `mixer.timeScale` with farmer speed (a `render/`-only change, no ADR needed).
- What becomes harder: the farmer is now the one asset where a naive `.clone(true)` silently breaks (frozen bind pose). A code comment on `getAnimated` and the `buildFarmerDisplayModel` material-clone step documents why, so a future refactor doesn't "simplify" it back.

## Component / data design

```
main.ts frame loop (per tick, unchanged call sites):
  farmerSystem.update(dt, truckPos, drivingSystem.speed, {
     onAppear:  p => scene.setFarmerTransform(p),   // lazy-create, Run
     onMove:    p => scene.setFarmerTransform(p),   // reposition only
     onBump:    () => scene.flashTruck(),
     onTired:   () => scene.farmerTired(),          // crossfade Idle + tint
     onLeaving: () => scene.farmerLeaving(),         // NEW: crossfade Walk
     onDespawn: () => scene.farmerDespawn(),         // dispose mixer+model
  })
  ...
  scene.tickEffects(dt)   // farmerMixer?.update(dt) at top
  scene.render()

resume block (seeded non-ABSENT farmer):
  scene.setFarmerTransform(seed.position)
  if kind === 'TIRED'   scene.farmerTired()
  if kind === 'LEAVING' scene.farmerLeaving()

systems/farmer-system.ts:
  FarmerSystemCallbacks += onLeaving(position: Vec2)
  TIRED branch: after farmerReduce, if kind === 'LEAVING' -> callbacks.onLeaving(state.position)

render/assets/asset-registry.ts:
  CacheEntry += animations?: THREE.AnimationClip[]     // from gltf.animations
  getAnimated(key) -> { scene: SkeletonUtils.clone(source), animations } | undefined
  GltfLoaderLike.loadAsync -> Promise<{ scene; animations? }>   // widened, optional

render/scene.ts:
  farmer record: { root, mixer?, actions?: Map<clip,AnimationAction>, tintTargets?: MeshStandardMaterial[] }
  buildFarmerDisplayModel(source): clone materials, metalness=0, collect tintTargets
      (skip 'Eye'/'Eyebrows', stash userData.baseColor), bbox-derive scale, base-on-ground
  setFarmerTransform: lazy-create (animated if status 'ready', else capsule fallback), reposition
  farmerTired:   crossfade -> Idle; tintTargets.forEach(m => m.color.copy(base).multiply(TIRED_COLOR))
  farmerLeaving: crossfade -> Walk
  farmerDespawn: mixer.stopAllAction(); disposeObject3D(root); null refs
  tickEffects:   farmerMixer?.update(dt)   // first line

render/assets/manifest.ts:
  ASSET_MANIFEST.farmer = { url: FARMER_URL, approxGzipBytes: 324927 }
  export const FARMER_ASSET_KEY = 'farmer'

Clip name constants (the ONLY three ever referenced):
  'CharacterArmature|Idle' | 'CharacterArmature|Run' | 'CharacterArmature|Walk'
```

## Risks

- **TIRED-pose readability vs. `FARMER_TIRED_DURATION` (cross-ADR interaction with ADR 0007).** The Idle "give-up" pose only shows for `FARMER_TIRED_DURATION` (≈ **1.5 s**, and explicitly playtest-tunable per ADR 0007 Open Q3), minus the ~0.25 s crossfade in and out. That is a genuine shared-timing coupling: this ADR's state-distinguishability guarantee (AC8) depends on a duration constant owned by ADR 0007, and if that constant is retuned *down* toward the crossfade time, the TIRED pose stops registering as its own beat and PURSUING→TIRED→LEAVING collapses visually into Run→Walk — the AC8 guarantee silently becomes false, exactly the kind of separately-reasonable-but-jointly-broken pair the Sprint 1 fairness bug was. Reconciliation: keep the crossfade ≤ 0.25 s, treat **`FARMER_TIRED_DURATION ≥ ~1 s` as a floor** below which the TIRED pose is no longer distinguishable, and ADR 0007's Open Q3 (durations) now carries this pointer — retuning that duration must re-check farmer pose readability, not just chase feel. Noticed in the orchestrator/developer live-screenshot pass and in playtest with the child. Amend ADR 0007 with a pointer to this section.
- **Skinned clone rendered as frozen bind pose.** If `getAnimated` is bypassed (or `get()` is ever pointed at the farmer), the farmer stands rigid mid-run. Noticed immediately in a live screenshot (obvious "statue sliding around" defect); guarded by the code comments and by routing only `getAnimated` to the farmer key.
- **Foot-slide at low creep speed.** Fixed-rate clips vs. `v/3` ground speed. Noticed in motion (not a static screenshot — flag for the playtest/live-capture pass specifically). Mitigation: `mixer.timeScale ∝ speed`, deferrable.
- **Budget creep.** Farmer is ~0.32 MB, ~70 KB over ADR 0010 §3's per-asset estimate; aggregate still under the 1.5 MB target with ~0.25 MB headroom. Noticed by the ADR 0010 budget check (`core/assets/budget.ts`) if a future asset pushes the total past target/alarm. Mitigation: offline clip-trim reclaims ~half the farmer's size.
- **Mixer not disposed on despawn → leak / ghost animation.** A farmer respawns every cycle; a leaked mixer or undisposed clone accumulates over a session. Noticed as growing memory / duplicated figures. Guarded by `farmerDespawn` tearing down mixer + model and nulling refs, matching the placeholder's existing teardown contract.
