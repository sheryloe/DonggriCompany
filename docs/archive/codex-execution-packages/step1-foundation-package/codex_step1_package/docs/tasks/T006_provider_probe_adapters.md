# T006 — Implement provider probe adapters

## Objective
Create probe adapters for Claude, Codex, Gemini, and Jules that detect install, config path, and login signal when possible.

## Acceptance criteria
- installed and missing CLIs both handled gracefully
- login status reported as unknown/logged_in/logged_out
