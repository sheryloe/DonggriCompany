# Codex Step 2 Execution Package

This package is the Codex-ready implementation bundle for Step 2:
**Account Pools, Fatigue Engine, Runtime Router, Routing Policy, and Usage Normalization**.

## Goal
Build the orchestration core that sits between employees and provider runtimes.

## Included
- PRN for Step 2
- Implementation guide
- Constraints and invariants
- SQL contract additions for Step 2
- OpenAPI contract additions
- Seed data for demo account pools and routing rules
- Task cards for Codex
- Codex skill file

## Suggested execution order
1. T101_add_step2_schema_extensions
2. T102_account_pool_repository_service
3. T103_fatigue_engine_usage_normalizer
4. T104_runtime_router_policy_engine
5. T105_admin_ui_account_pools_router
6. T106_provider_usage_probes

## Success condition
At the end of Step 2, the system can:
- store provider account pools and runtime profiles
- compute normalized fatigue from provider-specific signals
- resolve a runtime profile for a task request using routing rules
- expose the router via API and show account pool health in the admin UI
