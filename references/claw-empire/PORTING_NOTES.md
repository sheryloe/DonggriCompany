# Claw Empire Reference Porting Notes

## Adopted (Step-6)
- UI density and hierarchy pattern: left settings / center board / right log+command.
- Realtime hub pattern: client event stream subscription + server-side batched broadcast.
- Compact panel rhythm for monitoring cards and command thread cards.

## Rejected (Step-6)
- Full app-shell replacement and task/workflow domain migration.
- Decorative HUD-first overlays that reduce center board visibility.
- Runtime replacement of current sprite sheet language.

## Asset Policy
- Allowed by default: `CC0`, `CC-BY-4.0`.
- Conditional: `CC-BY-SA-4.0` only when no equivalent alternative exists.
- Excluded: non-commercial (`NC`) licenses.
- Every imported asset requires source/license/author in manifest and `THIRD_PARTY_ASSETS.md`.
