# Claw Reset Log

- Reset date: 2026-04-06 (Asia/Seoul)
- Pre-reset commit: `ea53f73480bbe75f230666f78ab6ec367210195d`
- Backup tag: `backup/pre-claw-reset-20260406`
- Reset branch: `codex/claw-office-reset`
- Reset strategy: replace previous Donggri monorepo with Claw-Empire baseline, then keep runtime compatibility only for:
  - route: `/dashboard`
  - port: `7777`
  - container name: `donggricompany`
