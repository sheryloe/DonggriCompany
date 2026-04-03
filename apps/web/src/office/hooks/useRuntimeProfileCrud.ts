"use client";

import { useState } from "react";

import type { CreateRuntimeProfileRequest, UpdateRuntimeProfileRequest } from "@workspace/shared";

import {
  createRuntimeProfile,
  deleteRuntimeProfile,
  updateRuntimeProfile
} from "../../lib/api/office-step2";
import {
  validateRuntimeProfileCreate,
  validateRuntimeProfileUpdate
} from "../../lib/validation/office-step2";

type UseRuntimeProfileCrudOptions = {
  onAfterMutation: () => Promise<void>;
};

type RuntimeProfileCrudResult = {
  isMutating: boolean;
  errorMessage: string | null;
  actionMessage: string | null;
  createProfile: (payload: CreateRuntimeProfileRequest) => Promise<boolean>;
  updateProfile: (id: string, payload: UpdateRuntimeProfileRequest) => Promise<boolean>;
  removeProfile: (id: string) => Promise<boolean>;
  clearMessages: () => void;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

export const useRuntimeProfileCrud = (
  options: UseRuntimeProfileCrudOptions
): RuntimeProfileCrudResult => {
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const createProfile = async (payload: CreateRuntimeProfileRequest): Promise<boolean> => {
    const issue = validateRuntimeProfileCreate(payload);
    if (issue) {
      setErrorMessage(issue);
      return false;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      await createRuntimeProfile(payload);
      await options.onAfterMutation();
      setActionMessage("Runtime profile created.");
      return true;
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const updateProfile = async (id: string, payload: UpdateRuntimeProfileRequest): Promise<boolean> => {
    const issue = validateRuntimeProfileUpdate(payload);
    if (issue) {
      setErrorMessage(issue);
      return false;
    }

    setIsMutating(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      await updateRuntimeProfile(id, payload);
      await options.onAfterMutation();
      setActionMessage("Runtime profile updated.");
      return true;
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const removeProfile = async (id: string): Promise<boolean> => {
    setIsMutating(true);
    setErrorMessage(null);
    setActionMessage(null);
    try {
      await deleteRuntimeProfile(id);
      await options.onAfterMutation();
      setActionMessage("Runtime profile deleted.");
      return true;
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      return false;
    } finally {
      setIsMutating(false);
    }
  };

  const clearMessages = (): void => {
    setErrorMessage(null);
    setActionMessage(null);
  };

  return {
    isMutating,
    errorMessage,
    actionMessage,
    createProfile,
    updateProfile,
    removeProfile,
    clearMessages
  };
};
