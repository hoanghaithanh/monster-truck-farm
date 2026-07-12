# Monster Truck Farm — Project Intent

A simple 3D browser game built for the developer's son.

**Core loop:**
1. **Build** — player assembles a monster truck by picking a body, wheels, an engine, and a gas tank.
2. **Drive** — the truck spawns on a farm map with terrain variety (hills, mountains, a river) and farm structures (windmill, barn, farmhouse, fences, etc).
3. **Chase** — animals (cows, chickens, pigs, etc.) spawn randomly around the farm and wander/flee.
4. **Reward** — hitting an animal awards coins; payout scales with the animal's size and speed (bigger/faster = more coins).
5. **Upgrade** — coins buy better parts, each on its own axis: body = more hits survived from the farmer (base 3, +1/tier), wheels = bigger obstacles clearable (bush → rock → derelict car), engine = higher top speed, gas tank = more range before needing to stop and recover. Looping back into the build step.
6. **Gas** — driving continuously drains a gas meter; it auto-regenerates while the truck is stopped/idle. Running out limits the truck rather than ending the session.
7. **Farmer chase** — an angry farmer occasionally appears, chases the truck, and can bump it, draining one hit from the body's capacity. Farmer speed is capped at 1/3 of the truck's speed. Sprint 1 ships only this minimal bump behavior; the full ~10s-chase-then-"tired" giveup is Sprint 2.
8. **Game over** — if the farmer drains the body's hits to 0, it's a **hard game over**: the player restarts from the beginning (rebuild/reselect truck). This is a deliberate exception to the "forgiving" bias below — confirmed with the human on 2026-07-06 — because losing the truck and starting over is itself part of the challenge/fun for this player.

**Target player:** a young child. Design bias: forgiving, colorful, no violence framing (animals aren't harmed, they "boop" and scatter for coins), short session length, simple controls (keyboard only for v1 — arrow keys / WASD, no complex combos). The one deliberate exception to "forgiving" is the hard game-over described above.

**Tech stack:** Three.js + Vite web app.
- Runs in any browser, nothing to install for the player.
- Rapier or Cannon-es for physics/collision (truck vs. terrain, truck vs. animal).
- glTF models for truck parts, animals, and farm structures.
- Deployed as a static site (see devops-engineer's scaffold once Phase 2 runs).

**Out of scope for v1** (revisit later if there's appetite): multiplayer, save-game persistence beyond local storage, mobile touch controls, sound design beyond basic SFX.

---

# Project Orchestration Guide

This project uses a team of SDLC subagents in `.claude/agents/`. This file tells you (the main session) how to drive them. Read it before starting multi-step work.

## Your role as orchestrator

You coordinate the agents; you do not do their specialized work yourself. For any non-trivial feature or project, you run the pipeline below **one step at a time**.

### Human checkpoint rule (important)

**After each agent finishes, STOP. Do not automatically invoke the next agent.** Report back to the human with:
- what the agent produced (a 2-4 line summary + where the artifact lives),
- anything the agent flagged (open questions, risks, findings),
- which agent is next in the pipeline and what it will do.

Then wait for the human to say go. The human may want to review the artifact, answer an open question, adjust scope, or skip a step. Only proceed to the next agent once the human confirms. Never chain the whole pipeline in one uninterrupted run.

The one exception is an agent consulting a peer *within its own run* (e.g. the developer asking the architect a clarifying question) — that's the agent's own business and doesn't need a checkpoint. The checkpoint is between pipeline *stages*, not inside a single agent's execution.

## Agile: sprints and backlog

This project runs in sprints. Two artifacts drive planning:
- **`docs/backlog.md`** — the prioritized, not-yet-scheduled list of stories, owned by `project-manager`, populated by `requirements-analyst` as it writes requirements docs.
- **Sprint milestones** — a sprint is a GitHub milestone named `Sprint <N> (<start> – <end>)`, created and closed by `project-manager` (see that agent's file for the mechanics — it reuses the same `gh api` milestone calls as releases, just on a short, fixed cadence).

Sprint ceremonies map onto the agents like this:
- **Sprint planning:** `project-manager` proposes the top backlog items to pull in, human confirms scope, PM creates/updates the sprint milestone.
- **During the sprint:** each story pulled in runs through the default pipeline below.
- **Sprint review:** `test-engineer`'s acceptance validation step, run across the sprint's stories, doubles as the review/demo evidence.
- **Retrospective:** `project-manager` facilitates and records a short retro in `docs/retrospectives.md` at sprint close-out — don't skip this step.

Release-level milestones (multi-sprint themes/versions) can still exist alongside sprint milestones if the team wants both granularities — sprints track near-term delivery, release milestones track the larger arc.

## Default pipeline order

For a new story pulled into the current sprint (or any feature on an existing codebase):

1. **project-manager** — confirm the story is in the active sprint (or create/update the milestone this work belongs to).
2. **requirements-analyst** — write requirements + acceptance criteria, and add the story to `docs/backlog.md` if not already there. Surface open questions to the human.
3. **architect** — record the technical design (skip for genuinely small, well-understood changes).
4. **developer** — implement.
5. **test-engineer** — write/verify test coverage.
6. **code-reviewer** — review the diff.
7. **security-auditor** — only if the change touches auth, authorization, input handling, secrets, payments, or PII.
8. **test-engineer (acceptance validation)** — validate the running system against the original acceptance criteria and produce an acceptance report.
9. **tech-writer** — update docs (once the feature is stable).
10. **project-manager** — update milestone/sprint status; at sprint close-out, run the retro.

Not every step runs every time — a one-line fix may only need developer → code-reviewer. Use judgment and propose which steps to skip at the relevant checkpoint, but let the human decide.

## Greenfield (project from scratch)

Different ordering, because there's no codebase yet and some agents have nothing to do on day one:

- **Phase 0 (human):** init repo, `gh auth login`, copy `.claude/` in, confirm agents load with `/agents`, write project intent here in CLAUDE.md.
- **Phase 1:** project-manager (first milestone) → requirements-analyst (this is the critical step on a blank repo).
- **Phase 2:** architect (foundational decisions — stack, boundaries, data model) → devops-engineer (scaffold repo structure + CI + a hello-world deploy *early*, so everything later ships through a working pipeline).
- **Phase 3:** developer (one thin end-to-end slice, not the whole app) → test-engineer → code-reviewer → security-auditor (if the slice is sensitive).
- **Phase 4:** tech-writer (seed README once there's a running slice) → project-manager (progress check).
- **Then** iterate feature-by-feature using the default pipeline above.

Don't invoke the reviewer, security-auditor, or tech-writer in Phases 1-2 — they have no code to work on yet and will just burn tokens on empty context.

## Definition of Done

A feature is done when all applicable gates are met:
- [ ] Requirements + acceptance criteria written (`docs/requirements/`)
- [ ] Design recorded if non-trivial (`docs/architecture/`)
- [ ] Code implemented, matching existing conventions
- [ ] Tests written and passing (and confirmed to fail without the change)
- [ ] Code reviewed, no unresolved Blockers
- [ ] Security-audited if it touches auth / input / secrets / PII
- [ ] Validated against acceptance criteria, **and the human has given final sign-off** (the test-engineer recommends; the human approves)
- [ ] Docs updated
- [ ] Issues filed for any deferred work; milestone/sprint status current; backlog entry cleared or updated

## Model tiers (context for cost)

- Deep tier (`opus`/`high`): **architect**, **security-auditor** — expensive-to-reverse design and trust-boundary reasoning.
- Everything else runs `sonnet`. **requirements-analyst** runs `sonnet`/`high` — high effort for reasoning depth, but not the opus price. If requirements quality turns out to be a recurring pain point, promoting it back to `opus` is a one-line frontmatter change.

## Notes

- Reviewers and auditors are read-only toward code — they describe fixes; the developer applies them. Route findings accordingly.
- Milestones and sprints are owned solely by the project-manager. Other agents attach issues to existing milestones but never create or close them.
- The backlog (`docs/backlog.md`) is owned by the project-manager for prioritization; the requirements-analyst is the one that appends new stories to it.
- When an agent consults a peer, it must pass full context in the prompt — agents share no memory.
- **Issues an agent files on its own initiative** (a developer/code-reviewer/test-engineer filing a bug or follow-up mid-task, per `.claude/GITHUB_CONVENTIONS.md`) commonly ship without a milestone attached, since milestone ownership is deliberately left to the project-manager and nobody circles back. Periodically ask project-manager to sweep `gh issue list --search "no:milestone"` against the active sprint and attach/backfill as needed (this happened once already — issues #33/#35 shipped and one even closed before being attached).
- **Running multiple `requirements-analyst` passes in parallel** (e.g. several independent epics surfaced in one planning session, per the 2026-07-10 roadmap batch that produced #48-#55): have each pass write its own requirements doc and file its own GitHub issue(s), but tell it *not* to edit `docs/backlog.md` itself — instruct it to report back the exact row content instead. The orchestrator then adds all the rows in one pass after every parallel agent finishes. This avoids concurrent-edit conflicts/lost rows on a shared file that parallel agents can't coordinate over.
- **When a doc-level decision gets superseded** (an AC, an open question, a design call), don't delete the old text — strike it through (`~~...~~`) and add a dated resolution note inline, in both the requirements doc and any architecture doc it affects. This project has done this repeatedly and it's the expected convention, not a one-off (e.g. the mountain backdrop→landmark redesign, AC3→AC3a in `environment-dressing.md` + ADR 0012's dated addendum; the fence collidability→collapsible-on-impact resolution in `farm-layout-and-fields.md`). Keeps the doc a readable history, not just a current-state snapshot.
- **An architect's design pass can reveal a bundled issue is more separable than it looked at requirements time — recommend a split, and let project-manager execute it** (file the new issues, close the original as superseded, update the affected backlog rows), the same way #26 was split into #46/#47. This has now happened twice (#26→#46/#47; #52→#62/#63, split into "bigger truck + hitbox" vs. "per-wheel suspension" after ADR 0018 found the two halves technically decoupled, sharing only the four-corner sampler) — treat it as a standard move to propose whenever a design pass surfaces this, not a one-off.
- **A bug found by live playtest while its parent story's issue is still open doesn't need its own tracked GitHub issue** — fix it directly within that story's scope, same precedent as folding a code-reviewer's Major/Minor findings back into the same diff. Only file a *new* issue when the bug surfaces via playtesting *after* the parent issue has already closed (e.g. #58/#59/#60, filed against an already-closed #49). Contrast: the #63 left/right suspension sign-inversion bug was found and fixed while #63 was still open, and correctly never got its own issue number.
- **Never write a specific `issue #NNN` reference into code comments or test names unless that number is confirmed** — i.e. filed by the current agent itself, or explicitly given in its prompt. Mid-session on #63, a developer fixing a bug guessed/assumed a plausible-looking issue number in comments and test descriptions without checking; the number it picked turned out to already belong to a different, unrelated issue, silently mislabeling the code with a misleading cross-reference. Caught and corrected by the orchestrator directly (a text-only, low-risk fix — no need to spin up a developer agent for it, just re-run the affected tests to confirm nothing broke). If there's no confirmed issue number to cite, describe the bug in prose instead.

## Sourcing real art assets (learned 2026-07-09, sourced-truck-art work)

The `developer` subagent has no web-browsing tool, so it cannot fetch real CC0/CC-BY asset packs — left alone, it will fall back to procedurally-generating primitive placeholder geometry (boxes/cylinders) and disclose that as a stopgap. **The orchestrating main session has `WebSearch`/`WebFetch`/`Bash` and can do real asset sourcing directly** — this is the capability gap that made the original truck-art placeholder happen, and closing it (searching poly.pizza/Kenney.nl/similar CC0-friendly sources, downloading, license-checking, inspecting glTF node/material structure, picking a tier progression) is orchestrator work, not something to hand to `developer`.

Workflow that worked well and should repeat for future art sourcing (farmer model #29 is the next one left; chicken #28, structures/river/mountain #46/#47 are done as of 2026-07-10):
1. Orchestrator searches/downloads/inspects candidates (check the actual license text on the source page, not just the site's general reputation; note CC0 vs. CC-BY — CC-BY needs an attribution line in `CREDITS.md` at repo root).
2. Render candidates locally and actually look at them before picking — don't commit to an asset sight-unseen. The recipe that's worked reliably across several sourcing passes: pull the model's direct `.glb` URL out of the source page's HTML (e.g. poly.pizza embeds it as `static.poly.pizza/<id>.glb`), then load it with the `<model-viewer>` web component (via its CDN `<script>` tag) in a tiny local HTML file, screenshot it with `puppeteer-core` pointed at the system's already-installed Chrome (`executablePath`, no bundled-Chromium download needed). **Serve that HTML over a local static server (e.g. `npx http-server`), not `file://`** — loading a `.glb` from a `file://` origin hits a hard CORS wall in Chrome that a bundled-download workaround won't fix.
3. Confirm the final selection with the human before handing off (this is a creative/product call, not a pure engineering one).
4. Hand the developer a staged folder of exactly-named source files + a written record of node names, material names, and known structural quirks (e.g. "these Quaternius bodies ship their own small built-in wheel nodes — exclude them" or "these tire materials are `mat22`/`mat23`, rim vs. rubber") — this saves the developer from re-deriving glTF structure from scratch and avoids naive mistakes (e.g. blanket-repainting a textured material and destroying baked detail).
5. **Always take live screenshots and actually look at them** — both the developer's own verification pass and the orchestrator's before reporting to the human. This has caught real defects unit tests/code review alone missed: a floating decal, an invisible decal, a muddy cosmetic tint, hollow-looking wheels, an invisible river (backface culling — fixed with `THREE.DoubleSide`), and near-black mountain materials (sourced `metallicFactor` nonzero with no scene `envMap` — fixed by force-zeroing `metalness` post-load). Some of these were caught by the orchestrator's independent pass *after* the implementing agent's own screenshot pass had already looked and missed it — a second, independent look matters, not just "someone looked."
6. **If a sourced texture is oversized for the budget** (ADR 0010 §3's ~1.5MB gzipped driving-scene ceiling — e.g. a 2048×2048 baked texture ate ~65% of it alone on one building), downscale it rather than rejecting the whole model. `sharp` fails to load its native binary on this Windows dev environment (`ERR_DLOPEN_FAILED`, even after `npm rebuild`/approving install scripts) — use `jimp` (pure JS, no native deps) to decode/resize/re-encode the image, and `@gltf-transform/core`'s `NodeIO` to read the `.glb`, swap the texture bytes via `texture.setImage()`, and write it back out. Document the before/after size and "no visible quality loss at driving-scene distance" in `CREDITS.md` under a "Modified from the original" note (see the farmhouse entry for the template).

## QA/testing gotchas (learned 2026-07-11, terrain/hills + truck-scale/suspension work)

- **A `world.step()`-based teleport helper used to quickly reposition the truck for a screenshot/telemetry QA pass can crash Rapier's WASM state if called mid-session** (hit independently during both the #49 and #63 acceptance passes). To reach specific coordinates quickly without a multi-minute real drive, prefer real keyboard-driven bang-bang steering, or a debug hook that only *reads* state (position/telemetry) rather than one that force-writes physics state via `world.step()`.
- **Debug/QA hooks added to `main.ts`/`scene.ts` for a live pass (e.g. `window.__qa` telemetry, teleport helpers) must always be fully reverted before the agent finishes** — verify with `git diff` showing no diff on the touched file, plus a clean re-run of tests/typecheck/build afterward. Every acceptance pass this session followed this discipline correctly; keep it standard practice, never commit a debug hook.
- **A per-corner/per-wheel effect can stay silently broken for a long time if it's masked by a whole-body-average effect it's layered under** — the #63 left/right sign-inversion bug (obstacle-climb's `right` vector was inverted) existed from #49 onward but was invisible through implementation, code review, *and* #62's acceptance validation, because the only prior consumer of left/right was whole-body `roll`, clamped to 0 in every shipped config. It only became observable once #63 exposed per-wheel data directly, and even then needed a human driving it live to actually notice (unit tests using the module's own internal sign convention for both the obstacle placement and the assertion stayed self-consistent and passed throughout). When reviewing/testing math that decomposes a combined effect into per-component residuals, pin at least one test against an *external*, independently-documented ground truth (e.g. another module's own authoritative convention) rather than only checking internal self-consistency — see `obstacle-climb.test.ts`'s sign-inversion regression test for the pattern.
