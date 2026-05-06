import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const officeTextFiles = [
  "src/components/OfficeView.tsx",
  "src/components/office-view/officeFloorPlan.ts",
  "src/components/office-view/buildScene-floor-access.ts",
  "src/components/office-view/themes-locale.ts",
];

const brokenTextPatterns = [/\uFFFD/, /\?\?\?/, /\u5360/, /[\u3131-\u318E]\?/, /\?[\u3131-\u318E]/, /[怨濡湲媛蹂諛吏]/];

describe("office Korean text integrity", () => {
  it("does not contain mojibake in visible office surface files", () => {
    for (const file of officeTextFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      for (const pattern of brokenTextPatterns) {
        expect(text, `${file} contains broken text pattern ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
