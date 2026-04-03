import type {
  CreateRuntimeProfileRequest,
  ProviderUsageProbeProvider,
  ProviderUsageProbeRunRequest,
  UpdateRuntimeProfileRequest
} from "@workspace/shared";

const providers = new Set<ProviderUsageProbeProvider>(["claude", "codex", "gemini"]);

const isKnownProvider = (value: string): value is ProviderUsageProbeProvider => {
  return providers.has(value as ProviderUsageProbeProvider);
};

export const validateRuntimeProfileCreate = (payload: CreateRuntimeProfileRequest): string | null => {
  if (payload.key.trim().length < 3) {
    return "Runtime profile key must be at least 3 characters.";
  }
  if (!/^[a-z0-9-]+$/.test(payload.key)) {
    return "Runtime profile key must use lower-case letters, numbers, and hyphen.";
  }
  if (!isKnownProvider(payload.provider)) {
    return "Provider is invalid.";
  }
  if (payload.accountPoolId.trim().length === 0) {
    return "Account pool is required.";
  }
  return null;
};

export const validateRuntimeProfileUpdate = (payload: UpdateRuntimeProfileRequest): string | null => {
  if (Object.keys(payload).length === 0) {
    return "At least one field is required.";
  }
  if (payload.key !== undefined) {
    if (payload.key.trim().length < 3) {
      return "Runtime profile key must be at least 3 characters.";
    }
    if (!/^[a-z0-9-]+$/.test(payload.key)) {
      return "Runtime profile key must use lower-case letters, numbers, and hyphen.";
    }
  }
  return null;
};

export const validateProviderProbeRun = (payload: ProviderUsageProbeRunRequest): string | null => {
  if (!isKnownProvider(payload.provider)) {
    return "Provider is invalid.";
  }
  if (payload.accountPoolId !== undefined && payload.accountPoolId.trim().length === 0) {
    return "Account pool id cannot be empty.";
  }
  if (payload.runtimeProfileId !== undefined && payload.runtimeProfileId.trim().length === 0) {
    return "Runtime profile id cannot be empty.";
  }
  return null;
};
