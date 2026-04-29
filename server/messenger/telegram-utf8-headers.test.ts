import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

const TELEGRAM_SEND_FILES = [
  "server/gateway/client.ts",
  "server/messenger/telegram-receiver.ts",
  "server/modules/routes/collab.ts",
];

const INBOX_FORWARD_FILES = [
  "server/messenger/telegram-receiver.ts",
  "server/messenger/gmail-intake-receiver.ts",
  "server/messenger/calendar-intake-receiver.ts",
  "server/messenger/discord-receiver.ts",
];

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function findTelegramPostsMissingUtf8(relativePath: string): string[] {
  const lines = readSource(relativePath).split(/\r?\n/);
  const missing: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("api.telegram.org")) continue;
    const block = lines.slice(index, index + 12).join("\n");
    if (block.includes('method: "POST"') && !block.includes("application/json; charset=utf-8")) {
      missing.push(`${relativePath}:${index + 1}`);
    }
  }
  return missing;
}

describe("telegram utf-8 transport guard", () => {
  it("marks every Telegram Bot API POST JSON payload as UTF-8", () => {
    const missing = TELEGRAM_SEND_FILES.flatMap(findTelegramPostsMissingUtf8);
    expect(missing).toEqual([]);
  });

  it("does not forward messenger inbox JSON with an ambiguous charset", () => {
    const offenders = INBOX_FORWARD_FILES.flatMap((relativePath) => {
      const source = readSource(relativePath);
      return [...source.matchAll(/["']content-type["']\s*:\s*["']application\/json["']/g)].map(
        (match) => `${relativePath}:${source.slice(0, match.index).split(/\r?\n/).length}`,
      );
    });

    expect(offenders).toEqual([]);
  });
});
