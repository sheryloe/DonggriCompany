export type OfficeThemeVariant = "light" | "dark";

export type ThemeTokenSet = {
  shell: string;
  panel: string;
  panelStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  success: string;
};

export const officeThemeTokens: Record<OfficeThemeVariant, ThemeTokenSet> = {
  light: {
    shell: "#f6f1e8",
    panel: "rgba(255, 251, 244, 0.92)",
    panelStrong: "rgba(255, 253, 248, 0.98)",
    border: "rgba(88, 71, 49, 0.18)",
    borderStrong: "rgba(88, 71, 49, 0.28)",
    text: "#2b241c",
    muted: "#756654",
    accent: "#175b72",
    accentSoft: "rgba(23, 91, 114, 0.12)",
    success: "#2c6e49"
  },
  dark: {
    shell: "#0f1720",
    panel: "rgba(16, 24, 34, 0.9)",
    panelStrong: "rgba(10, 16, 24, 0.96)",
    border: "rgba(106, 136, 162, 0.22)",
    borderStrong: "rgba(106, 136, 162, 0.34)",
    text: "#eff6ff",
    muted: "#90a9c0",
    accent: "#8dd8ff",
    accentSoft: "rgba(141, 216, 255, 0.14)",
    success: "#9cff93"
  }
};
