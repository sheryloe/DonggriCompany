import { decryptSecret, encryptSecret } from "../oauth/helpers.ts";
import { MESSENGER_CHANNELS, type MessengerChannel } from "./channels.ts";

const MESSENGER_TOKEN_ENCRYPTION_PREFIX = "__ce_enc_v1__:";
export const MESSENGER_TOKEN_REDACTION_PLACEHOLDER = "__donggri_redacted_token__";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encryptMessengerToken(rawToken: unknown): string {
  const token = normalizeText(rawToken);
  if (!token) return "";
  if (token.startsWith(MESSENGER_TOKEN_ENCRYPTION_PREFIX)) return token;
  return `${MESSENGER_TOKEN_ENCRYPTION_PREFIX}${encryptSecret(token)}`;
}

function decryptMessengerToken(rawToken: unknown, onDecryptError: "raw" | "empty"): string {
  const token = normalizeText(rawToken);
  if (!token) return "";
  if (!token.startsWith(MESSENGER_TOKEN_ENCRYPTION_PREFIX)) return token;
  const payload = token.slice(MESSENGER_TOKEN_ENCRYPTION_PREFIX.length).trim();
  if (!payload) return onDecryptError === "raw" ? token : "";
  try {
    return decryptSecret(payload);
  } catch {
    return onDecryptError === "raw" ? token : "";
  }
}

function redactMessengerToken(rawToken: unknown): string {
  const token = normalizeText(rawToken);
  return token ? MESSENGER_TOKEN_REDACTION_PLACEHOLDER : "";
}

function mapMessengerChannelsTokens(
  rawChannels: unknown,
  mode: "encrypt" | "decrypt" | "redact",
  onDecryptError: "raw" | "empty" = "raw",
): unknown {
  if (!isRecord(rawChannels)) return rawChannels;

  const nextChannels: Record<string, unknown> = { ...rawChannels };
  for (const channel of MESSENGER_CHANNELS) {
    const channelConfig = nextChannels[channel];
    if (!isRecord(channelConfig)) continue;

    const nextChannelConfig: Record<string, unknown> = { ...channelConfig };
    if (hasOwn(nextChannelConfig, "token")) {
      nextChannelConfig.token =
        mode === "redact"
          ? redactMessengerToken(nextChannelConfig.token)
          : mode === "encrypt"
          ? encryptMessengerToken(nextChannelConfig.token)
          : decryptMessengerToken(nextChannelConfig.token, onDecryptError);
    }
    if (hasOwn(nextChannelConfig, "sessions") && Array.isArray(nextChannelConfig.sessions)) {
      nextChannelConfig.sessions = nextChannelConfig.sessions.map((rawSession) => {
        if (!isRecord(rawSession)) return rawSession;
        if (!hasOwn(rawSession, "token")) return rawSession;
        const nextSession: Record<string, unknown> = { ...rawSession };
        nextSession.token =
          mode === "redact"
            ? redactMessengerToken(nextSession.token)
            : mode === "encrypt"
            ? encryptMessengerToken(nextSession.token)
            : decryptMessengerToken(nextSession.token, onDecryptError);
        return nextSession;
      });
    }
    for (const departmentBotsKey of ["departmentBots", "department_bots"]) {
      const rawDepartmentBots = nextChannelConfig[departmentBotsKey];
      if (!isRecord(rawDepartmentBots)) continue;
      const nextDepartmentBots: Record<string, unknown> = {};
      for (const [departmentId, rawBot] of Object.entries(rawDepartmentBots)) {
        if (!isRecord(rawBot)) {
          nextDepartmentBots[departmentId] = rawBot;
          continue;
        }
        if (!hasOwn(rawBot, "token")) {
          nextDepartmentBots[departmentId] = rawBot;
          continue;
        }
        const nextBot: Record<string, unknown> = { ...rawBot };
        nextBot.token =
          mode === "redact"
            ? redactMessengerToken(nextBot.token)
            : mode === "encrypt"
            ? encryptMessengerToken(nextBot.token)
            : decryptMessengerToken(nextBot.token, onDecryptError);
        nextDepartmentBots[departmentId] = nextBot;
      }
      nextChannelConfig[departmentBotsKey] = nextDepartmentBots;
    }
    nextChannels[channel] = nextChannelConfig;
  }

  return nextChannels;
}

function mergeRedactedToken(rawNextToken: unknown, rawExistingToken: unknown): unknown {
  const nextToken = normalizeText(rawNextToken);
  if (nextToken !== MESSENGER_TOKEN_REDACTION_PLACEHOLDER) return rawNextToken;
  return normalizeText(rawExistingToken);
}

function findExistingSessionByIdOrIndex(
  existingSessions: unknown[],
  rawNextSession: Record<string, unknown>,
  index: number,
): Record<string, unknown> | null {
  const nextId = normalizeText(rawNextSession.id);
  if (nextId) {
    const matched = existingSessions.find((session) => isRecord(session) && normalizeText(session.id) === nextId);
    if (isRecord(matched)) return matched;
  }
  const indexed = existingSessions[index];
  return isRecord(indexed) ? indexed : null;
}

export function mergeRedactedMessengerTokensForStorage(rawNextChannels: unknown, rawExistingChannels: unknown): unknown {
  if (!isRecord(rawNextChannels) || !isRecord(rawExistingChannels)) return rawNextChannels;

  const nextChannels: Record<string, unknown> = { ...rawNextChannels };
  for (const channel of MESSENGER_CHANNELS) {
    const nextChannelConfig = nextChannels[channel];
    const existingChannelConfig = rawExistingChannels[channel];
    if (!isRecord(nextChannelConfig) || !isRecord(existingChannelConfig)) continue;

    const mergedChannelConfig: Record<string, unknown> = { ...nextChannelConfig };
    if (hasOwn(mergedChannelConfig, "token")) {
      mergedChannelConfig.token = mergeRedactedToken(mergedChannelConfig.token, existingChannelConfig.token);
    }

    if (hasOwn(mergedChannelConfig, "sessions") && Array.isArray(mergedChannelConfig.sessions)) {
      const existingSessions = Array.isArray(existingChannelConfig.sessions) ? existingChannelConfig.sessions : [];
      mergedChannelConfig.sessions = mergedChannelConfig.sessions.map((rawSession, index) => {
        if (!isRecord(rawSession)) return rawSession;
        const existingSession = findExistingSessionByIdOrIndex(existingSessions, rawSession, index);
        if (!existingSession || !hasOwn(rawSession, "token")) return rawSession;
        return {
          ...rawSession,
          token: mergeRedactedToken(rawSession.token, existingSession.token),
        };
      });
    }

    for (const departmentBotsKey of ["departmentBots", "department_bots"]) {
      const nextDepartmentBots = mergedChannelConfig[departmentBotsKey];
      const existingDepartmentBots = existingChannelConfig[departmentBotsKey];
      if (!isRecord(nextDepartmentBots) || !isRecord(existingDepartmentBots)) continue;
      const mergedDepartmentBots: Record<string, unknown> = {};
      for (const [departmentId, rawBot] of Object.entries(nextDepartmentBots)) {
        if (!isRecord(rawBot)) {
          mergedDepartmentBots[departmentId] = rawBot;
          continue;
        }
        const existingBot = existingDepartmentBots[departmentId];
        if (!isRecord(existingBot) || !hasOwn(rawBot, "token")) {
          mergedDepartmentBots[departmentId] = rawBot;
          continue;
        }
        mergedDepartmentBots[departmentId] = {
          ...rawBot,
          token: mergeRedactedToken(rawBot.token, existingBot.token),
        };
      }
      mergedChannelConfig[departmentBotsKey] = mergedDepartmentBots;
    }

    nextChannels[channel] = mergedChannelConfig;
  }

  return nextChannels;
}

export function encryptMessengerChannelsForStorage(rawChannels: unknown): unknown {
  return mapMessengerChannelsTokens(rawChannels, "encrypt");
}

export function redactMessengerChannelsForClient(rawChannels: unknown): unknown {
  return mapMessengerChannelsTokens(rawChannels, "redact");
}

export function decryptMessengerChannelsForRuntime(rawChannels: unknown): unknown {
  return mapMessengerChannelsTokens(rawChannels, "decrypt", "empty");
}

export function decryptMessengerTokenForRuntime(channel: MessengerChannel, rawToken: unknown): string {
  void channel;
  return decryptMessengerToken(rawToken, "empty");
}
