# Local 949 Quality Contract

This document defines the truthful local public-candidate target for Dongri-grigri. It is a rubric and verification contract, not a certification badge.

## Score model

| Axis                                           |  Maximum | Local target | Required evidence                                                                               |
| ---------------------------------------------- | -------: | -----------: | ----------------------------------------------------------------------------------------------- |
| Product coherence and source-of-truth fidelity |      200 |          190 | Korean-first decision model, root source identity, no second registry                           |
| Functional completeness                        |      220 |          209 | Five native views, real detail panels, URL/history behavior, compatibility route                |
| UI, accessibility, and responsive quality      |      220 |          209 | keyboard flow, mobile focus containment, 44px controls, light/dark, 200% reflow, reduced motion |
| Engineering and verification                   |      200 |          190 | compact API contract, focused tests, typecheck, build, OpenAPI consistency                      |
| Public repository readiness                    |      160 |          151 | current README, main-only contribution model, Alpha security policy, CI public guard            |
| **Total**                                      | **1000** |      **949** | all local gates below pass from a clean committed candidate                                     |

## Local gates

```bash
corepack pnpm run public:verify
corepack pnpm exec tsc -p tsconfig.json --noEmit --pretty false
corepack pnpm run test:web
corepack pnpm run test:api
corepack pnpm run openapi:check
corepack pnpm run build
corepack pnpm run smoke:command-loop:self-test
```

The implementation working tree may be described as `949-ready` only after these no-runtime checks pass. The score may be described as achieved only after a separately approved commit and clean-clone reproducibility run proves the same result.

## Explicit non-claims

- 72-hour Soak credit: `0`
- 30-day/500-run Pilot credit: `0`
- deployment and migration credit: `0`
- production certification: not claimed
- runtime and browser acceptance: separately approved evidence only

Public Alpha readiness cannot substitute accelerated loops for elapsed-time evidence. Short tests can validate harness behavior, failure handling, and determinism, but they do not create 72 hours of wall-clock evidence.

The actual `smoke:command-loop` is a separate runtime gate. It requires an explicitly approved isolated loopback runtime and disposable project path; its self-test alone earns no runtime, Soak, Pilot, or certification credit.
