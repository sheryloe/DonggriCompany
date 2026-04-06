# Step 3 ViewModel Contracts

## OfficeBootstrapVM
- workspaces: WorkspaceVM[]
- employees: EmployeeCardVM[]
- activeSessions: SessionCardVM[]
- accountPools: AccountPoolVM[]
- runtimeProfiles: RuntimeProfileVM[]
- providerStatuses: ProviderStatusVM[]
- timeline: TimelineEventVM[]

## EmployeeCardVM
- id
- name
- avatarType
- avatarAsset
- roleLabel
- workspaceId
- presence
- activeSessionId?
- runtimeBadge?
- progressPct?
- heatLevel?
- speechBubble?

## SessionCardVM
- id
- employeeId
- status
- runtimeProfileId
- runtimeProvider
- startedAt
- progressPct
- currentTaskTitle
- heatLevel
- blockedReason?

## TimelineEventVM
- id
- at
- type
- employeeId?
- sessionId?
- message
