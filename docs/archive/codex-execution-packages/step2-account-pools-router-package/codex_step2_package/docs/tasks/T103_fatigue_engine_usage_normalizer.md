# T103 — Fatigue Engine and Usage Normalizer

## Goal
Implement provider-specific raw usage ingestion and normalized fatigue scoring.

## Inputs
- provider probe outputs
- account pool fatigue_mode

## Required outputs
- UsageNormalizer module
- FatigueEngine module
- fatigue state mapping function
- confidence scoring rules

## Normalization model
Map provider-specific units into `normalized_percent` between 0 and 100.

### States
- 0-39 => fresh
- 40-64 => warm
- 65-84 => hot
- 85-100 => critical
- unavailable => unknown

## Acceptance criteria
- raw payload is always persisted before normalization
- confidence varies by source type (`official` > `derived` > `manual`)
- last known snapshot fallback is supported

## Verify
- unit tests for state mapping
- unit tests for confidence scoring
- unit tests for stale snapshot behavior
