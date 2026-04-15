import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

type RouteModule = typeof import("./catalog-routes.ts");

function makeInitialSkillsHtml(items: Array<{ source: string; skillId: string; name?: string; installs?: number }>): string {
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

    expect(response.body.skills).toHaveLength(4000);

    const ranked = response.body.skills.find((skill: any) => skill.skillId === "skill-2");
    expect(ranked).toMatchObject({
      repo: "acme/catalog",
      skillId: "skill-2",
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

    expect(response.body.skills).toEqual([]);
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
    expect(first.body.skills).toHaveLength(3);
    expect(firstFetchMock).toHaveBeenCalledTimes(3);

    const secondFetchMock = vi.fn(async () => {
      throw new Error("should_not_fetch_again");
    });
    vi.stubGlobal("fetch", secondFetchMock);

    const second = await request(app).get("/api/skills").expect(200);
    expect(second.body.skills).toHaveLength(3);
    expect(secondFetchMock).not.toHaveBeenCalled();
  });
});
