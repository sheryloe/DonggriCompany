# Security Policy

## Supported Versions

Security fixes are primarily applied to the latest stable line.

| Version | Supported |
| --- | --- |
| 2.0.x | Yes |
| < 2.0.0 | No |

## Reporting a Vulnerability

Please do not open public GitHub issues for security vulnerabilities.

Use GitHub Private Vulnerability Reporting for this fork:

- https://github.com/sheryloe/DonggriCompany/security/advisories/new

If private reporting is unavailable in your environment, open a minimal issue without exploit details and ask a maintainer for a private channel.

## Response Expectations

- Initial triage target: within 72 hours
- Follow-up status updates: provided during investigation
- Fix publication: coordinated with impact and patch readiness

## Scope

Typical in-scope areas include:

- Auth/session boundaries
- OAuth token handling and encryption flows
- `/api/inbox` secret validation and webhook handling
- Command execution paths, worktree operations, and update flows
- Secrets handling in logs/configuration
