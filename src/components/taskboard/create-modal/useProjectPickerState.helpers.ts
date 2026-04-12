import type { FormFeedback, Locale } from "../constants";

export type ApiRequestErrorLike = {
  status?: number;
  code?: string | null;
};

export type LocalizedMessages = Record<Locale, string>;

export type ProjectQueryChangeResolution = {
  projectQuery: string;
  projectId: string;
  projectDropdownOpen: boolean;
  keepCreateNewProjectMode: boolean;
  resetNewProjectPath: boolean;
};

export function resolveProjectQueryChange(value: string, createNewProjectMode: boolean): ProjectQueryChangeResolution {
  return {
    projectQuery: value,
    projectId: "",
    projectDropdownOpen: !createNewProjectMode,
    keepCreateNewProjectMode: createNewProjectMode,
    resetNewProjectPath: !createNewProjectMode,
  };
}

export type NativePickerFailureResolution =
  | {
      mode: "path_api_unsupported";
      formFeedback: FormFeedback;
      pathApiUnsupported: true;
    }
  | {
      mode: "manual_fallback";
      formFeedback: FormFeedback;
      nativePickerUnsupported: true;
      browsePath: string | undefined;
    }
  | {
      mode: "error";
      formFeedback: FormFeedback;
    };

export function resolveNativePickerFailure(params: {
  error: unknown;
  currentPath: string;
  unsupportedPathApiMessage: string;
  resolvePathHelperErrorMessage: (error: unknown, fallback: LocalizedMessages) => string;
  isApiRequestError: (error: unknown) => error is ApiRequestErrorLike;
}): NativePickerFailureResolution {
  const { error, currentPath, unsupportedPathApiMessage, resolvePathHelperErrorMessage, isApiRequestError } = params;
  if (isApiRequestError(error) && error.status === 404) {
    return {
      mode: "path_api_unsupported",
      pathApiUnsupported: true,
      formFeedback: { tone: "info", message: unsupportedPathApiMessage },
    };
  }

  const message = resolvePathHelperErrorMessage(error, {
    ko: "운영체제 폴더 선택기를 열지 못했습니다.",
    en: "Failed to open OS folder picker.",
    ja: "OSフォルダ選択を開けませんでした。",
    zh: "无法打开系统文件夹选择器。",
  });

  if (
    isApiRequestError(error) &&
    (error.code === "native_picker_unavailable" || error.code === "native_picker_failed")
  ) {
    return {
      mode: "manual_fallback",
      nativePickerUnsupported: true,
      browsePath: currentPath.trim() || undefined,
      formFeedback: { tone: "info", message },
    };
  }

  return {
    mode: "error",
    formFeedback: { tone: "error", message },
  };
}
