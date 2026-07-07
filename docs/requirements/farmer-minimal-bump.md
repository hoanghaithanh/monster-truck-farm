# Farmer — Minimal Bump Mechanic (Sprint 1)

Status: Sprint 1 (minimal version only). Full behavior is explicitly a Sprint 2 non-goal here — see below.

## Problem statement

The body upgrade stat (hit capacity) is meaningless without something that can actually drain a hit. Sprint 1 needs just enough of the "angry farmer" mechanic — appear, chase, bump — to make body-tier upgrades observable and testable, and to make the confirmed hard-game-over consequence (see below) reachable. The full polished farmer behavior (timed chase, giving up when "tired") is out of scope for this sprint and is specified here only as a forward-looking note, not as something to build now.

**Confirmed design decision (resolved by the human, superseding the earlier draft of this doc):** when the truck's hit capacity reaches 0, the run ends in a hard game over — the player restarts from the truck builder. This is a deliberate, confirmed exception to the project's general no-fail-state design bias; that exception is now recorded in the project's own CLAUDE.md intent doc, and this requirements doc is written to match it, not to reopen it. Every other Sprint 1 system (gas, animal boops, wheel-obstacle blocking) still follows the general no-fail-state bias — the farmer/body-hit system is the one deliberate exception.

## Goals / Non-goals

**Goals**
- A farmer character can randomly appear, move toward the player's truck, and on contact drain exactly one hit from the truck's current remaining hit capacity.
- This is enough to make body-tier differences (3 vs. 4 vs. 5+ hits, per `truck-builder-and-upgrades.md`) observable in play.
- Implement the confirmed hard-game-over-and-restart behavior when hit capacity reaches 0.

**Non-goals (Sprint 1) — explicitly deferred to Sprint 2**
- Chasing the player for a fixed duration (~10 seconds).
- Chasing at a defined fraction of the player's speed (~1/3).
- "Giving up" / becoming "tired" and disengaging after the chase timer expires.
- Any farmer-specific animation/VFX/sound polish beyond a basic appear/move/contact behavior.

These Sprint 2 items are noted here for continuity but are not restated as open questions — the scope split itself is already agreed; only the minor item under Open Questions below remains open.

## User stories

1. As a player, I want an angry farmer to occasionally appear and chase my truck, so there's a reason the body upgrade stat matters.
2. As a player, I want the farmer bumping my truck to drain one hit from my current capacity, so upgrading my body part has a visible, testable payoff.
3. As a player, when my hit capacity reaches 0, I want the run to end and take me back to the truck builder to start a fresh run, so the stakes of the farmer mechanic are clear and I always have a well-defined way back into play.

## Acceptance criteria

- **AC1 (appearance):** Given an active play session, when a random trigger condition is met (exact cadence TBD — reuse the same "tunable, playtest later" approach as gas/spawn rates), then a farmer character appears somewhere on the terrain.
- **AC2 (chase):** Given the farmer has appeared, when time passes, then the farmer moves toward the player's current position (no fixed duration or give-up logic required in Sprint 1 — that's Sprint 2).
- **AC3 (bump drains a hit):** Given the farmer makes contact with the player's truck, when contact occurs, then the truck's current remaining hit count decreases by exactly 1.
- **AC4 (hit count visible):** Given the truck has taken 1 or more farmer bumps, the player can see (via UI) how many hits remain out of the truck's built capacity, so a child understands the stat without reading numbers (e.g., a simple icon row).
- **AC5 (distinct from animal boop):** A farmer bump is visually and mechanically distinct from booping an animal — it must read as "something happened to me" (e.g., a shake/flash on the truck) rather than a reward moment, without being scary or violent (still fits the "no violence framing" constraint — this is impact feedback, not harm/gore).
- **AC6 (hard game over — finalized, confirmed):** Given the truck's remaining hit capacity reaches 0, when the hit that brings it to 0 is taken, then: (a) the run ends immediately, (b) the player is returned to the truck builder / part-selection screen, (c) the visible coin counter resets to 0, and (d) a new run begins from part selection with no persisted upgrade state carried over (consistent with Sprint 1 having no coin-spend mechanic yet — see `truck-builder-and-upgrades.md`). This is a confirmed, deliberate exception to the project's no-fail-state bias and must be implemented as a real run-ending event, not a soft recovery.
- **AC7 (kid-appropriate tone, not a design spec):** The game-over transition itself must stay tonally consistent with the target audience — no scary/violent framing, harsh sound, or punishing language (e.g., a simple, friendly "let's build a new truck!" beat is acceptable framing); exact presentation (copy, timing, animation) is left to design/development, not specified here as a hard requirement.

## Open questions

The following is now resolved and kept here only for traceability:
- **0-hit-capacity behavior:** confirmed as a hard game over + restart-from-builder (see AC6). This is no longer open.

Remaining open question:
1. **Contact cooldown:** Should there be a brief invulnerability window after a bump (so standing next to the farmer doesn't drain multiple hits in rapid succession from repeated contact), or is single-contact-per-approach assumed? This matters more now that hits are a hard game-over resource rather than a soft-recovery one — draining several hits at once from a single unlucky contact would feel unfair. Needs a decision before implementation.

## Constraints

- Sprint 1 farmer has no chase-duration or give-up logic — do not build toward the Sprint 2 timer/tired behavior yet; keep the Sprint 1 implementation simple (appear -> move toward player -> bump -> drain hit) so it isn't rework-heavy when Sprint 2 adds the timer.
- Must still satisfy the project's overall "no violence framing" constraint even though the farmer is antagonistic and the hit-capacity system now ends the run at 0 — being bumped/losing a run is a setback/inconvenience for the player, not a depiction of harm.
- This is the only Sprint 1 system with a hard fail state; do not let this precedent leak into the gas, animal-boop, or wheel-obstacle systems, which remain no-fail-state by design (see their respective docs).
