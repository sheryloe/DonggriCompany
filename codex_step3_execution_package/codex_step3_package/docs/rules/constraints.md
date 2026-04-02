# Step 3 Constraints

## Architectural invariants
1. Employee entities must remain provider-agnostic.
2. Runtime profiles must not be embedded directly in employee records except for optional preference/default references.
3. Session records are the source of truth for active runtime binding.
4. Account pool fatigue is visualized separately from employee heat.
5. Timeline events must be append-only.

## UX invariants
1. Employee-first UI: show character/employee before model.
2. Runtime badge is secondary metadata, never the primary title.
3. Inspector controls must not expose raw OAuth artifacts.
4. Office map may degrade to card-grid layout if assets are missing.
5. Step 3 must function fully without Telegram.

## Data rules
1. Deleting an employee with historical sessions should soft-delete or disable, not hard-delete.
2. Workspace deletion must fail if active employees are still placed there.
3. Event timeline records must be queryable by employee, session, and severity.
