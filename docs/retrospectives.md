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

## Sprint 4 (2026-07-15 – 2026-07-22) — retro recorded 2026-07-10

**Outcome:** 8/8 issues closed (#42, #28, #46, #47, #45, #26 superseded/closed by the #46/#47 split, #29, and #29's own follow-up #57). Milestone closed 2026-07-10, ahead of its 2026-07-21 due date. Both stretch items (#47, #29) landed alongside the four firm commitments.

### What went well
- The parallel-requirements-analyst pattern (multiple independent `requirements-analyst` passes writing their own requirements doc + filing their own issue(s), each told not to touch `docs/backlog.md` directly so the orchestrator merges rows in one pass afterward) was used for the first time at scale for the post-Sprint-4 roadmap batch (#48-#55, 2026-07-10) and worked cleanly — no lost or conflicting backlog rows despite several parallel passes writing concurrently. Worth keeping as the standard approach whenever a planning session surfaces multiple independent epics at once.
- Live-screenshot/browser verification kept earning its place this sprint: the mountain's near-black metalness defect on #47 (a sourced `metallicFactor` interacting badly with the scene having no `envMap`) was only visible by actually looking at a render, not by any unit test, and was caught and fixed before ship.
- The mid-sprint scope pivot on #47 (mountains redesigned from a non-collidable backdrop ring to a single large, collidable, reachable landmark) was made cleanly during implementation with an explicit human decision and a dated addendum in ADR 0012 rather than either silently absorbing the change or blocking the sprint on a re-plan — consistent with this project's "strikethrough + dated resolution note, don't delete" convention for superseded decisions.
- #29 (farmer model, the sprint's most involved deliverable — first skeletal-animation/AnimationMixer use in this codebase) still shipped inside the sprint window despite three real defects surfacing after implementation, because each was caught and routed through the pipeline rather than slipping to a future sprint: code review caught a `dispose()` leak, acceptance validation caught a scale bug, and a human live-driving pass caught a facing-direction bug — all three fixed and closed within the same sprint.

### What didn't go well
- Three separate real bugs were caught downstream of implementation on #29 alone, at three different pipeline stages: a `dispose()` resource leak (code review), a scale bug severe enough to render the model at ~1/200th size — effectively invisible in-scene — despite 496 unit tests passing clean (acceptance validation), and a facing-direction bug where the model didn't turn to face its movement direction (only caught when the human drove it live themselves). The scale bug in particular shows the current unit-test suite has a structural blind spot for this codebase: `SkinnedMesh`-vs-`Box3.setFromObject` measurement bugs are invisible to any test that doesn't actually render and inspect the scene, so 496 passing tests provided no real signal on whether the feature was visually present at all.
- More notably, the facing-direction bug survived *two independent live-verification passes* before the human caught it: the implementing agent's own screenshot/live-driving check, and a separate acceptance-validation live-driving session (per the acceptance report's own account of scripted, telemetry-logged driving sessions) — plus this project's stated convention of the orchestrator doing its own independent look on top of an implementing agent's pass. All of that still missed a defect that was immediately obvious to a human actually playing the game. This suggests the current live-verification passes (screenshot-based, or scripted/telemetry-driven bang-bang driving controllers per the #42 acceptance report's own description of its steering rig) are good at confirming a model renders, is positioned correctly, and doesn't crash, but are not yet a reliable substitute for a human directly steering and watching how a moving/animated character orients itself over time — the automated driving scripts in use aren't yet exercising the same "does this look right while actually playing" judgment a human applies by feel.
- This continues a pattern first named in the Sprint 1 retro ("bugs only caught late... live interaction would likely have surfaced earlier and cheaper") — the pipeline still doesn't have a stage between implementation and human sign-off that reliably catches motion/orientation-quality defects the way a human playing casually does.

### Changes to try next sprint
1. For any feature involving orientation/heading (a character or object that should visibly turn to face a direction of travel or target), add an explicit acceptance-criterion checklist item for "does it turn correctly while moving," and have the live-verification pass specifically drive an S-curve or multi-direction path rather than a straight/simple approach — the existing scripted drivers (per the #42 and #29 acceptance reports) have tended toward direct, single-heading approaches to a target, which wouldn't surface a facing bug that only shows up while turning.
2. Continue treating "does this file/feature have a live-rendered look, not just a passing test suite" as the standing check it already is (per the Sprint 3 retro's file-coverage lesson) — but explicitly do not treat a clean live-verification pass as equivalent to human sign-off for anything involving movement/animation quality; keep those in the loop for motion-heavy features specifically, not just as a final rubber stamp.
3. Keep using the parallel-requirements-analyst pattern (backlog-row-report-back-to-orchestrator, not direct edits) whenever a planning session produces multiple independent epics in one pass — it worked cleanly this sprint and should stay the default rather than being re-derived each time.
