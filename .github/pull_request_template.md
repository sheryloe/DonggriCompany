## Summary

<!-- What does this PR do? Keep it brief (1-3 sentences). -->

## Related Issue

<!-- Link the issue this PR addresses. Use "Closes #123" to auto-close on merge. -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code improvement
- [ ] Documentation
- [ ] CI / build / tooling
- [ ] Other (describe below)

## Base Branch Policy

- `main` is the only long-lived branch.
- External contributors create a short-lived branch in a fork and target `main`.
- Keep the PR focused; unrelated release, deployment, or destructive operations need separate maintainer approval.

## Checklist

- [ ] Base branch is `main`
- [ ] Linked issue or context is included
- [ ] `pnpm run format:check` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run build` passes
- [ ] `pnpm run test:ci` passes (or reason provided if skipped)
- [ ] Docs/README were updated if behavior or setup changed
- [ ] Provider-continuity changes include drift, idempotency, fail-closed, and redaction coverage where applicable
- [ ] No OAuth token, API key, raw transcript, full patch, runtime DB, or terminal log is included

## Release or Operational Impact

<!-- State whether this changes release, deployment, migration, credentials, Docker lifecycle, or destructive-operation scope. -->
