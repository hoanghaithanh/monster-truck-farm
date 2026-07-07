# ADR 0004 — Gas system & "limp mode" semantics

Status: Proposed (Sprint 1)
Date: 2026-07-06
Related: `drive-terrain-and-gas.md` (AC10–AC14), `truck-builder-and-upgrades.md` (gas tier = capacity); ADR 0001 (driving), ADR 0002 (`gasCapacity`, `topSpeed`)

## Context

Gas drains while driving and auto-regens while idle (drive AC10/AC12). Running out must **never** hard-stop the truck — it drops to a reduced "limp" top speed until idle-regen kicks in, and there is no game-over anywhere in this system (drive AC11/AC14; the hard fail state belongs only to the farmer, ADR 0003). The requirements leave two things open: exact drain/regen rates (Open Q1 — agreed as tunable playtest constants), and what "limp" concretely means (Open Q2 — two candidate interpretations). This ADR pins down the mechanism and makes a recommendation on limp semantics.

**On the limp-mode ambiguity:** the requirements doc already enumerates both interpretations precisely, and both reduce to a single one-line `limpSpeedFor(topSpeed)` function behind the same interface — the choice does **not** change the architecture. So this is recorded as a recommendation + open question for the human rather than escalated to the requirements-analyst (which would only re-surface a decision the human already owns).

## Decision

A pure model in `core/gas`, unit-testable by feeding known `dt`:

```ts
type GasState = { remaining: number };            // seconds-equivalent, 0..capacity
type GasInputs = { capacity: number; throttleOn: boolean; movingIdle: boolean; dt: number };

// constants live in config, tunable post-playtest (Open Q1):
//   DRAIN_PER_SEC, REGEN_PER_SEC, LIMP_FACTOR
```

Per simulation tick:
- **Driving** (throttle above idle): `remaining -= DRAIN_PER_SEC * dt`, clamped at 0. Reaches empty after the tier's `gasCapacity` at constant drain (drive AC10; capacity-per-tier from ADR 0002).
- **Idle** (no throttle and effectively stationary): `remaining += REGEN_PER_SEC * dt`, clamped at `capacity` (drive AC12). No refill location — idle-triggered only.
- **Effective top speed** feeds the driving cap (ADR 0001):
  - `remaining > 0` → full `topSpeed` (engine tier).
  - `remaining == 0` → **limp** top speed.
- **Instant recovery** (drive AC13): the moment `remaining > 0` again, full top-speed capability returns — no full tank required, no separate "limp latch". Effective speed is a pure function of the *current* `remaining`, so recovery is automatic, not a state to exit.

**Limp semantics — recommended: interpretation (b), a percentage of the truck's own top speed.**

`limpTopSpeed = topSpeed * LIMP_FACTOR` (LIMP_FACTOR ≈ 0.25, drive AC11's "roughly 25%").

Rationale: keeping limp proportional to the engine tier means a higher-engine truck still limps faster than a lower-engine one, so engine upgrades stay meaningful even when low on gas (the exact concern drive Open Q2 raises). It's also the *more forgiving* reading, matching the project's design bias. The doc drafted interpretation (a) (a flat low speed regardless of tier) only for simplicity — the architecture supports either because it's one function, so switching is a config/one-line change if the human prefers (a).

There is **no fail state, no UI "game over", no hard stall** anywhere in this system (drive AC14). The only player-visible effect of empty gas is reduced top speed; the DOM HUD shows a gas gauge that a child can read at a glance.

## Alternatives considered

- **Limp interpretation (a): fixed low speed regardless of engine tier.** Not chosen (but one line away): simpler, but erases the engine tier's value while low on gas, which is the less forgiving reading. Left selectable via `LIMP_FACTOR`/config if the human overrides.
- **Hard stall at empty (truck stops).** Rejected outright — violates AC11/AC14 and the no-fail-state bias for this system.
- **Drain-rate-per-tier instead of capacity-per-tier.** Rejected for Sprint 1 to match ADR 0002 (one number changes per tier; simpler to reason/test). Revisitable there if the human prefers, via a `drainRate` field — the gas model would just read it instead of a constant.
- **Escalate limp semantics to requirements-analyst.** Not done: the ambiguity doesn't change the architecture (one swappable function), and the human already owns the choice; escalating would burn effort re-deriving a documented open question.

## Consequences

- Effective speed being a pure function of `remaining` makes both "limp on empty" and "instant recovery" fall out for free — no explicit limp state to enter/exit, less to get wrong.
- All tuning (drain, regen, limp factor) is config; playtest with the child drives the numbers, no code change.
- The gas system stays strictly no-fail-state, keeping the hard-fail precedent isolated to the farmer (ADR 0003).

## Risks

- **Limp semantics still unconfirmed (Open Q2).** Low risk — a one-line switch. Detected at this ADR's confirmation checkpoint; if unresolved it's documented here rather than blocking.
- **Drain/regen tuning feels punishing or pointless** for a young child. Detected in playtest. Mitigation: config constants; the "never hard-stop" guarantee caps the downside regardless of numbers.
- **"Idle" detection** (throttle-off *and* effectively stationary) could mis-fire if thresholds are off, letting the tank regen while still coasting. Detected in playtest/observation. Mitigation: a small speed epsilon in config; the `movingIdle` input is computed in one place.
