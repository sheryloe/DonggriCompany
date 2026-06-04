import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const firstScreenFiles = [
  "src/components/OfficeView.tsx",
  "src/components/office-view/buildScene.ts",
  "src/components/office-view/buildScene-activity-spaces.ts",
  "src/components/office-view/buildScene-break-room.ts",
  "src/components/office-view/buildScene-departments.ts",
  "src/components/office-view/buildScene-floor-access.ts",
  "src/components/office-view/officeActivitySpaces.ts",
  "src/components/office-view/officeFloorPlan.ts",
  "src/components/office-view/officeOperationalRealism.ts",
  "src/components/office-view/officeWorkplaceDensity.ts",
  "src/components/office-view/themes-locale.ts",
  "src/components/Sidebar.tsx",
  "src/components/Dashboard.tsx",
  "src/app/LiveOperationsRail.tsx",
  "src/app/useAppLabels.ts",
];

const brokenTextPatterns = [
  /\uFFFD/,
  /[\uF900-\uFAFF]/,
  /[\u4E00-\u9FFF]/,
  /(?:獄|甕|袁|癒|臾|釉|疫|嚥|揶|醫|夷|耶|湲|寃|怨|踰|蹂|援|媛|諛|濡|由|쒖|댁|곗|꾨|뱀|쓽)/,
];

const firstScreenForbiddenText = [
  "RPG",
  "왕국",
  "타이쿤",
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
    for (const file of firstScreenFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const pattern of brokenTextPatterns) {
        expect(text, `${file} contains broken text pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("does not expose rejected metaphor or floor-code copy on the first screen path", () => {
    for (const file of firstScreenFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const label of firstScreenForbiddenText) {
        expect(text, `${file} still contains forbidden first-screen copy ${label}`).not.toContain(label);
      }
    }
  });
});
