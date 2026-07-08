# ADR 0005 — Reconciling farmer speed with gas limp mode (fairness floor)

Status: Proposed (Sprint 1, fixes issue #20)
Date: 2026-07-07
Related: ADR 0003 (farmer state machine, "always outrunnable" guarantee), ADR 0004 (gas system & limp mode), ADR 0002 (`ENGINE_TIERS.topSpeed`)
Amends: ADR 0003 §"Farmer speed", ADR 0004 §"Limp semantics"
Superseded by: ADR 0007 (Sprint 2) — this ADR's `GAS_LIMP_MIN_SPEED` floor was an explicit Sprint 1 stopgap; ADR 0007's dynamic farmer speed makes "always outrunnable" structural, so the floor is retired and the cross-system test flips from `FARMER_SPEED < limpTopSpeed(tier)` to `FARMER_CREEP_FLOOR < limpTopSpeed(lowestTier)` plus a structural `farmerSpeed(v) < v` check.

## Context

ADR 0003 guarantees the farmer is **always outrunnable** by the child — a core "no-stress" fairness property enforced by `FARMER_SPEED = 4`, asserted and tested to stay below every engine tier's *nominal* `topSpeed` (lowest is 6). ADR 0004 independently added **limp mode**: at an empty tank, `effectiveTopSpeed = topSpeed * 0.25`, giving per-tier limp speeds of **1.5 / 2.25 / 3.0**. Neither ADR considered the other. All three limp speeds are below `FARMER_SPEED (4)`, so a child who runs the tank empty while being chased **cannot outrun the farmer on any tier** — a direct violation of ADR 0003's guarantee, with no other mitigation until Sprint 2's give-up/tired state exists (issue #20, must-fix before Sprint 1 sign-off).

The two decisions are each internally correct; they only fail at their intersection. Something must give, and the choice is *which invariant we protect*. ADR 0003's fairness guarantee is the reason issue #20 is a blocker (it is the game's central forgiving-bias for a young-child audience). ADR 0004's limp-mode **tier differentiation** (its Open Q2 "interpretation (b)") is explicitly recorded as unconfirmed and "one line away" from the simpler flat interpretation (a). When they conflict, fairness wins.

## Decision

**Add an absolute lower bound to the gas limp speed that sits above `FARMER_SPEED`, applied inside the gas model.** The farmer stays a constant-speed, gas-ignorant Sprint 1 FSM; the entire fix lives in `core/gas`.

New constant (gas config):

```ts
export const GAS_LIMP_MIN_SPEED = 5; // > FARMER_SPEED (4), < lowest nominal topSpeed (6)
```

New limp formula (gas model), replacing the bare `topSpeed * GAS_LIMP_FACTOR`:

```ts
limpTopSpeed(topSpeed) = max(topSpeed * GAS_LIMP_FACTOR, GAS_LIMP_MIN_SPEED)
```

`5` is chosen because the fairness window is genuinely narrow: the floor must exceed `FARMER_SPEED (4)` yet stay below the lowest nominal top speed `6` (so limp is still slower than a full tank on every tier). `5` gives a 25% margin over the farmer and a clean number. Under the current tier table, `max(proportional, 5)` floors **all** tiers to `5` (since the largest proportional limp, `3.0`, is below `5`). We accept that: limp-mode tier differentiation cannot coexist with a farmer fast enough to matter (any floor `> 4` necessarily dominates every proportional limp `≤ 3.0`). This effectively reverts limp to ADR 0004's interpretation (a) — a flat low speed — for all present tiers, which is the reading ADR 0004 itself said was "one line away."

**Load-bearing numeric fact (test-enforced):** for every engine tier, `FARMER_SPEED < limpTopSpeed(tier.topSpeed)`. A test re-derives this from the real `ENGINE_TIERS` table, mirroring the existing `FARMER_SPEED < min(topSpeed)` pattern in `src/core/farmer/spawn.test.ts`.

This is a **Sprint 1 stopgap by design.** The proper long-term fix is candidate (a) below — the farmer's Sprint 2 dynamic "1/3 of the truck's *current* speed" cap. Once the farmer slows *with* the truck, the limp floor can be relaxed back toward `0.25` and per-tier differentiation returns. We are not pulling that mechanic forward now. **(That mechanic is now delivered by ADR 0007, which retires this floor — see the "Superseded by" note above.)**

## Alternatives considered

- **(a) Farmer respects the truck's current effective top speed (slow/pause in limp mode).** The correct long-term fix and the data is already at the `main.ts` call site — but it *is* ADR 0003's Sprint 2 dynamic-cap mechanic, which ADR 0003 defers specifically to keep the Sprint 1 FSM simple. It also changes the farmer's normal (full-gas) kinematics unless carefully clamped, adds a new gas→farmer coupling the FSM was designed to avoid, and turns a static numeric invariant into a behavioral one that's harder to pin to a single test. Scope-expanding for a Sprint 1 blocker. **(Adopted in ADR 0007 — which, notably, avoids the feared gas→farmer coupling by keying off the truck's *instantaneous velocity*, not gas state.)**
- **(b-alt) Raise `GAS_LIMP_FACTOR` instead of adding a floor.** To clear the farmer on the lowest tier needs `6 * factor > 4`, i.e. `factor > 0.667` — limp would be ~67% of top speed on every tier, no longer a "limp" at all and contradicting AC11's "roughly 25%". Rejected; a floor bounds only the low tiers that need it.
- **Lower `FARMER_SPEED` below the lowest limp speed (1.5).** Would make the farmer slower than `1.5` units/s — effectively uncatchable, gutting ADR 0003's whole bump/hit/game-over feature. Rejected.
- **Keep proportional limp *and* full tier differentiation.** Provably incompatible with an outrunnable-but-meaningful farmer: preserving all three proportional speeds requires the floor (and thus the farmer) below `1.5`. Not achievable; documented as the accepted trade-off. **(Resolved in ADR 0007: a farmer that scales with the truck's velocity is outrunnable *and* proportional limp differentiation returns — the two are compatible once the farmer is no longer a fixed speed.)**

## Consequences

- The fix is contained entirely in `core/gas`. No change to `farmer-system.ts`, `pursue.ts`, `driving-system.ts`, or `main.ts`; the Sprint 1 / Sprint 2 farmer boundary ADR 0003 drew stays intact.
- **Limp-mode tier differentiation is lost under the current tier table** — all tiers limp at `5`. ADR 0004's interpretation-(b) rationale ("engine upgrades stay meaningful while low on gas") no longer holds in the pursuit-relevant edge. Restored in Sprint 2 via candidate (a).
- **On the Standard engine (tier 0), limp barely slows the truck**: `5 / 6 ≈ 83%` of full speed, versus AC11's intended "~25%". The `(4, 6)` window is inherently tiny; nothing gas-local can make tier-0 limp both fair and dramatic. Flagged for playtest.
- The `limpTopSpeed(topSpeed)` function ADR 0004 anticipated now exists explicitly, making the limp rule directly unit-testable and the floor re-derivable.

## Component / data design

Data flow is unchanged; only the value flowing through it changes.

```
main.ts frame loop (per tick, unchanged):
  effectiveTopSpeed = gasSystem.update(intent, drivingSystem.speed, dt)  // now floored
  drivingSystem.setTopSpeed(effectiveTopSpeed)
  farmerSystem.update(dt, position, cbs)   // still constant FARMER_SPEED = 4, gas-unaware
core/gas/gas.ts:
  effectiveTopSpeed(topSpeed, remaining)
    = remaining > 0 ? topSpeed : limpTopSpeed(topSpeed)
  limpTopSpeed(topSpeed) = max(topSpeed * GAS_LIMP_FACTOR, GAS_LIMP_MIN_SPEED)   // NEW floor
```

**Exact code/config changes (developer):**

1. `src/core/gas/config.ts` — add `export const GAS_LIMP_MIN_SPEED = 5;` with a runtime assertion that it stays below the lowest nominal top speed (import `ENGINE_TIERS` from `../stats/tiers`, mirroring the existing assert in `core/farmer/config.ts`): throw if `GAS_LIMP_MIN_SPEED >= Math.min(...ENGINE_TIERS.map(t => t.topSpeed))`.
2. `src/core/gas/gas.ts` — extract `export function limpTopSpeed(topSpeed)` returning `Math.max(topSpeed * GAS_LIMP_FACTOR, GAS_LIMP_MIN_SPEED)`; have `effectiveTopSpeed` call it for the `remaining <= 0` branch. Import `GAS_LIMP_MIN_SPEED`.
3. `src/core/gas/gas.test.ts` — update the two assertions hardcoding `TOP_SPEED * 0.25` (they use `TOP_SPEED = 12` → `3.0`, now floored to `5`) to assert against `limpTopSpeed`/`GAS_LIMP_MIN_SPEED`; rewrite the "scales with tier" test — under current tiers both floor to `5`, so it should assert floor behavior, and demonstrate the proportional term only wins above a hypothetical `topSpeed` where `topSpeed * 0.25 > GAS_LIMP_MIN_SPEED` (documents the formula, not a shipping tier).
4. `src/core/farmer/spawn.test.ts` (the fairness block) — add the load-bearing cross-system assertion: for every `ENGINE_TIERS` entry, `expect(FARMER_SPEED).toBeLessThan(limpTopSpeed(tier.topSpeed))`. This is the regression guard that would have caught issue #20.

Keep the fairness guarantee in the **test layer**, not in production cross-imports: production modules stay decoupled (`gas` does not import farmer config, `farmer` does not import gas), preserving ADR 0003's gas-ignorant farmer. The gas config's own runtime assert only checks `floor < nominal top speed`.

## ADR update guidance (ownership)

Two existing ADRs need a documented amendment; **the architect owns these edits, not the implementing developer** (per project ADR-ownership rules — the developer touches code/tests only):

- **ADR 0003 §"Farmer speed" / Risks** — strengthen the guarantee wording from "below the lowest engine tier's top speed" to "below every tier's **minimum effective** top speed, *including gas limp mode*," and cross-reference issue #20 / ADR 0005. Add an "Amended by ADR 0005" pointer at the top.
- **ADR 0004 §"Limp semantics" / Risks (Open Q2)** — record that `GAS_LIMP_MIN_SPEED` was added for ADR 0003 fairness; that under the current tier table the floor dominates, so interpretation-(b) tier differentiation is superseded (effectively flat limp = interpretation (a)); and that Sprint 2's farmer cap (candidate a) is what restores differentiation. Add an "Amended by ADR 0005" pointer at the top.

I have added the one-line "Amended by ADR 0005" pointers to both files as part of this decision. The developer should not rewrite the decision text of 0003/0004.

## Risks

- **Tier-0 limp feels non-punishing** (`~83%` of full speed). Detected in playtest. Mitigation: `GAS_LIMP_MIN_SPEED` is a single tunable; the real relief is Sprint 2's farmer cap, tracked for that milestone.
- **Someone later raises `FARMER_SPEED` toward 5** and silently narrows the new margin. Mitigation: the cross-system test (`FARMER_SPEED < limpTopSpeed(tier)`) fails in CI, exactly as the original `FARMER_SPEED < topSpeed` test was meant to.
- **A future engine tier with a very high `topSpeed`** could make `topSpeed * 0.25` exceed the floor, quietly re-introducing (harmless) differentiation — expected and fine; the floor is a minimum, not a clamp-to-constant.
