import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

type RouteModule = typeof import("./catalog-routes.ts");

function makeInitialSkillsHtml(
  items: Array<{ source: string; skillId: string; name?: string; installs?: number }>,
): string {
  return `<!doctype html><html><body>initialSkills:${JSON.stringify(items)}</body></html>`;
}

function makeSitemapXml(total: number): string {
  const urls = Array.from({ length: total }, (_, index) => {
    const skillNumber = index + 1;
    return `<url><loc>https://skills.sh/acme/catalog/skill-${skillNumber}</loc></url>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${urls}</urlset>`;
}

async function createHarness(): Promise<{ app: express.Express; mod: RouteModule }> {
  vi.resetModules();
  const mod = await import("./catalog-routes.ts");
  const app = express();
  mod.registerSkillCatalogRoutes({ app } as any);
  return { app, mod };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CODEX_HOME;
});

describe("skill catalog routes", () => {
  it("returns the full sitemap-backed catalog with ranked overlays", async () => {
    const sitemapXml = makeSitemapXml(4000);
    const homeHtml = makeInitialSkillsHtml(
      Array.from({ length: 600 }, (_, index) => ({
        source: "acme/catalog",
        skillId: `skill-${index + 1}`,
        name: `Skill ${index + 1}`,
        installs: 10_000 - index,
      })),
    );
    const trendingHtml = makeInitialSkillsHtml([
      {
        source: "acme/catalog",
        skillId: "skill-2",
        name: "Skill 2",
        installs: 99_999,
      },
      {
        source: "acme/catalog",
        skillId: "skill-601",
        name: "Skill 601",
        installs: 5_000,
      },
    ]);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/sitemap.xml") {
        return new Response(sitemapXml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url === "https://skills.sh") {
        return new Response(homeHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://skills.sh/trending") {
        return new Response(trendingHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { app } = await createHarness();
    const response = await request(app).get("/api/skills").expect(200);

    expect(response.body.skills.length).toBeGreaterThanOrEqual(4000);

    const seedSkill = response.body.skills.find((skill: any) => skill.skillId === "donggri-codex-55-agentic-coding");
    expect(seedSkill).toMatchObject({
      repo: "donggri/skill-system",
      origin: "donggri",
      category: "codex-specialist",
      codexInstallable: true,
    });

    const ranked = response.body.skills.find((skill: any) => skill.skillId === "skill-2");
    expect(ranked).toMatchObject({
      repo: "acme/catalog",
      skillId: "skill-2",
      origin: "skills_sh",
      category: "external-catalog",
      isRanked: true,
      rank: 2,
      installs: 99_999,
    });

    const promotedFromTrending = response.body.skills.find((skill: any) => skill.skillId === "skill-601");
    expect(promotedFromTrending).toMatchObject({
      repo: "acme/catalog",
      skillId: "skill-601",
      isRanked: true,
      installs: 5_000,
    });

    const unranked = response.body.skills.find((skill: any) => skill.skillId === "skill-4000");
    expect(unranked).toMatchObject({
      repo: "acme/catalog",
      skillId: "skill-4000",
      isRanked: false,
      rank: 0,
      installs: 0,
    });
  });

  it("returns an empty catalog when all upstream sources fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network_down");
      }),
    );

    const { app } = await createHarness();
    const response = await request(app).get("/api/skills").expect(200);

    expect(response.body.skills.length).toBeGreaterThan(0);
    expect(response.body.skills.every((skill: any) => skill.origin === "donggri")).toBe(true);
  });

  it("serves cached results without re-fetching when the cache is warm", async () => {
    const sitemapXml = makeSitemapXml(3);
    const homeHtml = makeInitialSkillsHtml([
      { source: "acme/catalog", skillId: "skill-1", name: "Skill 1", installs: 100 },
    ]);
    const firstFetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://skills.sh/sitemap.xml") {
        return new Response(sitemapXml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url === "https://skills.sh") {
        return new Response(homeHtml, { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url === "https://skills.sh/trending") {
        return new Response(makeInitialSkillsHtml([]), { status: 200, headers: { "content-type": "text/html" } });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", firstFetchMock);

    const { app } = await createHarness();
    const first = await request(app).get("/api/skills").expect(200);
    expect(first.body.skills.length).toBeGreaterThanOrEqual(3);
    expect(firstFetchMock).toHaveBeenCalledTimes(3);

    const secondFetchMock = vi.fn(async () => {
      throw new Error("should_not_fetch_again");
    });
    vi.stubGlobal("fetch", secondFetchMock);

    const second = await request(app).get("/api/skills").expect(200);
    expect(second.body.skills.length).toBe(first.body.skills.length);
    expect(secondFetchMock).not.toHaveBeenCalled();
  });

  it("fails closed before a legacy catalog refresh can fetch or mutate cache state", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 200));
    vi.stubGlobal("fetch", fetchMock);
    const { app } = await createHarness();
    const response = await request(app)
      .post("/api/skills/refresh")
      .set("Authorization", "Bearer test-token")
      .expect(410);

    expect(response.type).toBe("application/problem+json");
    expect(response.body).toMatchObject({
      status: 410,
      code: "legacy_mutation_gone",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns local detail for Donggri seed skills", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network_down");
      }),
    );

    const { app } = await createHarness();
    const response = await request(app)
      .get("/api/skills/detail")
      .query({ source: "donggri/skill-system", skillId: "donggri-codex-skill-authoring" })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.detail).toMatchObject({
      title: "donggri-codex-skill-authoring",
    });
    expect(response.body.detail.installCommand).toContain("sync-codex-skills.ps1");
  });

  it("fails closed before legacy skill install headers can write to Codex home", async () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-codex-home-"));
    process.env.CODEX_HOME = codexHome;

    try {
      const { app } = await createHarness();
      const response = await request(app)
        .post("/api/skills/donggri/donggri-codex-skill-authoring/install-codex")
        .set("Authorization", "Bearer test-token")
        .set("x-donggri-local-action", "install-codex-skill")
        .set("x-csrf-token", "legacy-csrf-proof")
        .expect(410);

      expect(response.type).toBe("application/problem+json");
      expect(response.body).toMatchObject({
        status: 410,
        code: "legacy_mutation_gone",
      });
      expect(fs.existsSync(path.join(codexHome, "skills"))).toBe(false);
    } finally {
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });

  it("does not expose global-only Codex skill markdown through Donggri detail", async () => {
    const { app } = await createHarness();
    const response = await request(app)
      .get("/api/skills/detail")
      .query({ source: "donggri/skill-system", skillId: "donggri-gemini-nano" })
      .expect(200);

    expect(response.body).toEqual({ ok: false, detail: null });
  });
});
