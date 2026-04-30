# Naver OAuth Module

## Purpose

Provide a project-level Naver OAuth setup contract with canonical secret slots and callback metadata.

## Canonical Inputs

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `NAVER_CALLBACK_URL`
- `callback_path`
- `account_pool`
- `reauthentication_supported`

## Apply Rules

- Generate only Donggri module metadata under `.donggri/modules`.
- Never write raw OAuth secrets or user profile payloads.
- Treat provider account details as runtime state, not module state.

## Verification

- Confirm Naver developer callback URL matches the project runtime.
- Confirm reauthentication is an explicit provider option, not a default login side effect.
