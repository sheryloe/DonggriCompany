import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  I18nProvider,
  detectBrowserLanguage,
  type I18nContextValue,
  localeFromLanguage,
  localeName,
  normalizeLanguage,
  pickLang,
  useI18n,
  type LangText,
} from "./i18n";

describe("i18n helpers", () => {
  it("forces Korean display regardless of input locale", () => {
    expect(normalizeLanguage("ko-KR")).toBe("ko");
    expect(normalizeLanguage("en_US")).toBe("ko");
    expect(normalizeLanguage("ja-JP")).toBe("ko");
    expect(normalizeLanguage("zh-CN")).toBe("ko");
    expect(normalizeLanguage("fr-FR")).toBe("ko");
    expect(normalizeLanguage(undefined)).toBe("ko");
    expect(detectBrowserLanguage()).toBe("ko");
  });

  it("localeName/pickLang/localeFromLanguage always prefer Korean display text", () => {
    const text: LangText = {
      ko: "안녕하세요",
      en: "hello",
    };
    expect(pickLang("ko", text)).toBe("안녕하세요");
    expect(pickLang("en", text)).toBe("안녕하세요");
    expect(pickLang("ja", text)).toBe("안녕하세요");
    expect(pickLang("zh", text)).toBe("안녕하세요");

    expect(
      localeName("en", {
        name: "Planning",
        name_ko: "기획",
      }),
    ).toBe("기획");
    expect(localeFromLanguage("ko")).toBe("ko-KR");
    expect(localeFromLanguage("en")).toBe("ko-KR");
  });

  it("useI18n ignores non-Korean overrides and renders Korean messages", () => {
    let result: I18nContextValue = {
      language: "ko",
      locale: "ko-KR",
      t: (text) => (typeof text === "string" ? text : text.ko),
    };
    const Probe = ({ override }: { override?: string }) => {
      result = useI18n(override);
      return null;
    };

    render(
      createElement(I18nProvider, {
        language: "en",
        children: createElement(Probe, { override: "ja-JP" }),
      }),
    );

    expect(result.language).toBe("ko");
    expect(result.locale).toBe("ko-KR");
    expect(
      result.t({
        ko: "한국어",
        en: "English",
        ja: "Japanese",
        zh: "Chinese",
      }),
    ).toBe("한국어");
  });
});
