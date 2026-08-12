import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSpriteRoutes } from "./sprites.ts";

function dataUrl(label: string): string {
  return `data:image/png;base64,${Buffer.from(label).toString("base64")}`;
}

describe("sprite routes", () => {
  let projectDir = "";
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "donggri-sprite-register-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(projectDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function createApp() {
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    registerSpriteRoutes({ app } as any);
    return app;
  }

  it("registers all four directions into the Visual V2 pack namespace", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/sprites/register")
      .send({
        spriteNumber: 77,
        packKey: "donggri_visual_v2",
        sprites: {
          D: dataUrl("down"),
          L: dataUrl("left"),
          B: dataUrl("back"),
          R: dataUrl("right"),
        },
      })
      .expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      spriteNumber: 77,
      packKey: "donggri_visual_v2",
    });
    expect(response.body.saved).toContain("donggri-visual-v2/77-B-3.png");
    for (const direction of ["D", "L", "B", "R"]) {
      for (const frame of [1, 2, 3]) {
        expect(
          fs.existsSync(path.join(projectDir, "public", "sprites", "donggri-visual-v2", `77-${direction}-${frame}.png`)),
        ).toBe(true);
      }
    }
  });

  it("keeps the legacy namespace as the default", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/sprites/register")
      .send({
        spriteNumber: 9,
        sprites: {
          B: dataUrl("back"),
        },
      })
      .expect(200);

    expect(response.body.packKey).toBe("legacy");
    expect(response.body.saved).toEqual(["9-B-1.png", "9-B-2.png", "9-B-3.png"]);
    expect(fs.existsSync(path.join(projectDir, "public", "sprites", "9-B-3.png"))).toBe(true);
  });

  it("rejects unknown pack keys instead of silently writing to legacy", async () => {
    const app = createApp();
    await request(app)
      .post("/api/sprites/register")
      .send({
        spriteNumber: 10,
        packKey: "future-pack",
        sprites: {
          D: dataUrl("down"),
        },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.error).toBe("invalid_pack_key");
      });

    expect(fs.existsSync(path.join(projectDir, "public", "sprites", "10-D-1.png"))).toBe(false);
  });
});
