import { describe, expect, it } from "vitest";

import {
  DEFAULT_OFFICE_LOCALE,
  createOfficeTranslator,
  loadOfficeLocale,
  resolveOfficeLocale,
  saveOfficeLocale
} from "./office-i18n";

describe("office-i18n", () => {
  it("returns Korean as default locale", () => {
    expect(resolveOfficeLocale(undefined)).toBe(DEFAULT_OFFICE_LOCALE);
    expect(resolveOfficeLocale("invalid")).toBe(DEFAULT_OFFICE_LOCALE);
  });

  it("translates with fallback and interpolation", () => {
    const ko = createOfficeTranslator("ko");
    const zh = createOfficeTranslator("zh");
    expect(ko("board.agentMonitorTitle")).toBe("에이전트 모니터");
    expect(zh("widget.runtime.confirmDelete")).toBe("Confirm Delete");
    expect(zh("board.badge.grid", { cols: 30, rows: 18 })).toBe("grid 30x18");
  });

  it("loads and saves locale via storage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      }
    };

    expect(loadOfficeLocale(storage)).toBe(DEFAULT_OFFICE_LOCALE);
    saveOfficeLocale("zh", storage);
    expect(loadOfficeLocale(storage)).toBe("zh");
  });
});


