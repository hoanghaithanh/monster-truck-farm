# Acceptance Report — Sprint 2, Coin-Spend / Upgrade-Purchase Flow (issue #22)

**Date:** 2026-07-08
**Scope:** `docs/architecture/0006-coin-spend-and-tier-unlock.md` (all 5 decision sections), plus the parts of `docs/requirements/truck-builder-and-upgrades.md` this ADR intentionally supersedes for Sprint 2 (AC6's Sprint-1-only "freely selectable" baseline is explicitly not in scope here — ADR 0006 §3/§5 is the current contract). Commit validated: `4ba7860` (developer, "Add coin-spend/upgrade-purchase flow", closes #22). HEAD at validation time: `4ba7860` plus this pass's own test additions (uncommitted at time of writing, see below).

**Status of this report: RECOMMENDATION ONLY.** I (test-engineer) am recommending, not approving. Final sign-off is the human's call — see the explicit ask at the end.

---

## Summary, up front

No defects found. Unit test coverage was extended (63 new tests: a new `src/core/stats/ownership.test.ts` for the pure predicates, and additional `GameStore.purchaseTier`/`restart` cases in `game-state.test.ts` covering all four axes and the full persistence round trip, not just `body`). All 246 tests pass. Three targeted regression spot-checks (breaking the sequential-unlock gate, the coin-reset-on-restart, and the `selectTier` ownership gate) each correctly failed the relevant tests, then passed again once reverted, confirming the suite has real teeth. An independent live Puppeteer pass (real Edge, real DOM/GameStore, not mocked) specifically re-verified the restart-persistence round trip end-to-end rather than trusting the developer's own smoke test — all checks passed.

## How this was validated

- **(a) Code inspection** — `src/core/stats/ownership.ts`, `src/core/stats/tiers.ts`, `src/core/stats/default-truck.ts`, `src/core/game-state.ts`, `src/ui/builder.ts` against ADR 0006 §1-§5.
- **(b) Automated tests** — `npx vitest run` → **246/246 passing** (18 files; 183 pre-existing + 63 new this pass). `npx vite build` succeeds (one pre-existing, non-blocking bundle-size warning, unrelated to this feature). New coverage:
  - `src/core/stats/ownership.test.ts` (46 tests, new file): `initialOwnership`, `tierCost` (including the out-of-range throw), `owned`, `selectable`, and `purchasable` — each of the latter three run via `describe.each` across all 4 axes (body/wheels/engine/gasTank), not just `body` as a stand-in, since each axis has its own cost table. Specifically covers the sequential-unlock rule (tier 2 blocked while tier 1 unowned, even with ample coins for tier 2 alone) and the "1 coin short" boundary.
  - `src/core/game-state.test.ts` — extended `GameStore.purchaseTier` describe block with an insufficient-funds-by-1-coin no-op-with-no-partial-deduction case, a skip-buy-blocked-despite-ample-coins case, and a `describe.each` over wheels/engine/gasTank repeating the successful-purchase / sequential-block / insufficient-funds / no-double-charge-on-rebuy checks (previously only asserted on `body`). Extended `GameStore.restart` with: a single round trip exercising **all four axes simultaneously** (mixed tier levels, asserting ownership, build, and coins together in one scenario rather than four separate single-axis tests); a case confirming a purchase can succeed **after** a restart (ownership isn't frozen at a pre-restart snapshot); and a fresh-session baseline case pinning `DEFAULT_TRUCK_BUILD`'s all-zero state plus `initialOwnership`, since restart-correctness is only meaningful relative to a correctly-specified starting point.
- **(c) Regression spot-checks** — 3 targeted breaks, each confirmed to fail the relevant new/existing tests and pass again once reverted (all via `git checkout --`, verified clean afterward):
  1. `purchasable()`'s sequential-unlock check hollowed out to only check coins → 21 tests failed in `ownership.test.ts` (the entire `describe('purchasable', ...)` block across axes).
  2. `GameStore.restart()`'s `this._coins = 0` removed → 3 tests failed, including the new all-four-axes round-trip test.
  3. `GameStore.selectTier()`'s ownership gate removed → 3 tests failed (the existing no-op/no-notify assertions).
- **(d) Live/running-system exercise** — `vite build && vite preview` serving the production build on `localhost:4174`, driven via `puppeteer-core` against the system's real Edge (`msedge.exe`), real keyboard/click events, real DOM/GameStore — not mocked. A temporary debug hook (`window.__qaGameStore`, 4-line addition to `src/main.ts`) was added for this pass only, to fund coins deterministically instead of depending on animal-boop RNG timing (the same approach and disclosed-and-reverted convention used in the Sprint 1 acceptance reports); reverted via `git checkout -- src/main.ts` before this report was written — confirmed via `git diff`/`git status` showing zero changes to `main.ts`, and a fresh `vite build` + `npx vitest run` re-run afterward (246/246 passing) to confirm the reverted tree is what's actually being signed off on. Script: scratch-only, not committed (`qa-restart-persistence.mjs`, session scratch directory), per this project's established convention.
- This was an **independent** pass, not a review of the developer's own smoke test: I wrote my own script and scenario sequence from the ADR rather than reusing or trusting the developer's `qa-purchase-flow.mjs` (which I read for reference but did not execute), per the task's explicit ask to independently re-verify restart-persistence given this project's history with restart/session-lifecycle bugs (#18 in Sprint 1).

---

## ADR 0006 §1-§5 — decision-by-decision

**§1 (Ownership wrapper: `owned`/`selectable`/`purchasable`, tier 0 pre-owned).**
- Status: **MET (code + tests + live).**
- Evidence: (b) `ownership.test.ts` covers all three predicates across all 4 axes, including tier 0 being both always-owned and never-purchasable. (d) Live: fresh session (`page2`, a brand-new browser tab, not a restart) confirmed `ownership` starts as `{body:[0], wheels:[0], engine:[0], gasTank:[0]}` exactly.

**§2 (cost per tier, on the tier row).**
- Status: **MET.**
- Evidence: (a) `tiers.ts` — Body 0/40/90, Wheels 0/50/120, Engine 0/60/140, Gas tank 0/40/90, matching the ADR's table exactly. (b) `ownership.test.ts`'s `tierCost` block asserts every row's cost against the real tier tables directly (not hardcoded expected numbers, so it can't silently drift from the source of truth). (d) Live: a 3-purchase sequence (body tier 1 = 40, wheels tier 1 = 50, wheels tier 2 = 120) deducted exactly 210 coins from a 500-coin balance, leaving 290 — confirmed via the live `GameStore.coins` read, not inferred.

**§3 (sequential unlock, buy-equips).**
- Status: **MET (code + tests + live).**
- Evidence: (b) Both `purchasable()`'s unit tests and `GameStore.purchaseTier`'s tests directly assert that buying tier 2 while tier 1 is unowned is blocked even with coins far in excess of tier 2's cost alone (`cost2 + 1000`), across all 4 axes. Regression spot-check #1 above confirms this isn't accidentally-passing coverage. (d) Live: a real click on a locked tier-1 button with 0 coins produced no coin deduction and no ownership change; the subsequent 3 real purchases (via `purchaseTier`) each auto-equipped the purchased tier in `build` in the same action, matching "buy-equips" exactly.

**§4 (unlocks persist across game-over; coins do not) — the task's specifically-called-out highest-risk item.**
- Status: **MET (code + tests + independent live verification).**
- Evidence: (b) `game-state.test.ts`'s new all-four-axes round-trip test purchases mixed tiers across every axis, adds leftover run coins on top, then asserts post-restart: full ownership preserved per axis, full equipped build preserved, coins exactly 0. A second new test confirms a purchase can succeed immediately after a restart (progression isn't frozen). Regression spot-check #2 (removing the coin reset) failed exactly these tests. (d) **Live, independently**: the full round trip — purchase 3 tiers across 2 axes real-UI-adjacent, confirm build, drive ~0.8s live with no crash, force game-over, click the real "Build a new truck!" button — produced: `screen: BUILDER`, `coins: 0`, `ownership.body: [0,1]`, `ownership.wheels: [0,1,2]`, `build: {body:1, wheels:2, ...}`, all exactly as the ADR specifies. The builder UI's own DOM re-rendered Body Tier 1's button with the equipped checkmark (`✅ Tier 1 — 4 hits`), not a lock icon — confirming the persistence isn't just a store-internals fact but is actually visible to the player after restart. A follow-up live purchase (body tier 2) succeeded post-restart, confirming ownership genuinely carries forward rather than being a stale snapshot.
- One methodology note, disclosed for transparency: my first run of this live script produced 2 false-positive failures from a bug in my own test script (I re-clicked "Tier 0" intending a no-op re-equip check, which is actually a real, intentional equip action that legitimately changed `build.body` to 0 — my assertion's expected value was wrong, not the product). Caught before this report was written; fixed to click the already-equipped Tier 1 button instead, re-ran, all checks passed. Documented here per this project's established convention of disclosing methodology corrections rather than silently editing them out.

**§5 (GameStore/builder integration — gated `selectTier`, `purchaseTier`, three-state builder UI, buy affordance, highlight-cursor keyboard model).**
- Status: **MET.**
- Evidence: (a) `game-state.ts` matches the ADR's pseudocode essentially verbatim. (b) `selectTier` gating covered extensively in the pre-existing (developer-updated) test suite plus regression spot-check #3. (d) Live: the builder DOM correctly rendered three visual states across the session (locked-with-cost initially, owned-not-equipped after buying a different tier, equipped after buying/selecting); Left/Right + Space keyboard flow was not separately re-exercised this pass (the developer's own smoke test already covers it per the task brief, and the click-based real-UI path exercises the same underlying `actOnTier`/`store.purchaseTier`/`store.selectTier` code paths) — flagged below as a minor scope note, not a gap I consider blocking.

---

## Review of the developer's pre-existing test edits

The task specifically asked me to verify the developer's edits to `game-state.test.ts` (which had to be updated since Sprint 1's tests assumed the now-intentionally-overturned free/ungated `selectTier` and tier-1-default build) actually test the **new** intended behavior, not just mechanically patch old assertions to stay green.

Verdict: **the edits are correct and substantive, not just mechanically green.** Specifically:
- The `buyUpTo` test helper explicitly funds coins and asserts `purchaseTier` succeeds at each step (`throw`s on unexpected failure) rather than silently no-op-ing — a test bug here (e.g. helper accidentally not gated) would be self-evident, not hidden.
- `selectTier`'s "no-op for a tier that is not owned" and "does not notify subscribers when selectTier is a gated no-op" tests are genuinely new assertions of the gate itself, not adapted Sprint-1 leftovers (Sprint 1 had no gate to test).
- `confirmBuild`'s tests correctly switched from directly calling `store.selectTier(axis, tier)` (which would now silently no-op for any non-zero tier) to `buyUpTo`, which is the only way to legitimately reach a non-default build post-ADR-0006 — this is the right fix, not a workaround.
- The restart tests explicitly assert ownership survives (a new ADR-0006-specific assertion) alongside the pre-existing coin-reset/build-preservation assertions, rather than only touching what was needed to pass.

I did not find any case where an old assertion was weakened or removed to "make it pass" without a corresponding correct new assertion in its place.

---

## Minor scope note (not a defect)

The developer's `qa-purchase-flow.mjs` smoke test includes a keyboard-navigation check (Left/Right cursor movement, Space acting on the highlighted tier); this pass's independent live verification exercised the click-based path instead (same underlying store calls, different input surface) and did not separately re-drive the keyboard path live. Given the keyboard input plumbing (`onKeyDown`'s `Space` case) is a thin, untested-in-isolation wrapper calling the exact same `actOnTier`/`store.purchaseTier`/`store.selectTier` functions already verified above, I assess this as low-risk and not worth a second live pass — noting it for completeness rather than treating it as an open gap.

---

## Summary table

| ADR 0006 item | Status |
|---|---|
| §1 Ownership wrapper / predicates | Met (code+tests+live) |
| §2 Cost table | Met (code+tests+live) |
| §3 Sequential unlock, buy-equips | Met (code+tests+live) |
| §4 Unlocks persist / coins reset (restart round trip) | **Met — independently live-verified this pass**, including a live UI (not just store-state) re-check |
| §5 GameStore/builder integration | Met (code+tests+live for click path; keyboard path not separately re-driven this pass, low-risk) |
| Sprint-1 test suite correctness | Reviewed — edits are substantive, not mechanically patched |

**No defects found this pass. No GitHub issues filed.**

---

## Recommendation, not approval

Based on the evidence above, the coin-spend/upgrade-purchase flow (issue #22, ADR 0006) is **soundly implemented at the code, unit-test, and live-verification level**, with no defects found. The specific concern the task flagged — restart-persistence being the trickiest state-management edge case here, given this project's history with issue #18 — was independently re-verified live, end-to-end, through the real UI (not just the store API), including confirming the persistence is actually visible to the player (the builder re-renders the purchased tier as equipped, not re-locked) rather than only a passing internal-state assertion.

**This is a recommendation only — I am not the approver.** I'd recommend this feature is ready to proceed to code review. Please review the evidence above — particularly the §4 live round trip and the regression spot-checks — before giving final sign-off.

**This is a recommendation only — I am not the approver.**
