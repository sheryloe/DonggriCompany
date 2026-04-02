# Step 2 Constraints

## Invariants
1. Employees must not permanently hard-bind to one provider runtime.
2. Routing decisions are made per task/session, not per employee identity.
3. Fatigue belongs to account pools, not employees.
4. Raw provider probe output must be preserved before normalization.
5. Normalized fatigue must include a confidence label: `official`, `derived`, or `manual`.
6. Router decisions must be explainable and stored with reason text.
7. Probe adapters must never write or mutate OAuth credentials.
8. Step 2 must not introduce Telegram flows or office-scene rendering.
9. If provider status inspection fails, router must degrade gracefully using last known data.
10. Jules is not part of Step 2 local probe implementation.

## Routing policy defaults
- prefer explicit task-type matches over generic provider preferences
- avoid account pools above configured fatigue threshold
- use fallback targets when primary target is degraded or unavailable
- if no valid runtime exists, return structured `NO_ROUTE`

## Data rules
- keep latest fatigue snapshot per account pool queryable
- retain historical snapshots for trend and debugging
- store raw payload JSON as text/blob, not flattened only
