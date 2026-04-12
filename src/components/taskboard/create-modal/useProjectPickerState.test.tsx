import { describe, expect, it } from "vitest";
import { resolveNativePickerFailure, resolveProjectQueryChange } from "./useProjectPickerState.helpers";

describe("useProjectPickerState helpers", () => {
  it("opens in-app folder browser when native picker fails", () => {
    const resolution = resolveNativePickerFailure({
      error: {
        status: 500,
        code: "native_picker_failed",
      },
      currentPath: "D:\\AI\\claw-empire",
      unsupportedPathApiMessage: "unsupported",
      resolvePathHelperErrorMessage: () =>
        "OS folder picker is unavailable in this environment. Use in-app browser or manual input.",
      isApiRequestError: (error): error is { status?: number; code?: string } =>
        typeof error === "object" && error !== null && ("status" in error || "code" in error),
    });

    expect(resolution).toEqual({
      mode: "manual_fallback",
      nativePickerUnsupported: true,
      browsePath: "D:\\AI\\claw-empire",
      formFeedback: {
        tone: "info",
        message: "OS folder picker is unavailable in this environment. Use in-app browser or manual input.",
      },
    });
  });

  it("keeps create-new-project mode and path while editing the new project name", () => {
    const resolution = resolveProjectQueryChange("claw-empire-v2", true);

    expect(resolution).toEqual({
      projectQuery: "claw-empire-v2",
      projectId: "",
      projectDropdownOpen: false,
      keepCreateNewProjectMode: true,
      resetNewProjectPath: false,
    });
  });
});
