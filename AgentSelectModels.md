# Agent Model Routing Policy

이 문서는 Claw-Empire 에이전트의 모델 선택 기준을 고정하는 정책 문서다.
아래 JSON 블록을 우선 기준으로 사용한다.

- 기본 동작: 자동 선택
- 운영 모드: `mixed`
- Preview 모델은 기본 비활성

```json
{
  "version": "2026-04-14",
  "mode": "mixed",
  "allowPreviewByDefault": false,
  "taskClasses": ["LIGHT", "FAST_PATCH", "STANDARD_CODE", "LARGE_CONTEXT_ANALYSIS", "HIGH_RISK_REASONING"],
  "candidatePriority": {
    "LIGHT": ["gpt-5.4-mini", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
    "FAST_PATCH": ["gpt-5.3-codex-spark", "gemini-2.5-flash", "gpt-5.3-codex", "gemini-3-flash-preview"],
    "STANDARD_CODE": ["gpt-5.3-codex", "gemini-2.5-flash", "gemini-2.5-pro", "gpt-5.4"],
    "LARGE_CONTEXT_ANALYSIS": ["gemini-2.5-pro", "gpt-5.4", "gpt-5.3-codex"],
    "HIGH_RISK_REASONING": ["gpt-5.4", "gemini-2.5-pro", "gpt-5.3-codex", "gemini-3-pro-preview"]
  },
  "hardExclusions": {
    "gpt-5.4-mini": ["production_code", "root_cause_debug", "schema", "security_sensitive", "broad_refactor"],
    "gemini-2.5-flash-lite": ["real_code_impl", "security_sensitive", "migration", "infra_or_deploy", "multi_file_bugfix"],
    "fast_models": ["auth_redesign", "security_review", "payment_logic", "schema_or_migration", "infra_or_deploy", "cross_service_critical", "large_context_architecture"],
    "preview_models": ["production_critical_auth", "security_sensitive", "privacy_or_compliance", "schema_migration", "infra_or_deploy"]
  },
  "retryPolicy": {
    "maxRetrySameScope": 1,
    "phasedOnThirdExceed": true,
    "handoffMaxWords": 100,
    "handoffMaxBullets": 6
  },
  "caps": {
    "LIGHT": { "maxFiles": 2, "maxLines": 250 },
    "FAST_PATCH": { "maxFiles": 3, "maxLines": 400 },
    "STANDARD_CODE": { "maxFiles": 8, "maxLines": 1200 },
    "LARGE_CONTEXT_ANALYSIS": { "maxFiles": 10, "maxLines": 1500 },
    "HIGH_RISK_REASONING": { "maxFiles": 10, "maxLines": 1500 }
  }
}
```
