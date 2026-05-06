# Donggri VSCode Extension

`extensions/donggri-vscode` is the native VS Code client for DonggriCompany.

## Included features

- `@donggri` chat participant
- `/review`, `/fix`, `/task`, `/run`, `/log`, `/bind`
- Workspace-to-project binding
- Task control and decision inbox access
- REST + WebSocket synchronization
- Selection, file, and diff based local review

## Run in PowerShell

```powershell
cd <PROJECT_ROOT>
corepack pnpm install
corepack pnpm start
```

Open a second PowerShell window for the extension:

```powershell
cd <PROJECT_ROOT>\extensions\donggri-vscode
corepack pnpm install
corepack pnpm compile
corepack pnpm test
```

## F5 workflow

1. Start the DonggriCompany server from the repository root.
2. Open `<PROJECT_ROOT>\extensions\donggri-vscode` in VS Code.
3. Press `F5`.
4. Wait for `Extension Development Host` to open.
5. In the development host, open Chat and call `@donggri /bind`.
6. Run `@donggri /review`.
7. Promote the same context with `@donggri /task`.
8. Check progress with `@donggri /log`.
9. Open pending decisions with `Donggri: Open Decision Inbox`.

## Server defaults

- Default server URL: `http://127.0.0.1:8790`
- When the default local port is unavailable, the extension also retries `http://127.0.0.1:7777`
- If you use another port, set `donggri.serverUrl` explicitly

## Recommended settings

```json
{
  "donggri.serverUrl": "http://127.0.0.1:8790",
  "donggri.autoConnect": true,
  "donggri.defaultProjectBindingMode": "match-or-create"
}
```

## API token storage

- Run `Donggri: Set API Token` to save a bearer token in VS Code Secret Storage.
- Run `Donggri: Clear API Token` to remove the stored token.
- Legacy `donggri.apiToken` settings are migrated once and then cleared.

## Manual smoke path

1. Bind current workspace
2. Review current selection or file
3. Create a Donggri task from the same context
4. Run the task
5. Read the latest log summary
6. Reply to a pending decision if one exists

## WSL note

- v1 targets Windows + PowerShell first
- If VS Code runs through WSL Remote, make sure `project_path` matches the server-visible path
