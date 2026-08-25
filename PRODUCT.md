# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: the local workspace owner operating multiple repositories, Codex tasks, approvals, evidence, and runtime state from one Windows workstation.
- Secondary: open-source contributors and competition evaluators who need to understand the product and reproduce its bounded local demo without private Donggri infrastructure.

## Product Purpose

Dongri-grigri turns the root Donggri Control Plane into a truthful daily operations interface. It should let the operator identify what needs a decision, what is running, what is blocked, which project changed, and what safe action is available next without reading raw control documents first.

Success means the operator can move from current state to a justified next action quickly while preserving approval boundaries, evidence, and recovery authority.

## Positioning

Dongri-grigri is not a generic agent chat dashboard. Its distinctive mechanism is a projection of real source-controlled operating state into decision-ready views where provenance, degradation, preview, approval, execution, evidence, and historical status remain visibly different.

## Operating Context

- Windows-first local operation across the `G:`, `E:`, and `F:` storage contract.
- Root Control Plane documents remain the source of truth; the app is a projection and runtime interface.
- Work is organized around projects, active specs, tasks, runs, approvals, evidence, handoffs, six master departments, disposable personas, Skills, and scoped Memory.
- The primary operator commonly uses a wide desktop display but must also inspect state on a narrow mobile viewport.

## Capabilities and Constraints

- Korean-first product copy with optional supported language behavior inherited from the existing application.
- Real Control Plane and runtime records only; no fabricated agent dialogue, metrics, or operational events.
- Six persistent master agents and one OPS project-scope model; legacy staff hierarchy is compatibility data only.
- Read-only, preview, approval-required, executable, unavailable, degraded, and historical states must remain distinguishable.
- Existing product capabilities and data contracts must be preserved during the redesign.
- The incumbent interface remains available as the `old` experience while the replacement dashboard becomes the default entry.
- Today, Projects, Tasks, Agents & Skills, and System are native Command Center views; primary navigation must not redirect into the compatibility interface.
- The default Command Center is a lightweight Codex supervision and command surface: reuse existing task and agent streams, refresh the compact Control Plane summary every 15 seconds, and avoid process scanners or a second monitoring engine.
- Commands select one of the six canonical department roles, distinguish registration from registration-and-run, and return the operator to the real task detail for run/stop/resume, logs, and result readback.
- Workflow decisions and agent-originated decision requests appear in one decision inbox during bootstrap, live synchronization, and manual refresh.
- Public clones may provide an absolute `DONGGRI_CONTROL_ROOT`; missing private workspace state degrades the read-only projection instead of blocking install, tests, or build.
- View and detail state is URL-addressable and participates in browser history.
- Git commit, push, deployment, Docker, secrets, destructive DB operations, and long-duration certification remain separately controlled operations.

## Brand Commitments

- Visible product name: `Dongri-grigri`.
- Voice: direct, calm, operational, Korean-first, and explicit about uncertainty or blocked authority.
- Never expose the legacy product name as normal interface branding.
- Safety must feel like part of the product rather than legal copy added after an action.

## Evidence on Hand

- Root registry, active specs, approvals, evidence, handoffs, release identity, and candidate freeze records.
- Real project, task, agent, Skill, Memory, runtime, and decision-inbox APIs in the existing application.
- Frozen-candidate review and 1,000-point baseline under `G:\Donggri_DevDrive\storage\codex-control\reports\DonggriCompany`.
- Existing browser and automated test coverage for the app shell, Control Plane, Task Board, Skills, and manuals.
- No public customer claims, testimonials, commercial benchmarks, or certification claim may be invented.

## Product Principles

1. Lead with the next justified decision, not the volume of available data.
2. Show operational truth and provenance before decoration.
3. Keep irreversible or external effects behind explicit preview and approval.
4. Let every important entity and view survive refresh, back navigation, and deep linking.
5. Preserve recovery authority and historical context without letting legacy structure dominate current work.

## Accessibility & Inclusion

- Keyboard-complete operation with contained shortcuts and visible focus.
- Touch targets and navigation that work at `390x844` without horizontal overflow.
- WCAG AA contrast in light and dark themes, 200% reflow, semantic status announcements, and reduced-motion behavior.
- Broken Korean text is a release blocker.
- Mobile navigation moves focus into the menu, traps focus while open, closes on Escape, and returns focus to its trigger.
