import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { initializeCollabLanguagePolicy } from "./language-policy.ts";

function setupDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_ko TEXT NOT NULL DEFAULT '',
      name_ja TEXT NOT NULL DEFAULT '',
      name_zh TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}

describe("language-policy detectTargetDepartments", () => {
  it("settings.language가 en이어도 한글 directive는 한국어로 응답한다", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"en\"')").run();

      const { resolveLang } = initializeCollabLanguagePolicy({ db });

      expect(resolveLang("기본적인 계산이 깔끔하게 만들어봐")).toBe("ko");
      expect(resolveLang("hello")).toBe("en");
    } finally {
      db.close();
    }
  });

  it("settings.language가 ko이면 영어 입력도 사용자 노출 언어를 한국어로 유지한다", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"ko\"')").run();

      const { getPreferredLanguage, resolveLang } = initializeCollabLanguagePolicy({ db });

      expect(getPreferredLanguage()).toBe("ko");
      expect(resolveLang("hello")).toBe("ko");
    } finally {
      db.close();
    }
  });

  it("짧은 한글 생성 요청도 delegation 대상으로 판단한다", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"ko\"')").run();

      const { analyzeDirectivePolicy, shouldExecuteDirectiveDelegation } = initializeCollabLanguagePolicy({ db });

      expect(shouldExecuteDirectiveDelegation("기본적인 계산이 깔끔하게 만들어봐")).toBe(true);
      expect(analyzeDirectivePolicy("기본적인 계산이 깔끔하게 만들어봐")).toMatchObject({
        skipDelegation: false,
        skipDelegationReason: null,
      });
    } finally {
      db.close();
    }
  });

  it("짧은 인사 directive는 delegation을 생략한다", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"ko\"')").run();

      const { analyzeDirectivePolicy, shouldExecuteDirectiveDelegation } = initializeCollabLanguagePolicy({ db });

      expect(shouldExecuteDirectiveDelegation("안녕")).toBe(false);
      expect(analyzeDirectivePolicy("안녕")).toMatchObject({
        skipDelegation: true,
        skipDelegationReason: "no_task",
      });
    } finally {
      db.close();
    }
  });

  it("한글 부서명/별칭으로 대상 부서를 감지한다", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"ko\"')").run();
      db.prepare(
        "INSERT INTO departments (id, name, name_ko, name_ja, name_zh) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      ).run(
        "planning",
        "Pre-production",
        "프리프로덕션팀",
        "Planning Team",
        "Planning Team",
        "dev",
        "Scene Engine",
        "씬엔진팀",
        "Development Team",
        "Development Team",
      );

      const { detectTargetDepartments } = initializeCollabLanguagePolicy({ db });
      const found = detectTargetDepartments("프리프로덕션팀과 씬엔진팀이 콘티를 준비해주세요");

      expect(found).toContain("planning");
      expect(found).toContain("dev");
    } finally {
      db.close();
    }
  });

  it("팀/부서 접미사 없이도 부서명을 감지한다", () => {
    const db = setupDb();
    try {
      db.prepare("INSERT INTO settings (key, value) VALUES ('language', '\"ko\"')").run();
      db.prepare("INSERT INTO departments (id, name, name_ko, name_ja, name_zh) VALUES (?, ?, ?, ?, ?)").run(
        "planning",
        "Pre-production",
        "프리프로덕션팀",
        "Planning Team",
        "Planning Team",
      );

      const { detectTargetDepartments } = initializeCollabLanguagePolicy({ db });
      const found = detectTargetDepartments("프리프로덕션 일정부터 먼저 검토해주세요");

      expect(found).toContain("planning");
    } finally {
      db.close();
    }
  });
});
