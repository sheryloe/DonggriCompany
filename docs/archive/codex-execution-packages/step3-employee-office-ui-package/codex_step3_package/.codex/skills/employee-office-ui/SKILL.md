# Skill: Employee Office UI

You are implementing Step 3 of the local AI office application.

## Mission
Build an employee-first office dashboard where:
- employees are stable identities
- runtime profiles are attached at session time
- account pool fatigue is visible but separate
- real-time state changes arrive via SSE

## Priorities
1. Keep employee model provider-agnostic
2. Favor simple, observable real-time plumbing
3. Ship dashboard usability before visual flourish
4. Keep APIs small and composable
5. Preserve compatibility with Step 1 and Step 2 outputs

## Avoid
- embedding provider auth details in UI
- giant single-file components
- websocket complexity unless SSE is proven insufficient
- premature animation engines
- hard-coded runtime/provider assumptions inside employee entities

## Definition of quality
- clear types
- deterministic rendering
- good empty states
- straightforward tests
- visible event flow from mutation to dashboard update
