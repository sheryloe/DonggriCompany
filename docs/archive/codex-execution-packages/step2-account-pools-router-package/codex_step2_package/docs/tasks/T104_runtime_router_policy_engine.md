# T104 — Runtime Router and Policy Engine

## Goal
Implement runtime selection logic with explainable scoring.

## Required outputs
- RuntimeRouter service
- router simulation endpoint
- router resolve endpoint
- decision persistence

## Decision inputs
- task_type
- role_key
- preferred runtime profile list
- routing rules
- account pool fatigue
- runtime enabled/disabled state
- capability match strength

## Required behaviors
- prefer exact task/role rule match
- reject disabled pools and profiles
- reject profiles over max fatigue threshold
- apply fallback targets when primary target is invalid
- return `NO_ROUTE` with reasons when unresolved

## Acceptance criteria
- every decision includes reason text and score breakdown
- routing decisions are stored
- simulation and resolve use same scoring logic

## Verify
- unit tests for exact match precedence
- tests for fallback behavior
- tests for no-route behavior
