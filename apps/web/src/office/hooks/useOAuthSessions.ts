"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  OAuthProvider,
  OAuthSessionStatusView,
} from "@workspace/shared";

import {
  disconnectOAuth,
  getOAuthStatus,
  startOAuth
} from "../../lib/api/office-step2";

type UseOAuthSessionsResult = {
  sessions: OAuthSessionStatusView[];
  sessionByPoolId: Record<string, OAuthSessionStatusView>;
  isLoading: boolean;
  isMutating: boolean;
  isProviderConfigured: boolean;
  errorMessage: string | null;
  actionMessage: string | null;
  refresh: () => Promise<void>;
  connect: (accountPoolId: string) => Promise<boolean>;
  disconnect: (accountPoolId: string) => Promise<boolean>;
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
};

type OAuthPopupMessage = {
  type: "donggri-oauth-result";
  provider: OAuthProvider;
  accountPoolId: string;
  status: "connected" | "error";
  message?: string;
};

const waitForPopupResult = (
  provider: OAuthProvider,
  accountPoolId: string,
  timeoutMs = 3 * 60_000
): Promise<OAuthPopupMessage | null> => {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);

    const onMessage = (event: MessageEvent): void => {
      const payload = event.data as OAuthPopupMessage;
      if (!payload || payload.type !== "donggri-oauth-result") {
        return;
      }
      if (payload.provider !== provider || payload.accountPoolId !== accountPoolId) {
        return;
      }
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(payload);
    };

    window.addEventListener("message", onMessage);
  });
};

export const useOAuthSessions = (
  provider: OAuthProvider
): UseOAuthSessionsResult => {
  const [sessions, setSessions] = useState<OAuthSessionStatusView[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [isProviderConfigured, setIsProviderConfigured] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setErrorMessage(null);
    try {
      const response = await getOAuthStatus(provider);
      setSessions(response.sessions);
      setIsProviderConfigured(response.isConfigured);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setIsProviderConfigured(false);
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const connect = useCallback(
    async (accountPoolId: string): Promise<boolean> => {
      if (typeof window === "undefined") {
        return false;
      }
      setIsMutating(true);
      setErrorMessage(null);
      setActionMessage(null);
      try {
        const response = await startOAuth(provider, {
          accountPoolId,
          clientOrigin: window.location.origin
        });
        const popup = window.open(
          response.authorizeUrl,
          "donggri-oauth",
          "width=560,height=760,noopener,noreferrer"
        );
        if (!popup) {
          window.location.href = response.authorizeUrl;
          return false;
        }

        const result = await waitForPopupResult(provider, accountPoolId);
        await refresh();

        if (!result) {
          setActionMessage(`oauth-timeout:${accountPoolId}`);
          return false;
        }
        setActionMessage(`oauth-${result.status}:${accountPoolId}`);
        return result.status === "connected";
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [provider, refresh]
  );

  const disconnect = useCallback(
    async (accountPoolId: string): Promise<boolean> => {
      setIsMutating(true);
      setErrorMessage(null);
      setActionMessage(null);
      try {
        await disconnectOAuth(provider, { accountPoolId });
        await refresh();
        setActionMessage(`oauth-disconnect:${accountPoolId}`);
        return true;
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [provider, refresh]
  );

  const sessionByPoolId = useMemo(() => {
    return sessions.reduce((accumulator, current) => {
      accumulator[current.accountPoolId] = current;
      return accumulator;
    }, {} as Record<string, OAuthSessionStatusView>);
  }, [sessions]);

  return {
    sessions,
    sessionByPoolId,
    isLoading,
    isMutating,
    isProviderConfigured,
    errorMessage,
    actionMessage,
    refresh,
    connect,
    disconnect
  };
};
