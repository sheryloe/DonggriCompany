# GIT_WORKFLOW.md

## Baseline
- Project root: `<PROJECT_ROOT>`
- Local bare Git server root: `<LOCAL_GIT_SERVER_ROOT>`
- External remotes such as GitHub/GitLab/Bitbucket are not rewritten by default.

## Status Check

```powershell
Get-Location
git status --short
git branch --show-current
git remote -v
```

## Pull Rule
- Treat `git pull --ff-only` as a candidate only when the worktree is clean.
- Do not run pull automatically during inventory or documentation work.
- If ff-only pull fails because of divergence, conflict, or non-fast-forward state, stop and report.

## Remote Rule
- Local file path remotes should point to `<LOCAL_GIT_SERVER_ROOT>` when used.
- D drive local remotes are legacy and should be reported as preview candidates only.
- Do not run `git remote set-url` without explicit approval.

## Forbidden Without Explicit Request
- commit
- push
- reset
- rebase
- force push
- branch deletion
- stash