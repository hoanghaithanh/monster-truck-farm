# ADR 0002 — Upgrade tier data model (4 axes)

Status: Proposed (Sprint 1)
Date: 2026-07-06
Related: `truck-builder-and-upgrades.md`; ADR 0001 (`core/stats`), ADR 0004 (gas consumes tank tier)

## Context

The builder has four independent upgrade axes — body, wheels, engine, gas tank — each its own tier list with its own stat (builder AC1–AC5). Sprint 1 makes all tiers freely selectable (no coin gating — builder AC6), but Sprint 2 adds an owned/locked state per tier and a coin-spend flow (backlog #14). The data shape must let Sprint 2 add ownership **additively**, without rewriting the tier tables or the systems that read them. Several exact numbers (body tier count, engine speeds, gas capacities) are deliberately left as tunable config (builder Open Qs 1–3).

## Decision

Model each axis as an ordered list of **tier definitions**, and a player's build as **four selected tier indices** resolved into a flat `TruckSpec` that the rest of the game consumes. Tier data is pure data in `core/stats`; no system reads raw tiers — they read the resolved `TruckSpec`.

```ts
// core/stats/tiers.ts  (pure data — the tunable tables)
type BodyTier   = { tier: number; hitCapacity: number };     // base 3, +1/tier
type WheelTier  = { tier: number; name: string; clearance: ObstacleClass }; // small|medium|large
type EngineTier = { tier: number; name: string; topSpeed: number };         // units in config
type GasTier    = { tier: number; name: string; capacity: number };         // seconds of drive at full throttle

// A build is just the chosen index per axis.
type TruckBuild = { body: number; wheels: number; engine: number; gasTank: number };

// Resolved once at build-confirm; this flat object is the contract every system reads.
type TruckSpec = {
  hitCapacity: number;        // farmer system
  clearance: ObstacleClass;   // clearance rule / physics setup
  topSpeed: number;           // driving + gas limp
  gasCapacity: number;        // gas system
};
```

`resolveSpec(build): TruckSpec` is a pure function — the single, unit-testable place that maps selections to stats (builder AC1–AC5). Because every downstream system depends on `TruckSpec` and not on tier indices, we can change tier tables, add tiers, or add ownership without touching driving/gas/farmer code.

**Sprint 1 tier tables (defaults; numbers tunable in config):**
- **Body:** tiers 0–2 = 3/4/5 hits (`3 + tier`), implement ≥3 tiers (builder body spec, Open Q1 leaves the ceiling open — three is the floor).
- **Wheels:** tier 0 Base→small, tier 1 Off-road→medium, tier 2 Monster→large (builder wheels table). `clearance` maps to the obstacle classes the run's terrain must contain (drive AC5).
- **Engine:** tiers 0–2, strictly increasing `topSpeed` (builder AC4). Concrete m/s values as config constants (Open Q2 — relative tiers acceptable to ship).
- **Gas tank:** tiers 0–2, strictly increasing `capacity` in seconds-of-drive; **drain rate stays constant across tiers** (builder Open Q3 recommended reading — capacity-per-tier, not drain-per-tier; simpler to reason about and test — one number changes per tier). Recommend adopting this; flagged below if the human prefers otherwise.

### Sprint 2 readiness (do not build now)

Ownership is an **additive wrapper**, not a change to the tier tables. Sprint 2 adds a per-axis owned set and a selectability gate; Sprint 1 behaves as if everything is owned:

```ts
// Sprint 2 shape — shown only to prove the Sprint 1 model absorbs it cleanly.
type Ownership = { body: number[]; wheels: number[]; engine: number[]; gasTank: number[] }; // owned tier indices
// selectable(axis, tier, ownership) -> boolean.  Sprint 1: always true (builder AC6).
```

The tier definitions, `resolveSpec`, and every consumer stay byte-for-byte the same; Sprint 2 only introduces `Ownership`, a `selectable` predicate, and the coin-spend action that mutates `Ownership`. No rewrite.

## Alternatives considered

- **Store stats directly on the truck instead of resolving through tiers.** Rejected: loses the tunable single-source tier tables and makes the Sprint-2 purchase flow (which operates on tiers) awkward.
- **Bake ownership into each tier now (`{tier, owned}`).** Rejected: builds Sprint-2 scope this sprint against no coin-spend mechanic, and mixes tunable balance data with mutable run state.
- **One 2D tier matrix instead of four independent axis lists.** Rejected: the axes are genuinely independent (builder intent); a matrix invents coupling that doesn't exist.

## Consequences

- One clear contract (`TruckSpec`) for all gameplay systems; tuning is confined to `core/stats` config.
- Sprint 2's purchase flow is purely additive — the main goal of this shape — at the cost of a slight indirection now (selection index → resolved spec) that is trivial and well worth it.
- Tier *counts* and exact numbers remain open tuning items; the model doesn't care how many tiers exist per axis.

## Risks

- **Gas-tank axis interpretation (Open Q3)** — if the human later wants drain-rate-per-tier instead of capacity-per-tier, `GasTier` gains a `drainRate` field and `resolveSpec`/the gas model read it. Small, localized change; noted so it's a conscious pick, not a silent assumption. Detected at the confirmation checkpoint on this ADR.
- **Balance feel** (are three engine/gas tiers enough to feel meaningful for the child?) is a playtest question, not an architecture risk — adding tiers is appending to a table.
