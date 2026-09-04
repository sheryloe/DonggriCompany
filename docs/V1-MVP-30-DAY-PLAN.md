# Dongri-grigri V1 MVP — 30-Day Delivery and Commit Plan

## Operating rules

- One focused, reviewable commit per completed daily outcome; combine or defer days when the outcome is not green.
- No empty commits, backdating, artificial file churn, or commits created only to increase activity counts.
- Every commit must have a scoped diff, proportional tests, `git diff --check`, and a secret-pattern scan.
- Schema, security, runtime, Git mutation, release, and external-provider effects retain their explicit approval gates.
- Commit messages use `type(scope): outcome`; examples below are proposals, not pre-approved commits.
- `main` remains the only long-lived branch. This 30-day lane stays on `codex/provider-continuity-live-map-v1` until the reviewed PR is ready.

## Definition of done

The 30-day lane is complete when the mock-provider Codex→Claude→Codex journey works from a clean Windows clone, checkpoint drift fails closed, the character map reflects backend run events, all public checks pass, and an installable Alpha artifact plus demo evidence can be reviewed.

## Week 1 — Truth and integrity foundation

| Day | Outcome                                               | Proposed commit                                          | Required verification                        |
| --- | ----------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| 01  | Correct README claims and publish the 30-day contract | `docs(mvp): define truthful provider continuity scope`   | public readiness, link check, diff check     |
| 02  | Freeze continuity checkpoint Zod/TypeScript contract  | `feat(continuity): define checkpoint contract`           | schema unit tests, TypeScript                |
| 03  | Add additive SQLite checkpoint/run-event schema       | `feat(db): add continuity checkpoint tables`             | migration fresh/existing DB tests            |
| 04  | Implement canonical project and Git-root resolver     | `feat(continuity): resolve canonical workspace identity` | wrong-root/path traversal fixtures           |
| 05  | Collect branch, HEAD, tracked and untracked manifests | `feat(continuity): capture git workspace state`          | clean/dirty/untracked fixtures               |
| 06  | Compute deterministic workspace digest                | `feat(continuity): bind workspace digest`                | ordering, encoding, symlink/reparse fixtures |
| 07  | Create/read checkpoint service with idempotency       | `feat(continuity): persist restart-safe checkpoints`     | restart and duplicate replay tests           |

Week 1 gate: checkpoint survives restart; wrong project or changed digest is rejected; data-destructive commands are never called.

## Week 2 — Real provider transfer

| Day | Outcome                                             | Proposed commit                                      | Required verification                         |
| --- | --------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| 08  | Add pause/checkpoint mutation preview               | `feat(continuity): preview provider transfer`        | mutation auth and zero-effect rejection tests |
| 09  | Add target-provider validation                      | `feat(continuity): validate transfer target`         | provider/account mismatch fixtures            |
| 10  | Add explicit transfer acceptance                    | `feat(continuity): accept handoff idempotently`      | duplicate/stale approval tests                |
| 11  | Add resume from accepted checkpoint                 | `feat(continuity): resume accepted handoff`          | restart/resume and sequence tests             |
| 12  | Implement provider readiness adapter                | `feat(providers): expose runner readiness`           | installed/auth/degraded fixtures              |
| 13  | Fail closed when selected provider is unavailable   | `fix(dispatch): prevent silent provider fallback`    | wrong-provider execution count `0`            |
| 14  | Surface auth-required and observed-exhausted states | `feat(providers): model recoverable provider blocks` | redaction and error classification tests      |

Week 2 gate: deterministic Codex→Claude `20/20` and Claude→Codex `20/20` mock transfers; invalid fallback `0`.

## Week 3 — Live visual command center

| Day | Outcome                                                      | Proposed commit                                         | Required verification                     |
| --- | ------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------- |
| 15  | Define sequenced continuity WebSocket events                 | `feat(realtime): define run event protocol`             | ordering and schema tests                 |
| 16  | Add snapshot/reconnect synchronization                       | `feat(realtime): resync continuity snapshots`           | disconnect/reconnect fixtures             |
| 17  | Add heartbeat and stale classification                       | `feat(realtime): expose run heartbeat health`           | clock-bound threshold tests               |
| 18  | Replace frontend phase heuristic with backend phase          | `fix(command-center): trust authoritative run phases`   | UI/backend state equality tests           |
| 19  | Bind character movement to run events                        | `feat(command-center): animate verified phase movement` | reduced-motion and event tests            |
| 20  | Add recent terminal tail ring buffer                         | `feat(command-center): show bounded live output`        | truncation, redaction, memory-bound tests |
| 21  | Add blocker, approval, failure, and terminal result stations | `feat(command-center): visualize intervention states`   | keyboard and state matrix tests           |

Week 3 gate: event loss, duplicate, out-of-order, reconnect, process-death fixtures pass; displayed phase mismatch `0`.

## Week 4 — Portable OSS Alpha

| Day | Outcome                                                        | Proposed commit                                        | Required verification                            |
| --- | -------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| 22  | Build OAuth-free mock provider                                 | `feat(demo): add offline provider fixture`             | no-network and deterministic replay tests        |
| 23  | Add disposable demo repository and scripted journey            | `feat(demo): add provider transfer walkthrough`        | clean-run reproducibility                        |
| 24  | Remove private absolute-path assumptions                       | `fix(portability): make workspace discovery portable`  | non-G-drive Windows fixtures                     |
| 25  | Add one-command Windows setup and diagnostics                  | `feat(setup): add Windows MVP bootstrap`               | clean VM or clean-user-profile rehearsal         |
| 26  | Complete EN/KO/ZH docs, architecture, privacy, troubleshooting | `docs(mvp): complete public operator guides`           | public readiness and link validation             |
| 27  | Add roadmap, issue/PR templates, and contributor adapter guide | `docs(contributing): open continuity extension points` | template and example validation                  |
| 28  | Browser desktop/mobile/accessibility evidence                  | `test(ui): certify continuity command center journey`  | keyboard, contrast, reduced motion, 390px/1280px |
| 29  | Clean-clone full verification and installable Alpha package    | `build(release): prepare V1 MVP alpha candidate`       | web/API/OpenAPI/build/security/demo              |
| 30  | Freeze release notes and exact candidate manifest              | `docs(release): freeze V1 MVP alpha evidence`          | clean tree, artifact hashes, claim audit         |

Week 4 gate: a new Windows user follows only public docs and completes the mock Codex→Claude→Codex journey within 10 minutes.

## Daily commit checklist

1. Confirm the active task and allowed paths in the SDD.
2. Read `git status` and preserve unrelated changes.
3. Implement one bounded outcome.
4. Run focused tests, then the required wider gate for that day.
5. Run `git diff --check` and scan the staged candidate for secrets.
6. Record evidence and handoff.
7. Present the exact changed-path manifest and test result for commit approval.
8. Commit only after approval; push and PR remain separate approvals.

## Release ladder after Day 30

- The Day-30 artifact is an **Alpha candidate**, not automatically `v1.0.0` Stable.
- Beta requires at least five independent external users and installation success `>=90%` with P0/P1 `0`.
- Stable requires at least 50 external handoffs, success `>=95%`, fail-closed scenarios `100%`, data loss `0`, and documentation/runtime mismatch `0`.
