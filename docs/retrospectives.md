# Retrospectives

Dated entries, one per sprint close-out, recorded by the `project-manager` agent. Facilitated and recorded, not fabricated — content reflects actual human input and sprint findings.

## Sprint 1 (2026-07-06 – 2026-07-20) — retro recorded 2026-07-08

**Outcome:** 21/21 issues closed (13 original stories + 5 stability/fairness bugs found along the way + 2 tech-debt cleanups). Milestone closed 2026-07-08.

### What went well
- The acceptance-validation gate (test-engineer validating the running system against original acceptance criteria) worked as intended: it caught real Blocker-severity bugs (#21 — sustained-driving Rapier WASM panic crash, #18 — DRIVING session never restarting after a game-over/restart cycle) that had survived two separate code-reviewer passes and full unit test coverage. This confirms the gate earns its place in the pipeline as a distinct, non-redundant check.

### What didn't go well
- Bugs #21 and #18 were only caught late, at the acceptance-validation stage, despite two code-reviewer passes and full unit test coverage passing clean before that. Both were the kind of issue (a runtime crash under sustained play, a session-restart regression) that live interaction would likely have surfaced earlier and cheaper than a dedicated validation pass at the end.
- Issue #20 (empty gas tank / limp mode making the farmer unavoidable) originated from two ADRs — the gas/limp-mode design and the farmer-chase design — that were written separately and never cross-checked against each other for interacting mechanics. It was only caught at code review, well after both designs had already been implemented against.

### Changes to try next sprint
1. Introduce earlier live browser smoke testing during development, rather than deferring all live interaction to the end-of-sprint acceptance-validation pass. Goal: catch runtime/interaction bugs like #21 and #18 cheaper and sooner.
2. Add an explicit cross-ADR check step: when a story's design touches mechanics already covered by an existing ADR (or when two ADRs are written in the same sprint that plausibly interact), explicitly check them against each other for interaction effects before implementation, not just at code review.

## Sprint 2 (2026-07-08 – 2026-07-15) — retro recorded 2026-07-08

**Outcome:** 4/4 issues closed (#22, #23, #24, #25). Milestone closed 2026-07-08, ahead of the due date.

### What went well
- Both Sprint 1 process changes are confirmed working. On earlier live browser smoke testing: "yes as no big failure found at test/review stage, I believe it worked" (human). On the explicit cross-ADR check step: "looks like it worked" (human). This is evidenced by Sprint 2 shipping 4 stories — including the highest-risk session-lifecycle change yet, #25 (voluntary pause-to-builder) — with zero Blocker-severity defects reaching test/review stage, in contrast to Sprint 1, where #18 and #21 both survived multiple review passes undetected.

### What didn't go well
- During the #25 (pause-to-builder) implementation, the developer built and validated everything correctly but never actually committed/pushed the work. It was only caught when the next agent in the pipeline (test-engineer) reported that the production code was still sitting uncommitted.

### Changes to try next sprint
1. The developer agent should explicitly confirm via `git log`/`git status` that its commit landed before reporting completion — verify, don't just narrate. Note: test-engineer already started doing this self-check on its own after the #25 incident; this makes it an explicit convention for the developer step as well.
