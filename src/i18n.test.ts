import { createElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  I18nProvider,
  detectBrowserLanguage,
  type I18nContextValue,
  LANGUAGE_STORAGE_KEY,
  localeFromLanguage,
  localeName,
  normalizeLanguage,
  pickLang,
  useI18n,
  type LangText,
} from "./i18n";

const ORIGINAL_LANGUAGE = window.navigator.language;
const ORIGINAL_LANGUAGES = window.navigator.languages;

describe("i18n helpers", () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: ORIGINAL_LANGUAGE,
    });
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ORIGINAL_LANGUAGES,
    });
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  it("normalizeLanguage maps only ko/en and falls back to en", () => {
    expect(normalizeLanguage("ko-KR")).toBe("ko");
    expect(normalizeLanguage("en_US")).toBe("en");
    expect(normalizeLanguage("ja-JP")).toBe("en");
    expect(normalizeLanguage("zh-CN")).toBe("en");
    expect(normalizeLanguage("fr-FR")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
  });

  it("detectBrowserLanguage uses ko/en policy only", () => {
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["ja-JP", "en-US"],
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "ko-KR",
    });
    expect(detectBrowserLanguage()).toBe("en");
  });

  it("stored ja/zh setting is normalized to en without browser fallback override", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "ja-JP");
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["ko-KR"],
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "ko-KR",
    });

    let result: I18nContextValue = {
      language: "en",
      locale: "en-US",
      t: (text) => (typeof text === "string" ? text : text.en),
    };
    const Probe = () => {
      result = useI18n();
      return null;
    };

    render(createElement(Probe));
    expect(result.language).toBe("en");
    expect(result.locale).toBe("en-US");
  });

  it("localeName/pickLang/localeFromLanguage follow fallback rules", () => {
    const text: LangText = {
      ko: "ko-hello",
      en: "hello",
    };
    expect(pickLang("ko", text)).toBe("ko-hello");
    expect(pickLang("ja", text)).toBe("hello");
    expect(pickLang("zh", text)).toBe("hello");

    expect(
      localeName("ko", {
        name: "Planning",
        name_ko: "기획",
      }),
    ).toBe("기획");
    expect(
      localeName("ja", {
        name: "Planning",
        name_ja: "企画",
      }),
    ).toBe("Planning");
    expect(
      localeName("ko-KR", {
        name: "Planning",
        name_ko: "기획",
      }),
    ).toBe("기획");

    expect(localeFromLanguage("ko")).toBe("ko-KR");
    expect(localeFromLanguage("en")).toBe("en-US");
    expect(localeFromLanguage("ja")).toBe("en-US");
    expect(localeFromLanguage("zh")).toBe("en-US");
  });

  it("useI18n languageOverride follows ko/en fallback policy", () => {
    let result: I18nContextValue = {
      language: "en",
      locale: "en-US",
      t: (text) => (typeof text === "string" ? text : text.en),
    };
    const Probe = ({ override }: { override?: string }) => {
      result = useI18n(override);
      return null;
    };

    const { rerender } = render(
      createElement(I18nProvider, {
        language: "ko",
        children: createElement(Probe, { override: "ja-JP" }),
      }),
    );

    expect(result.language).toBe("en");
    expect(result.locale).toBe("en-US");
    expect(
      result.t({
        ko: "ko-hello",
        en: "hello",
        ja: "konnichiwa",
        zh: "nihao",
      }),
    ).toBe("hello");

    rerender(
      createElement(I18nProvider, {
        language: "ko",
        children: createElement(Probe, { override: undefined }),
      }),
    );

    expect(result.language).toBe("ko");
    expect(result.locale).toBe("ko-KR");
    expect(
      result.t({
        ko: "ko-hello",
        en: "hello",
        ja: "konnichiwa",
        zh: "nihao",
      }),
    ).toBe("ko-hello");
  });
});
