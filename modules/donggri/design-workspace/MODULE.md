# Project Design Workspace

Project-scoped design department component for UI iteration history, comment pins, responsive preview checkpoints, and export events.

## Entry Points

- Global department components tab
- Design office room click
- Project detail context

## Event Contract

Events are stored in `project_component_events` with:

- `department_id`: `design`
- `component_key`: `design-workspace`
- `component_kind`: `design_workspace`
- `project_id`: selected project

Supported event types include `snapshot`, `task_created`, `comment_pin`, `preview`, `export`, and `approval`.
