# River Splash Effect (Cosmetic VFX)

Status: Backlog — low-priority "delight" addition, approved alongside the player's main asks but not itself requested. No dedicated sprint required; fold in whenever convenient.

Related: `docs/requirements/environment-dressing.md` AC4 (the river's existing "zero mechanical effect" constraint, which this doc must not disturb); `docs/architecture/0012-environment-dressing-and-terrain-features.md` §3 (the river's procedural-ribbon implementation, non-collidable, z 15-17 strip in the current stub terrain); `src/render/scene.ts` (existing bump-flash / fuel-glow timed-particle pattern this effect is expected to reuse).

## Problem statement

The farm's river currently has no visual reaction when the truck drives through it — it's decorative geometry with zero interaction feedback. This is a small, low-stakes delight addition, not a fix for a reported problem: a brief, kid-friendly splash effect when crossing the river would make an already-shipped decorative feature feel more alive and responsive, without changing anything about how the river behaves mechanically.

## Goals / Non-goals

**Goals**
- Play a small, brief, visually pleasant splash/spray effect when the truck's position crosses the river.
- The effect is purely cosmetic — a short-lived visual burst, reusing the kind of timed-particle-effect pattern already shipped for the bump-flash and fuel-collect glow effects.

**Non-goals**
- Any mechanical effect whatsoever — no change to truck speed, handling, gas drain/regen, or coins from crossing the river. This directly matches `environment-dressing.md` AC4's existing constraint ("truck movement, top speed, gas drain/regen, and coin systems are completely unaffected... zero mechanical effect") and this doc does not reopen or weaken that constraint.
- Any change to the river's existing collision/collider behavior (it has none today, and this doc doesn't add one) or its visual geometry/material.
- Sound design (a splash sound effect) — out of scope; project-wide sound design beyond basic SFX is deferred per `CLAUDE.md`.
- A new spawn-keepout or gameplay rule tied to the river — the river remains excluded from spawn keep-out exactly as today (ADR 0012 §5); this doc adds a visual reaction only.

## User stories

1. As a player, I want to see a fun splash when I drive through the river, so the world feels responsive and alive instead of static.

## Acceptance criteria

- **AC1 (splash on crossing):** Given the truck's position enters the river's area, when contact is detected, then a brief, visible splash/spray effect plays at (or near) the truck's position.
- **AC2 (brief and self-clearing):** The splash effect is short-lived and removes itself automatically after a fixed, brief duration — no effect lingers indefinitely or requires the player to do anything to clear it, consistent with the existing bump-flash/fuel-glow pattern's timed decay.
- **AC3 (kid-friendly tone):** The splash reads as a fun, positive visual moment — no jarring, scary, or startling motion/color, consistent with the project's forgiving, colorful design bias. It should look like a friendly water splash, not an impact or damage effect.
- **AC4 (zero mechanical effect — hard constraint, unchanged):** The splash effect never changes truck movement, top speed, steering, gas drain/regen, or coins in any way. This is a direct restatement of `environment-dressing.md` AC4 and must continue to hold exactly as-is; this doc adds a visual layer only, never a gameplay one.
- **AC5 (no distracting spam on repeated crossings — see Open Question 1):** If the player drives back and forth across the river repeatedly, the splash effect must not become visually distracting/spammy (e.g., overlapping effects piling up or firing every single frame while inside the river's area). Exact throttling approach is not specified here — see Open Question 1.

## Open questions

1. **Splash throttling approach:** Should the splash play once per discrete crossing (e.g., on river-area entry, then suppressed until the truck fully exits and re-enters), or be time-throttled (e.g., at most once per N seconds while continuously inside the river's area, for a player who parks and idles across it)? Both satisfy AC5's "not spammy" intent; this is a small implementation-time call, not a product decision, but flagged since it affects the exact trigger condition. Recommend "on river-area entry" (mirrors how contact-triggered effects already work elsewhere, e.g. fuel-pickup collection is a discrete contact event, not continuous) as the simpler default, with a human sign-off welcome but not required to unblock implementation given this feature's low-stakes framing.
2. **Visual asset/technique:** Should the splash be a particle burst, a simple sprite/billboard, an expanding ring decal, or something else? Not specified here — implementation detail, non-blocking, consistent with this doc's low-priority framing.

## Constraints

- Must not alter the river's existing zero-mechanical-effect behavior (`environment-dressing.md` AC4) in any way — this is the one hard constraint carried over from the river's original requirements doc.
- Must not add a collider or any new gameplay rule to the river — the effect is trigger-only (position/area check), not a physics interaction.
- Runs in-browser (Three.js + Vite), same as every other feature — given constraint, not a decision made here.
- Low-priority, small-scope: this doc should not be over-specified or treated as load-bearing. Reusing the existing bump-flash/fuel-glow timed-effect pattern in `src/render/scene.ts` is an acceptable, even preferred, way to satisfy AC1-AC3; no new VFX system is required by this doc.
