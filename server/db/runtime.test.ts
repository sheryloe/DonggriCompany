import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importRuntimeModule() {
  vi.resetModules();
  return import("./runtime.ts");
}

describe("db runtime", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("readNonNegativeIntEnv는 음수/비수치 입력을 fallback으로 처리한다", async () => {
    const runtime = await importRuntimeModule();

    delete process.env.TEST_NON_NEGATIVE_INT;
    expect(runtime.readNonNegativeIntEnv("TEST_NON_NEGATIVE_INT", 7)).toBe(7);

    process.env.TEST_NON_NEGATIVE_INT = "12.9";
    expect(runtime.readNonNegativeIntEnv("TEST_NON_NEGATIVE_INT", 0)).toBe(12);

    process.env.TEST_NON_NEGATIVE_INT = "-5";
    expect(runtime.readNonNegativeIntEnv("TEST_NON_NEGATIVE_INT", 3)).toBe(3);

    process.env.TEST_NON_NEGATIVE_INT = "not-a-number";
    expect(runtime.readNonNegativeIntEnv("TEST_NON_NEGATIVE_INT", 9)).toBe(9);
  });

  it("SQLITE/REVIEW guardrail 상수가 상한/하한으로 clamp 된다", async () => {
    process.env.SQLITE_BUSY_RETRY_MAX_ATTEMPTS = "999";
    process.env.REVIEW_MAX_ROUNDS = "1";
    process.env.REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND = "99";

    const runtime = await importRuntimeModule();
    expect(runtime.SQLITE_BUSY_RETRY_MAX_ATTEMPTS).toBe(20);
    expect(runtime.REVIEW_MAX_ROUNDS).toBe(3);
    expect(runtime.REVIEW_MAX_REVISION_SIGNALS_PER_DEPT_PER_ROUND).toBe(10);
  });

  it("initializeDatabaseRuntime는 DB를 열기 전에 누락된 공백/비ASCII 부모 경로를 만든다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-empire-runtime-test-"));
    temporaryDirectories.push(tmpDir);
    const dbPath = path.join(tmpDir, "새 데이터 폴더", "중첩 경로", "test.sqlite");
    const logsDir = path.join(tmpDir, "logs");
    process.env.DB_PATH = dbPath;
    process.env.LOGS_DIR = logsDir;

    expect(fs.existsSync(path.dirname(dbPath))).toBe(false);

    const runtime = await importRuntimeModule();
    const initialized = runtime.initializeDatabaseRuntime();

    expect(initialized.dbPath).toBe(dbPath);
    expect(initialized.logsDir).toBe(logsDir);
    expect(fs.existsSync(path.dirname(dbPath))).toBe(true);
    expect(initialized.db.prepare("SELECT 1 AS ready").get()).toEqual({ ready: 1 });
    expect(fs.existsSync(logsDir)).toBe(true);

    initialized.db.close();
  });

  it("APP_DATA_DIR만 지정된 dev:local 클린 스타트에서도 기본 DB 부모를 먼저 만든다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-app-data-test-"));
    temporaryDirectories.push(tmpDir);
    const appDataDir = path.join(tmpDir, "새 앱 데이터", "runtime");
    delete process.env.DB_PATH;
    process.env.APP_DATA_DIR = appDataDir;

    const runtime = await importRuntimeModule();
    const initialized = runtime.initializeDatabaseRuntime();

    expect(initialized.dbPath).toBe(path.join(appDataDir, "claw-empire.sqlite"));
    expect(fs.existsSync(appDataDir)).toBe(true);
    expect(fs.existsSync(initialized.dbPath)).toBe(true);

    initialized.db.close();
  });

  it("ensureDatabaseParentDirectory는 메모리 DB에 파일시스템 경로를 만들지 않는다", async () => {
    const runtime = await importRuntimeModule();

    expect(runtime.ensureDatabaseParentDirectory(":memory:")).toBeNull();
  });
});
