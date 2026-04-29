import { createContext, createElement, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";

export type UiLanguage = "ko" | "en" | "ja" | "zh";
export const LANGUAGE_STORAGE_KEY = "climpire.language";
export const LANGUAGE_USER_SET_STORAGE_KEY = "climpire.language.user_set";

export type LangText = {
  ko: string;
  en: string;
  ja?: string;
  zh?: string;
};

type TranslationInput = LangText | string;

function parseLanguage(value?: string | null): UiLanguage | null {
  return value === null ? null : "ko";
}

export function normalizeLanguage(value?: string | null): UiLanguage {
  return parseLanguage(value) ?? "ko";
}

export function localeName(
  locale: UiLanguage | string,
  obj: { name: string; name_ko?: string | null; name_ja?: string | null; name_zh?: string | null },
): string {
  normalizeLanguage(typeof locale === "string" ? locale : "ko");
  return obj.name_ko || obj.name;
}

export function detectBrowserLanguage(): UiLanguage {
  return "ko";
}

function detectRuntimeLanguage(): UiLanguage {
  return "ko";
}

export function localeFromLanguage(_lang: UiLanguage): string {
  return "ko-KR";
}

export function pickLang(_lang: UiLanguage, text: LangText): string {
  return text.ko || text.en;
}

export interface I18nContextValue {
  language: UiLanguage;
  locale: string;
  t: (text: TranslationInput) => string;
  __fromProvider?: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  language: "ko",
  locale: "ko-KR",
  t: (text) => (typeof text === "string" ? text : text.ko || text.en),
  __fromProvider: false,
});

interface I18nProviderProps {
  language?: string | null;
  children: ReactNode;
}

export function I18nProvider({ language, children }: I18nProviderProps) {
  const normalizedLanguage = normalizeLanguage(language);
  const locale = useMemo(() => localeFromLanguage(normalizedLanguage), [normalizedLanguage]);
  const t = useCallback(
    (text: TranslationInput) => (typeof text === "string" ? text : pickLang(normalizedLanguage, text)),
    [normalizedLanguage],
  );

  const value = useMemo(
    () => ({
      language: normalizedLanguage,
      locale,
      t,
      __fromProvider: true,
    }),
    [normalizedLanguage, locale, t],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(languageOverride?: string | null): I18nContextValue {
  const context = useContext(I18nContext);
  const override = useMemo(() => {
    if (typeof languageOverride !== "string" || !languageOverride.trim()) return null;
    return normalizeLanguage(languageOverride);
  }, [languageOverride]);
  const baseLanguage = context.__fromProvider ? context.language : detectRuntimeLanguage();
  const language = override ?? baseLanguage;

  const t = useCallback(
    (text: TranslationInput) => (typeof text === "string" ? text : pickLang(language, text)),
    [language],
  );

  return useMemo(
    () => ({
      language,
      locale: localeFromLanguage(language),
      t,
      __fromProvider: context.__fromProvider,
    }),
    [context.__fromProvider, language, t],
  );
}
