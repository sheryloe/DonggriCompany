# Google OAuth Module

## Purpose

Provide a reusable project-level Google OAuth setup contract without storing raw secrets in Donggri module bindings.

## Canonical Inputs

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `callback_path`
- `account_pool`
- `scopes`

## Apply Rules

- Generate only Donggri module metadata under `.donggri/modules`.
- Never write client secrets or tokens to generated files.
- Reuse the host project's existing auth/session storage.

## Verification

- Confirm callback URL matches the runtime base URL.
- Confirm secret readiness through status keys only.
- Confirm OAuth tokens remain in the existing secure credential store.
