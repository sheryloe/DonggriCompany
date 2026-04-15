import { afterEach, describe, expect, it, vi } from "vitest";
import { DonggriHttpClient } from "../api/httpClient";

describe("DonggriHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("falls back from 8790 to 7777 for localhost bootstrap", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.includes(":8790")) {
        throw new Error("ECONNREFUSED");
      }

      return new Response(JSON.stringify({ ok: true, csrf_token: "csrf-test" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "donggri_session=test; Path=/; HttpOnly",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = new DonggriHttpClient(() => ({
      serverUrl: "http://127.0.0.1:8790",
      apiToken: "",
      autoConnect: true,
      defaultProjectBindingMode: "match-or-create",
    }));

    await expect(client.bootstrapSession()).resolves.toBe(true);
    expect(calls).toEqual([
      "http://127.0.0.1:8790/api/auth/session",
      "http://127.0.0.1:7777/api/auth/session",
    ]);
    expect(client.getEffectiveBaseUrl()).toBe("http://127.0.0.1:7777");
  });
});
