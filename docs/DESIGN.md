# Dongri-grigri UI/UX Design Guide

## Design North Star

Dongri-grigri is an office-style Control Platform for the `G:\Donggri_DevDrive` root workspace.
The default screen is the operations office, not a separate control-console product.

The UI should feel:

- friendly but operational
- Korean-first
- compact enough for daily work
- wide-screen aware
- clear in both light and dark themes

## Information Architecture

Primary navigation:

- 운영실
- 프로젝트
- 부서 에이전트
- 업무
- Skill
- Memory
- 설정

The Control Plane is embedded into the office experience through status panels, safety gates, memory scope views, and run timelines.

## Agent Model

Default user-facing agents:

- 기획 마스터
- 개발 마스터
- 디자인 마스터
- 품질 마스터
- 운영 마스터
- 외부강사 마스터

Each master agent may create disposable subagents for one task, then accept, reject, recreate, or merge the result.
The old staff hierarchy is compatibility data only and must not be the default visual model.

## Layout Rules

- Use the full desktop width. Avoid narrow centered settings panels on wide screens.
- Keep menu rows compact.
- Use cards for repeated items, not for every section wrapper.
- Keep the office scene wide enough that the pixel room reads as the main surface.
- The right rail is for real department/run/memory events, not invented conversation.

## Theme Rules

Use semantic tokens instead of hard-coded dark colors.

- Light theme text must be dark enough on light backgrounds.
- White text is allowed only on dark surfaces or strong CTA backgrounds.
- Avoid dark-theme-only classes such as fixed `text-white` on general containers.
- Use department accent colors to separate areas:
  - 기획: blue
  - 개발: teal
  - 디자인: violet
  - 품질: red
  - 운영: cyan
  - 외부강사: amber

## Typography

Use one Korean-safe font stack:

```css
font-family:
  Pretendard,
  "Noto Sans KR",
  "Apple SD Gothic Neo",
  "Malgun Gothic",
  system-ui,
  sans-serif;
```

Do not mix unrelated font families between menus.

## Korean Text Integrity

Broken Korean is a release blocker.

Scan for replacement characters and common CP949/UTF-8 mojibake fragments.
Keep the actual pattern list in test scripts or release evidence so this guide itself does not trip UI text scans.

Rendered UI must also be checked in the browser because console encoding alone can mislead.

## Skill And Memory UX

Skill should be easy to choose:

- category
- search
- install/status
- source quality
- license/readiness
- related department

Memory should be shown by scope:

- root
- department
- project
- run
- persona

AgentMemory integration is read-only by default. Write/remember/hooks require explicit approval.

## Verification

Before calling UI work done:

```powershell
corepack pnpm run test:web -- ControlPlanePage Sidebar.app-shell ManualLibrary TaskBoard SkillsLibrary
corepack pnpm run build
```

Browser smoke should verify:

- title includes `Dongri-grigri`
- office dashboard is the first screen
- light theme text is readable
- no old product naming appears in normal UI
- no broken Korean appears in rendered text
