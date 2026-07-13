# ADR 0020 — Truck body lift for authentic monster-truck stance

Status: Proposed
Date: 2026-07-12
Related: `docs/requirements/truck-body-lift.md` (issue #65, AC1-AC8 — source of truth); ADR 0018 §1 (`TRUCK_SCALE`/socket-data-folding — the seam this extends), §3 (`SuspensionConfig`/`maxTravel` — the mechanism this lift's baseline interacts with), §5 (orientation-as-separate-concern); ADR 0011 §4 (single `buildTruckRig()` invariant); ADR 0001 §2 (kinematic-only, XZ-planar physics), §4 (`core/` purity boundary); ADR 0013/0014 (whole-body climb lift/tilt this must keep working); `docs/requirements/truck-wheel-motion.md` (issue #40 wheel roll/steer-yaw this must keep working).
Builds on (extends, does not supersede): ADR 0018 — reuses its `truck-sockets.ts` data-derivation seam and layers a second per-tier factor on top of `TRUCK_SCALE`; ADR 0018's `maxTravel` default is reconciled here (see §Shared-tunable cross-check and §Risks).

## Shared-tunable cross-check (Sprint-1 retro discipline)

This design changes the **static body-to-wheel baseline gap**, which is the exact quantity ADR 0018 §3's per-wheel suspension `maxTravel` (0.25 world units) travels *within*. The two were decided in separate ADRs and are each individually reasonable, but combined on the two smaller body tiers the current `maxTravel` can exceed the wheel's retained fender overlap at full down-travel — the Sprint-1-retro *class* of interaction (two reasonable numbers, separate ADRs, combined breaks a guarantee, here AC5 "no detach/hole"). Reconciled explicitly in §Consequences item 3 and §Risks; a dated pointer is added to ADR 0018 §3.

## Context

Direct human feedback while reviewing the shipped #62/#63: the truck body sits too low relative to its wheels. `truck-sockets.ts`'s documented convention places each tier's body so its underside rests at wheel-*center* height, which reads as a squat stance and leaves the per-wheel suspension (#63) almost no visible room to travel in. Issue #65 asks to raise the body for a lifted "monster truck" stance across all three body tiers, without changing the truck's overall size (`TRUCK_SCALE`, #62), its horizontal contact radius, any upgrade-axis stat, or the physics model. This must stay inside the arcade-kinematic architecture (ADR 0001 §2): a render-layer socket Y-offset only, never a vertical physics axis. The requirements doc left six open questions; this ADR resolves them.

## Decision

### 1. Mechanism — a second per-tier derivation factor in `truck-sockets.ts`, layered on top of `TRUCK_SCALE`

Introduce a single global constant `BODY_LIFT_FACTOR` (proposed default **0.6**) in `truck-sockets.ts`. In the export derivation — *after* `scaleSockets(raw, TRUCK_SCALE)` already runs — add a per-tier lift to the body-mounted sockets only:

```
lift(tier)      = BODY_LIFT_FACTOR * WHEEL_RADIUS_BY_TIER[tier]   // post-TRUCK_SCALE world units
body.y      +=  lift(tier)
engine.y    +=  lift(tier)   // hood cue is mounted ON the body — must rise with it
gasTank.y   +=  lift(tier)   // side/rear cue is mounted ON the body — must rise with it
wheels[*]      unchanged      // wheels stay ground-relative; this IS the increased gap
```

This mirrors ADR 0018 §1's rationale exactly: keep `RAW_BODY_TIER_SOCKETS` the readable "underside rests at wheel-center" source of truth, and apply the lift as a documented derivation wrapper (`liftSockets`, an analogue of `scaleSockets`) so the authored numbers stay legible and the lift lives in one place. Because the lift is based on `WHEEL_RADIUS_BY_TIER` (already `TRUCK_SCALE`-scaled) and added to `BODY_TIER_SOCKETS` (already scaled), everything is in final world units — no double-scaling. `buildTruckRig()`, the builder preview, and every other consumer pick it up with zero call-site edits (AC8 holds by construction — single rig path, ADR 0011 §4).

**Why lift the engine/gas sockets too, but not the wheels:** the engine and gas-tank cues are props positioned relative to the rig group, not parented under the body node. Raising only `body.y` would leave them floating at the old height, detached from the risen body. They must shift by the same `lift(tier)` so the {body + engine + gas} assembly moves up rigidly, while the four wheels stay planted — which is precisely the increased daylight the feature wants. (The primitive `fallbackBody` box, positioned at `sockets.body`, also rises; acceptable — it is a transient placeholder with no fenders.)

### 2. Tier-uniform *factor*, per-tier *absolute* lift (resolves Open Question 2)

The lift is **one shared global factor** whose *absolute* magnitude varies per tier because it multiplies that tier's wheel radius. This is neither "one identical absolute offset for all tiers" nor "three hand-authored per-tier values" — it is the same single-knob approach ADR 0018 §1 used for `TRUCK_SCALE`, applied to a per-tier quantity.

**AC2 (tier progression preserved) is satisfied by construction, not by hope.** Adding `k · r(tier)` to each body's Y, where `r(tier)` is strictly increasing (0.378 < 0.54 < 0.783 post-scale), strictly preserves and mildly *amplifies* the existing Tier 0 < Tier 1 < Tier 2 height ordering — it cannot flatten it, because a larger tier receives a larger absolute lift. The retained fender-overlap *ratio* `(1 − k)·r` is identical across tiers, so the stance reads consistently — "same amount of daylight per wheel-radius" on every tier. This is the same provable-uniformity argument ADR 0018 §1 makes, and is pinned the same way (extend `truck-sockets.test.ts`'s ratio-preserved regression test to assert the post-lift body-Y ordering and the constant overlap ratio).

### 3. Magnitude default and headroom bound (resolves Open Questions 1 and 3)

Geometry inspection of the three sourced body `.glb` files (POSITION-accessor bounds transformed through each body node's own baked 100× scale + −90°X rotation, then the tier's effective `bodyScale`) gives, per tier, in final world units:

| Tier | wheel r | body underside (today) | body top (today) | wheel top (2r) | tuck budget = wheel_top − underside = r |
|---|---|---|---|---|---|
| 0 | 0.378 | 0.378 | ~1.00 | 0.756 | 0.378 |
| 1 | 0.540 | 0.540 | ~1.35 | 1.080 | 0.540 |
| 2 | 0.783 | 0.783 | ~2.02 | 1.566 | 0.783 |

The confirmed finding for **Open Question 3**: today the wheel's upper half overlaps the body/fender by ~**one full wheel radius** (the underside sits at wheel-center, the wheel top pokes up to `2r`). That overlap is the headroom the lift spends. Lifting the body by `L` reduces the retained overlap to `r − L`, so **the lift is hard-bounded at `L < r` (i.e. `BODY_LIFT_FACTOR < 1.0`)** before the tire's top pulls entirely below the body underside and the wheel-well opening starts to expose a gap (AC5). The proposed **`BODY_LIFT_FACTOR = 0.6`** spends 0.6·r and keeps 0.4·r of overlap on every tier (0.151 / 0.216 / 0.313 world units) — a moderate, safe stance. Proposed playtest range **0.4–0.8**.

Honest limitation this surfaces (feeds back into OQ3 per the requirements' process, not worked around): with these sourced fenders, the body underside cannot be raised *above* the tire tops (that needs `L > r`, which empties the fender arches) without re-authoring the assets — a non-goal. So the achievable look is "chassis raised toward the tire-top line with retained fender coverage," a believable lift, **not** a caricature chassis-fully-above-tires monster truck. The exact ceiling where a fender arch visibly "floats" off the tire is below the `L < r` hard bound and is **only confirmable by the mandatory live-render pass** — the developer renders all three tiers at 0.6 and steps the factor down (or, as a last resort, drops one tier to a per-tier override — see §Alternatives) if any arch separates. This is the OQ3 live check the requirements explicitly reserved for implementation, now bounded to a specific range and a specific fallback.

### 4. Suspension `maxTravel` / climb constants re-tune (resolves Open Question 4)

The lift shrinks the wheel's retained overlap, which is the room a *downward* suspension residual has before the tire un-tucks from the fender and reads as detached (AC5). The binding constraint is the smallest tier:

```
maxTravel  ≲  min_tier (retained overlap)  =  (1 − BODY_LIFT_FACTOR) · r(tier=0)  ≈  0.15   (at factor 0.6)
```

ADR 0018 §3's current `maxTravel = 0.25` **exceeds** this on tiers 0 (0.151) and 1 (0.216): a full down-travel could drop the tire below the fender skirt. **Recommendation:** lower `DEFAULT_SUSPENSION_CONFIG.maxTravel` to ≈**0.15** as a safe single-constant default (still clearly legible against the new, larger baseline gap — the whole point of AC3, since the wheel now has visible daylight to move in). A richer alternative, if a playtest finds tier-2 travel too subtle under a single low cap, is to make `maxTravel` proportional to wheel radius (`m · r`, `m ≤ 1 − BODY_LIFT_FACTOR`); this is a bigger change (threads tier into `SuspensionConfig`) and is left as a documented option, not the default. `DEFAULT_CLIMB_CONFIG`'s whole-body lift/tilt is a *group* transform layered on top of the rig and is unaffected by the body's internal Y offset (the whole rig, wheels included, moves together), so it needs no numeric change — but the mandatory AC3/AC4 screenshot pass must still confirm the layered look reads correctly at the new stance. Exact final numbers are a downstream playtest tuning decision (OQ4 is explicitly non-blocking), but the relationship `maxTravel ≲ (1−factor)·r_min` must be respected.

### 5. Physics collider unchanged — written confirmation (resolves Open Question 5)

**`TRUCK_HALF_HEIGHT` (0.4, `src/systems/driving-system.ts`) does not change, and neither does any collider dimension.** Confirmed in writing because the human's issue explicitly asked about hitbox/center-of-mass:
- The physics is kinematic and XZ-planar (ADR 0001 §2). `TRUCK_HALF_HEIGHT` is used only in the boundary-clamp `setPosition(clamped, TRUCK_HALF_HEIGHT)` call to keep the controller at ground level; the truck's collision resolution against structures/obstacles is horizontal (the `TRUCK_CONTACT_RADIUS` cylinder). Raising the *visual* body does not move the collider and does not participate in any vertical collision, because there is none.
- There is **no rigid-body dynamics and therefore no simulated center of mass** — the truck is a kinematic controller (ADR 0001 §2), not a dynamic vehicle. The human's "center of mass" concern has no physical quantity to affect here; the raised body is purely a Three.js node offset, the same category as the existing climb lift and wheel roll/steer.
- `TRUCK_CONTACT_RADIUS` and all horizontal reaches (boop/bump/fuel/climb footprint) are untouched (AC6) — this is a vertical repositioning only.

### 6. Orientation is a separate, unaffected concern (project convention)

The truck is a moving visual entity, so per the Sprint-4-retro convention its spatial orientation is designed as its own concern — already owned by ADR 0018 §5: heading yaw to face travel (`group.rotation`, ADR 0013), front-wheel steer-yaw and all-wheel roll spin (#40). **This ADR adds a pure static vertical translation and no rotation of any kind** — it does not touch heading, steer-yaw, or roll, and therefore cannot affect what the truck faces or how it turns to face its direction of travel. Orientation-to-travel remains exactly as designed. Noted explicitly so the "orientation left undesigned" gap (ADR 0015's farmer-rotation bug) is not silently repeated: here it is designed as "unchanged and untouched," which is correct because the change is translation-only.

## Alternatives considered

- **Bake the lift directly into each tier's `RAW_BODY_TIER_SOCKETS` `bodyCenterY`.** Rejected: destroys the readable "underside at wheel-center" source-of-truth and its derivation comment, and buries a tunable inside authored data. Layering a documented factor (like `scaleSockets`) keeps provenance and one-place tuning.
- **A single identical *absolute* lift for all three tiers.** Rejected: gives the small tier-0 truck the same daylight as the large tier-2, reading as disproportionate on the small truck, and spends a bigger fraction of tier-0's smaller tuck budget (uneven AC5 risk). A wheel-radius-proportional lift keeps the overlap ratio constant.
- **Three hand-authored per-tier lift values.** Rejected as default: more knobs, no provable AC2 preservation, invites tier drift. Kept available as a *fallback* if the live-render pass shows one specific tier's fender needs individual treatment (OQ3).
- **`group.scale`/a taller collider to imply lift.** Rejected: changes size (a #62 concern, non-goal) or introduces a vertical physics axis (violates ADR 0001 §2).

## Consequences

1. **One new tunable, one place.** `BODY_LIFT_FACTOR` joins `TRUCK_SCALE` in the `truck-sockets.ts` derivation; consumers need no edits. Tuning the stance is a one-number change plus a screenshot pass.
2. **Bounded by sourced fender geometry.** The achievable stance is a moderate lift (< 1 wheel-radius), not a caricature — a genuine ceiling of using the sourced assets un-re-authored (§3). If the human wants a taller-than-`L<r` stance later, that is a new asset-authoring story, not a socket tweak.
3. **`maxTravel` must come down (or go proportional).** The static gap and the suspension travel now share a budget; ADR 0018 §3's `maxTravel = 0.25` is reconciled to ≈0.15 (§4). This is the shared-tunable interaction called out up top — the developer must not tune the lift without re-checking `maxTravel`, and vice versa.
4. **Engine/gas cues now ride the lift.** Their sockets gain the same per-tier offset; a screenshot must confirm they still read as mounted on the body (they should, since it is a rigid shift preserving their body-relative placement).
5. **What gets harder:** the stance, the suspension `maxTravel`, and the fender-overlap look are now three interacting quantities that must be judged together in one screenshot pass per tier — more coupled than a standalone tuning value. This is inherent to changing a baseline other effects layer on.

## Component / data design

| Location | Change | Responsibility |
|---|---|---|
| `src/render/truck-sockets.ts` | Add `BODY_LIFT_FACTOR`; add a `liftSockets(s, amount)` derivation wrapper (analogue of `scaleSockets`) that adds `BODY_LIFT_FACTOR * WHEEL_RADIUS_BY_TIER[tier]` to `body.y`/`engine.y`/`gasTank.y` only, applied after `scaleSockets` when building `BODY_TIER_SOCKETS`. Wheels untouched. | One place owns the lift factor; authored `RAW_*` tables stay readable. |
| `src/render/truck-sockets.test.ts` | Extend the ratio-preserved regression test: assert post-lift body-Y ordering (tier0 < tier1 < tier2) and constant `(1−factor)` overlap ratio; assert wheels' Y unchanged by the lift. | Pins AC2 + "wheels stay planted". |
| `src/core/driving/config.ts` | Lower `DEFAULT_SUSPENSION_CONFIG.maxTravel` toward ≈0.15 (playtest-confirmed); add a comment pointing to this ADR's `maxTravel ≲ (1−factor)·r_min` relationship. `DEFAULT_CLIMB_CONFIG` unchanged numerically. | Suspension safe against the new baseline (AC5). |
| `src/render/truck-rig.ts` / `scene.ts` | **No structural change** — they read `socketsForBodyTier(...)` and apply transforms as today; the lift arrives in the data. | Single-rig invariant intact (AC8). |
| `src/systems/driving-system.ts` | **No change.** `TRUCK_HALF_HEIGHT` and the collider are untouched (§5). | Confirms OQ5. |

```
Vertical cross-section, tier 0 (world units above ground), factor 0.6:

  today                          after lift (+0.227)
  body top   ~1.00               body top   ~1.23
  ┌─────────┐                    ┌─────────┐
  │  body   │  wheel top 0.756   │  body   │
  │ ....... │◄─ underside 0.378  │ ....... │  wheel top 0.756
  ●  axle   ●  = wheel center    │ ....... │◄─ underside 0.605
  │  wheel  │                    ●  axle   ●  ← retained overlap 0.151
  └────ground Y=0────            │  wheel  │
                                 └────ground Y=0────
  overlap (tuck) = r = 0.378     overlap = (1−0.6)·r = 0.151
  daylight under chassis grows by +0.227 (the monster-truck read)
```

## Risks

- **Fender arch floats off the tire at 0.6** (most likely surprise) — the sourced wheel-well may not skirt as low as the body underside, so a visible gap could open below the `L<r` bound. Caught by the **mandatory live-render pass** on all three tiers (AC5 is screenshot-verified by design); step `BODY_LIFT_FACTOR` down, or drop one tier to a per-tier override (§Alternatives), before proceeding. Do not assume 0.6 is safe from code inspection alone — this is the exact class of defect (floating decal, invisible river) the project's screenshot discipline exists to catch.
- **`maxTravel` left at 0.25 → wheel detaches at full down-travel on tiers 0/1** — the shared-tunable interaction (§3/§4). Caught by the AC3 suspension screenshot pass *and* a regression assertion (`maxTravel ≤ (1−factor)·r_min`). The Sprint-1 retro is the precedent: two reasonable numbers from separate ADRs must be checked against each other, not left for review.
- **Engine/gas cue left behind if only `body.y` is lifted** — would show as the hood/tank prop floating below the risen body. Guarded by lifting all three body-mounted sockets together (§1) and a screenshot check (Consequences 4).
- **Camera interaction with pre-existing bugs #66/#67 (informational, OQ6)** — a taller truck raises the body top (tier 0 ~1.0 → ~1.23; tier 2 ~2.02 → ~2.49), which plausibly *exacerbates* #67 (builder preview crops Tier 1/2 bodies) and #66 (chase camera clips structures). This ADR does not fix either, but flags for sequencing: whoever picks up #66/#67 should re-frame/re-check against the post-lift body top, and ideally #67 lands at or after this so the preview framing is tuned once against the final stance.

## Open questions (surfaced to the human)

1. **`BODY_LIFT_FACTOR` magnitude** — proposed **0.6** (range 0.4–0.8), confirm by playtest/screenshot (OQ1, non-blocking).
2. **`maxTravel` re-tune** — recommended ≈**0.15** (down from 0.25), or proportional `m·r`; confirm by the AC3 suspension screenshot pass (OQ4, non-blocking).
3. **Live-render fender-headroom confirmation** — the one thing genuinely undecidable from code (OQ3): does 0.6 keep every tier's fender visually covering its tire? Requires the developer's screenshot pass; bounded here to `factor < 1.0` and a per-tier-override fallback.

## Implementation note (2026-07-12, developer)

Implemented as designed in §Decision: `BODY_LIFT_FACTOR = 0.6` and `liftSockets()` in `src/render/truck-sockets.ts`, `DEFAULT_SUSPENSION_CONFIG.maxTravel` lowered from 0.25 to 0.15 in `src/core/driving/config.ts` (both exactly at the ADR's proposed/recommended defaults, no deviation needed).

Live-render pass (real keyboard-driven driving session + the builder's live preview, both via the shared `buildTruckRig()` path; screenshots in `docs/qa/screenshots/issue-65-body-lift/`, no `world.step()`/teleport hook used):
- All 3 body tiers show a clearly larger, visibly-daylight-under-the-chassis stance in the builder preview, with Tier 0 < Tier 1 < Tier 2 progression still obvious at a glance (AC1/AC2/AC8) — resolves OQ1.
- No tier's fender/wheel-well silhouette separated from its tire at 0.6 — every wheel still reads as mounted under its fender, on all 3 tiers, both in the builder preview and the driving scene (AC5). **OQ3 resolved: 0.6 is safe with the sourced assets as-is; no per-tier override was needed.**
- Drove the tier-0 (default-owned) truck over the small `passable` bush obstacle (`core/terrain.ts` `STUB_OBSTACLES`) including a direction change (a right turn en route, not a straight approach) — the whole-body climb lift/tilt and the per-wheel suspension travel both read correctly at the new baseline: visible independent wheel motion crossing the obstacle, no wheel detaching from or clipping through the fender at any point in the crossing (AC3/AC4) — resolves OQ4's "does it look proportionate" check.
- No console errors/crashes during the session (one benign browser-default `favicon.ico` 404, unrelated to this change and present on the unmodified `index.html`).

No factor step-down or per-tier override was needed; `BODY_LIFT_FACTOR = 0.6` and `maxTravel = 0.15` ship as the ADR's own proposed defaults.
