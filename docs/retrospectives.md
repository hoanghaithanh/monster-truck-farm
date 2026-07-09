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

## Sprint 3 (2026-07-08 – 2026-07-15) — retro recorded 2026-07-09

**Outcome:** 15/15 issues closed (#27, #30-#41, #43-#44). Milestone closed 2026-07-09, a few days ahead of the 2026-07-14 due date, by deliberate human choice. 3 stories originally in scope (#26 environment dressing, #28 chicken model, #29 farmer model) plus new story #42 (obstacle climbing) were rolled forward into Sprint 4 earlier the same day rather than force-closed here.

### What went well
- The core deliverable — replacing procedurally-generated placeholder truck art with a real sourced CC0/CC-BY pack (#33, #27) — shipped and held up under live-browser scrutiny across two follow-up defect passes (#38 wheel-socket misalignment, #35 muddy body-color tint), both caught by actually looking at rendered screenshots rather than by unit tests or code review alone, consistent with the CLAUDE.md lesson already logged from that work.
- Wheel roll/steer motion (#40) and the #38 socket-alignment fix both shipped clean, each backed by dedicated regression test coverage (truck-sockets.test.ts) added in the same pass rather than deferred.
- Three issues (#27, #30, #37) closed on inspection as already-satisfied or made obsolete by other work, rather than costing a wasted implementation pass — the team correctly recognized when scope had already been covered elsewhere (e.g. #37's target function no longer existed after #39/#41's cleanup) instead of mechanically completing them as originally scoped.

### What didn't go well
- Body-color and body-design cosmetics (#30's original scope) were fully implemented and shipped, then removed entirely post-ship at the human's direct request after playtest feedback (#39, #41) — real implementation and review effort was spent on cosmetic work the player ended up not wanting, discovered only after it was live rather than during requirements or design.
- Code review surfaced a cluster of real, pre-existing gaps only once it looked closely at this sprint's touched files: #34 (preview rig needlessly rebuilding on pure keyboard navigation), #36 (truck-sockets.ts had zero test coverage despite being the site of two shipped visual regressions, #38 and an earlier one), #43 (a dead field left behind after #41's decal removal), and #37 mentioned above. None of these were caught by the original implementation or its own first review pass — they were only found once a later reviewer pass went back over the same code with the benefit of hindsight from the visual-defect fixes.

### Changes to try next sprint
1. For cosmetic/product-feel changes with no hard functional requirement (paint color, decals, and similar "would this look nice" work), get a human playtest check-in *before* full implementation + review + test investment, not just at final acceptance sign-off — Sprint 3 spent a full pipeline pass on body-color/body-design before learning the human didn't want it.
2. When a fix touches a shared file with a known history of visual regressions (truck-sockets.ts had two: the original and #38), treat "does this file have test coverage at all" as a standing review checklist item rather than something that surfaces later as its own separate tech-debt issue (#36) — it should be caught the first time that file is touched under review, not the second or third.
