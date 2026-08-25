# Security Policy

## Supported versions

Dongri-grigri is currently a public Alpha. Security fixes are applied to the latest `1.0.0-alpha.x` source on `main`; no stable production line is claimed yet.

| Version                | Security fixes |
| ---------------------- | -------------- |
| latest `1.0.0-alpha.x` | Yes            |
| older snapshots        | No             |

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
