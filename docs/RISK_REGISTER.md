# RISK_REGISTER.md

| ID | Date | Risk | Impact | Likelihood | Response | Status |
|---|---|---|---|---|---|---|
| R-001 | 2026-05-06 | Legacy D drive paths may remain in docs, scripts, config, generated files, or tests. | High | Medium | Search before changes and convert active references to Dev Drive paths. | Open |
| R-002 | 2026-05-06 | Sensitive files may be read or printed during broad scans. | High | Low | Exclude real `.env` and secret/token/credential/key/password files from reads and output. | Active |
| R-003 | 2026-05-06 | Runtime/generated folders may be mistaken for source. | Medium | Medium | Exclude heavy/generated folders in `.codexignore` and avoid committing runtime outputs. | Active |
| R-004 | 2026-05-06 | Git history or remote state may be changed accidentally. | High | Low | Do not run reset/rebase/stash/commit/push/remote changes without explicit request. | Active |
