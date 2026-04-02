# T106 — Provider Usage Probe Adapters

## Goal
Implement safe provider probes for codex, claude, and gemini.

## Constraints
- do not mutate login state
- do not write to OAuth directories
- use read-only status/inspection commands where possible
- save stdout/stderr and parsed payload

## Expected adapters
- CodexProbeAdapter
- ClaudeProbeAdapter
- GeminiProbeAdapter

## Notes
Probe logic may be best-effort because providers expose different usage signals. Keep parser logic defensive.

## Acceptance criteria
- failed probes are stored as failure runs
- successful probes can create fatigue snapshots
- adapters return structured parse results with confidence labels

## Verify
- mock parser tests
- probe failure-path tests
