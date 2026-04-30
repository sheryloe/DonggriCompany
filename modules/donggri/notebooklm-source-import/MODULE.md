# NotebookLM Source Import Module

## Purpose

Provide a safe reusable workflow for projects that want to use NotebookLM as a source-based research and briefing tool.

## Canonical Inputs

- `source_urls`
- `pdf_sources`
- `google_docs_exports`
- `google_drive_exports`
- `manual_upload_notes`
- `brief_export_target`

## Apply Rules

- Generate only project-local checklist and Donggri module metadata.
- Do not automate unofficial Chrome extensions.
- Do not export cookies, browser profiles, OAuth tokens, or Google session artifacts.
- Use official NotebookLM source import/export and manual upload paths only.
- Keep all module metadata in English canonical form.

## Verification

- Confirm each source has a project reason and owner.
- Confirm source license and confidentiality before upload.
- Confirm exported briefing output is reviewed before being copied into project docs.
- Confirm no raw Google credential or token is stored in the repository.

## Operator Notes

The UI may display this module in Korean, but generated module files remain English canonical.
