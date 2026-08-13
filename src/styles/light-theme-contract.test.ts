import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles/index.part01.css"), "utf8");

describe("light theme colored-action contrast contract", () => {
  it("keeps white text on solid indigo actions", () => {
    expect(styles).toContain('[data-theme="light"] .bg-indigo-600.text-white');
    expect(styles).toContain('[data-theme="light"] .bg-indigo-700.text-white');
    expect(styles).toMatch(/\.bg-indigo-700\.text-white[\s\S]*?color:\s*#ffffff\s*!important/);
  });
});
