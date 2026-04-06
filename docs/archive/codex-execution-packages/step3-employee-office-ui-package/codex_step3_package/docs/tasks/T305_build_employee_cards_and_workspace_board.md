# T305 Build Employee Cards and Workspace Board

## Goal
Render employees inside office zones with status-rich cards.

## Outputs
- `src/office/components/WorkspaceBoard.tsx`
- `src/office/components/WorkspaceZone.tsx`
- `src/office/components/EmployeeCard.tsx`

## Requirements
- Group employees by workspaceId.
- Card shows avatar, name, roleLabel, runtime badge, presence, progress, heat.
- Selected employee state is supported.

## Acceptance
- Employee cards render correctly per workspace.
- Selected card drives inspector context.
