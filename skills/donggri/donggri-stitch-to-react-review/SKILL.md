---
name: donggri-stitch-to-react-review
description: Use when reviewing Google Stitch-generated UI exports, converting them into Donggri React and Tailwind implementation plans, or checking generated UI for localization, accessibility, and component consistency.
---

# Donggri Stitch to React Review

## Review workflow

1. Inspect exported HTML, CSS, images, and any React fragments.
2. Separate design intent from generated implementation noise.
3. Map screens to existing Donggri components and routes.
4. Replace hardcoded labels with locale dictionary keys.
5. Remove broken text, account-specific data, and inaccessible controls.
6. Produce a scoped implementation plan or patch.

## Conversion rules

- Keep internal component state and enums in English canonical form.
- Use existing Tailwind and design tokens before adding new styles.
- Prefer lucide icons or existing project icon patterns.
- Avoid adding new dependencies unless the repository already uses them.
- Preserve responsive behavior and keyboard accessibility.

## Acceptance checks

```powershell
corepack pnpm test:web -- <target-test>
corepack pnpm build
```

When no test exists, validate by rendering the affected view and checking layout, text, and console errors.
