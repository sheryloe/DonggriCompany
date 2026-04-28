---
name: donggri-google-stitch-design
description: Use when preparing safe Google Stitch design prompts, DESIGN.md specs, UI screen plans, export review criteria, or Stitch-to-code handoff instructions for Donggri projects.
---

# Donggri Google Stitch Design

## Safe scope

- Generate prompts, screen specifications, DESIGN.md content, and export review checklists.
- Do not automate Google account login or remote Stitch workspace mutations without explicit approval.
- Keep design source-of-truth text in English canonical form when saved.
- Render Korean only in UI previews or user-facing summaries.

## Stitch prompt workflow

1. Identify product goal, target user, screens, constraints, and brand tone.
2. Write a concise English prompt with layout, interaction, and responsive requirements.
3. Add acceptance criteria for accessibility, empty states, loading states, and error states.
4. Produce a DESIGN.md handoff that Codex or Gemini can use for implementation.
5. Review exported artifacts before merging into the app.

## DESIGN.md sections

- Product goal
- User flow
- Screen inventory
- Component requirements
- Visual system
- Responsive behavior
- Accessibility requirements
- Export review checklist

## Review criteria

- No hardcoded broken text.
- No secrets or account-specific data.
- Components map cleanly to the target React/Tailwind project.
- Locale labels remain dictionary-driven.
