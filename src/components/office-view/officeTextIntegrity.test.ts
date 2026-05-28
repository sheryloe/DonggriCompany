import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const officeTextFiles = [
  "src/components/OfficeView.tsx",
  "src/components/office-view/buildScene.ts",
  "src/components/office-view/buildScene-break-room.ts",
  "src/components/office-view/buildScene-floor-access.ts",
  "src/components/office-view/officeFloorPlan.ts",
  "src/components/Sidebar.tsx",
  "src/components/Dashboard.tsx",
  "src/app/LiveOperationsRail.tsx",
  "src/app/useAppLabels.ts",
];

const brokenTextPatterns = [
  /\uFFFD/,
  /[\uF900-\uFAFF]/,
  /(?:揶|獄|諭|踰|꾨|쒕|먯|묒|댁|븘|덈|땲|湲|濡|怨|媛|댄|섏|좏|꾩|쓬|쨌|孃|瘟)/,
];

const firstScreenForbiddenText = [
  "타이쿤",
  "왕국",
  "CloudOps",
  "Pixel map",
  "Live Ops",
  "Department rooms",
  "RPG COMMAND MAP",
  "1F",
  "RF",
  "2F",
  "3F",
  "4F",
];

describe("8bit office Korean text integrity", () => {
  it("does not contain mojibake in first-screen office files", () => {
    for (const file of officeTextFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const pattern of brokenTextPatterns) {
        expect(text, `${file} contains broken text pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("does not expose rejected tycoon, RPG, CloudOps, or floor-code copy on the first screen path", () => {
    const firstScreenFiles = [
      "src/components/OfficeView.tsx",
      "src/components/office-view/buildScene.ts",
      "src/components/office-view/buildScene-break-room.ts",
      "src/components/office-view/buildScene-floor-access.ts",
      "src/components/office-view/officeFloorPlan.ts",
      "src/components/Sidebar.tsx",
      "src/components/Dashboard.tsx",
      "src/app/LiveOperationsRail.tsx",
      "src/app/useAppLabels.ts",
    ];

    for (const file of firstScreenFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const label of firstScreenForbiddenText) {
        expect(text, `${file} still contains forbidden first-screen copy ${label}`).not.toContain(label);
      }
    }
  });
});
