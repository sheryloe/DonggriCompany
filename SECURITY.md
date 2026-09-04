# Security Policy

## Supported versions

Dongri-grigri is an unreleased Alpha source candidate. Security fixes are applied to the latest reviewed source on `main`; no installable, supported, or stable production line is claimed yet.

| Version                | Security fixes |
| ---------------------- | -------------- |
| reviewed `main` source candidate | Best effort     |
| tags and older snapshots         | No              |

## Reporting a vulnerability

Do not open a public issue with exploit details. Use [GitHub Private Vulnerability Reporting](https://github.com/sheryloe/DonggriCompany/security/advisories/new).

If private reporting is unavailable, open a minimal issue without technical details and request a private maintainer channel.

## Response targets

- Initial triage target: within 72 hours
- Follow-up: during active investigation
- Publication: coordinated with impact, patch readiness, and disclosure safety

These are response targets, not a service-level agreement.

## Scope

In-scope areas include authentication and sessions, OAuth/token handling, webhook secret validation, command execution boundaries, Control Plane mutation authorization, worktree operations, update flows, and secret exposure through logs or configuration.

The default Command Center dashboard endpoint is read-only and must expose only compact source-bound summaries—never secrets, raw configuration, transcripts, or mutation capability.

Provider-continuity checkpoints also exclude OAuth tokens, API keys, raw transcripts, full patches, and terminal logs. Unknown fields and credential-like values are rejected before persistence. Checkpoint rows are append-only, their payload digest is verified on read, and provider dispatch fails closed when the selected runner or account cannot be proven ready.
