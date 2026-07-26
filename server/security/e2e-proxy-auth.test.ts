import { describe, expect, it } from "vitest";

import { shouldInjectE2EProxyAuth } from "./e2e-proxy-auth.ts";

const basePolicy = {
  token: "ephemeral-e2e-token",
  isolatedRuntime: true,
  apiTarget: "http://127.0.0.1:8790",
  wsTarget: "ws://127.0.0.1:8790",
};

describe("E2E Vite proxy auth policy", () => {
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
    "allows token injection only for a loopback client address (%s)",
    (remoteAddress) => {
      expect(shouldInjectE2EProxyAuth({ ...basePolicy, remoteAddress })).toBe(true);
    },
  );

  it("rejects a non-loopback client even when the E2E environment variables are present", () => {
    expect(
      shouldInjectE2EProxyAuth({
        ...basePolicy,
        remoteAddress: "192.0.2.10",
      }),
    ).toBe(false);
  });

  it("rejects a non-loopback upstream target", () => {
    expect(
      shouldInjectE2EProxyAuth({
        ...basePolicy,
        apiTarget: "http://192.0.2.20:8790",
        remoteAddress: "127.0.0.1",
      }),
    ).toBe(false);
  });

  it("rejects token injection outside the isolated E2E runtime", () => {
    expect(
      shouldInjectE2EProxyAuth({
        ...basePolicy,
        isolatedRuntime: false,
        remoteAddress: "127.0.0.1",
      }),
    ).toBe(false);
  });
});
