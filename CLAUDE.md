# Monster Truck Farm — Project Intent

A simple 3D browser game built for the developer's son.

**Core loop:**
1. **Build** — player assembles a monster truck by picking a body, wheels, and an engine.
2. **Drive** — the truck spawns on a farm map with terrain variety (hills, mountains, a river) and farm structures (windmill, barn, farmhouse, fences, etc).
3. **Chase** — animals (cows, chickens, pigs, etc.) spawn randomly around the farm and wander/flee.
4. **Reward** — hitting an animal awards coins; payout scales with the animal's size and speed (bigger/faster = more coins).
5. **Upgrade** — coins buy better bodies/wheels/engines, looping back into the build step.
6. **Farmer chase (comic relief, not threat)** — an angry farmer occasionally appears and chases the truck for ~10 seconds before giving up tired. Farmer speed is capped at 1/3 of the truck's speed so it's never actually stressful for a young player — it's a chase-me gag, not a fail state.

**Target player:** a young child. Design bias: forgiving, colorful, no fail states, no violence framing (animals aren't harmed, they "boop" and scatter for coins), short session length, simple controls (likely just arrow keys / WASD, no complex combos).

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
