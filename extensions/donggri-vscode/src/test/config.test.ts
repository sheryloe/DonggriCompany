import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeState = vi.hoisted(() => ({
  configValues: {
    serverUrl: "http://127.0.0.1:8790",
    apiToken: "",
    autoConnect: true,
    defaultProjectBindingMode: "match-or-create",
  },
  updates: [] as Array<{ key: string; value: unknown; target: unknown }>,
  secretValue: "",
  storedSecrets: [] as Array<{ key: string; value: string }>,
  deletedSecrets: [] as string[],
}));

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) => {
        const value = vscodeState.configValues[key as keyof typeof vscodeState.configValues];
        return value === undefined ? fallback : value;
      },
      update: (key: string, value: unknown, target: unknown) => {
        vscodeState.updates.push({ key, value, target });
        if (key === "apiToken" && typeof value === "string") {
          vscodeState.configValues.apiToken = value;
        }
        return Promise.resolve();
      },
      inspect: (key: string) =>
        key === "apiToken" && vscodeState.configValues.apiToken
          ? { globalValue: vscodeState.configValues.apiToken }
          : undefined,
    }),
  },
  ConfigurationTarget: {
    Global: "global",
    Workspace: "workspace",
    WorkspaceFolder: "workspaceFolder",
  },
}));

describe("donggri config", () => {
  const context = {
    secrets: {
      get: vi.fn(async () => vscodeState.secretValue || undefined),
      store: vi.fn(async (key: string, value: string) => {
        vscodeState.secretValue = value;
        vscodeState.storedSecrets.push({ key, value });
      }),
      delete: vi.fn(async (key: string) => {
        vscodeState.secretValue = "";
        vscodeState.deletedSecrets.push(key);
      }),
    },
  } as any;

  beforeEach(() => {
    vi.resetModules();
    vscodeState.configValues = {
      serverUrl: "http://127.0.0.1:8790",
      apiToken: "",
      autoConnect: true,
      defaultProjectBindingMode: "match-or-create",
    };
    vscodeState.updates = [];
    vscodeState.secretValue = "";
    vscodeState.storedSecrets = [];
    vscodeState.deletedSecrets = [];
    context.secrets.get.mockClear();
    context.secrets.store.mockClear();
    context.secrets.delete.mockClear();
  });

  it("prefers Secret Storage token over legacy setting", async () => {
    vscodeState.configValues.apiToken = "legacy-token";
    vscodeState.secretValue = "secret-token";

    const { initializeDonggriServerConfig, readDonggriServerConfig } = await import("../config");
    await initializeDonggriServerConfig(context);

    expect(readDonggriServerConfig().apiToken).toBe("secret-token");
    expect(context.secrets.store).not.toHaveBeenCalled();
  });

  it("migrates legacy config token into Secret Storage and clears the setting", async () => {
    vscodeState.configValues.apiToken = "legacy-token";

    const { initializeDonggriServerConfig, readDonggriServerConfig } = await import("../config");
    await initializeDonggriServerConfig(context);

    expect(context.secrets.store).toHaveBeenCalledWith("donggri.apiToken", "legacy-token");
    expect(vscodeState.updates).toEqual(expect.arrayContaining([{ key: "apiToken", value: "", target: "global" }]));
    expect(readDonggriServerConfig().apiToken).toBe("legacy-token");
  });

  it("stores and clears token through config helpers", async () => {
    const { clearDonggriApiToken, initializeDonggriServerConfig, readDonggriServerConfig, setDonggriApiToken } =
      await import("../config");

    await initializeDonggriServerConfig(context);
    await setDonggriApiToken(context, "fresh-token");
    expect(readDonggriServerConfig().apiToken).toBe("fresh-token");

    await clearDonggriApiToken(context);
    expect(readDonggriServerConfig().apiToken).toBe("");
    expect(context.secrets.delete).toHaveBeenCalledWith("donggri.apiToken");
  });
});
