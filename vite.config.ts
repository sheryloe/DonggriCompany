import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { shouldInjectE2EProxyAuth } from "./server/security/e2e-proxy-auth.ts";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8790";
const wsTarget = process.env.VITE_WS_PROXY_TARGET ?? apiTarget.replace(/^http/i, "ws");
const e2eProxyAuthToken = String(process.env.E2E_PROXY_API_AUTH_TOKEN ?? "").trim();
const isolatedE2ERuntime = process.env.E2E_ISOLATED_RUNTIME === "1";

type ProxyErrorResponse = ServerResponse<IncomingMessage> | Socket;
type ProxyRequestLike = {
  setHeader(name: string, value: string): void;
};
type ProxyLike = {
  on(
    event: "error",
    listener: (err: NodeJS.ErrnoException, req: IncomingMessage, res: ProxyErrorResponse) => void,
  ): void;
  on(
    event: "proxyReq",
    listener: (proxyReq: ProxyRequestLike, req: IncomingMessage, res: ServerResponse<IncomingMessage>) => void,
  ): void;
  on(event: "proxyReqWs", listener: (proxyReq: ProxyRequestLike, req: IncomingMessage, socket: Socket) => void): void;
};

const isServerResponse = (res: ProxyErrorResponse): res is ServerResponse<IncomingMessage> => {
  return typeof (res as ServerResponse<IncomingMessage>).writeHead === "function";
};

const configureProxy = (proxy: ProxyLike) => {
  proxy.on("error", (err: NodeJS.ErrnoException, _req, res) => {
    if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
    if (res && isServerResponse(res) && !res.headersSent) {
      res.writeHead(502);
      res.end();
    }
  });
  proxy.on("proxyReq", (proxyReq, req) => {
    if (
      shouldInjectE2EProxyAuth({
        token: e2eProxyAuthToken,
        isolatedRuntime: isolatedE2ERuntime,
        apiTarget,
        wsTarget,
        remoteAddress: req.socket.remoteAddress,
      })
    ) {
      proxyReq.setHeader("authorization", `Bearer ${e2eProxyAuthToken}`);
    }
  });
  proxy.on("proxyReqWs", (proxyReq, req, socket) => {
    if (
      shouldInjectE2EProxyAuth({
        token: e2eProxyAuthToken,
        isolatedRuntime: isolatedE2ERuntime,
        apiTarget,
        wsTarget,
        remoteAddress: req.socket.remoteAddress,
      })
    ) {
      proxyReq.setHeader("authorization", `Bearer ${e2eProxyAuthToken}`);
    }
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
    });
  });
};

const manualChunks = (id: string): string | undefined => {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("/node_modules/@pixi/")) {
    const match = id.match(/\/node_modules\/(@pixi\/[^/]+)\//);
    if (match) return `vendor-${match[1].replace("@pixi/", "pixi-")}`;
  }
  if (id.includes("/node_modules/pixi.js/")) return "vendor-pixi";
  if (id.includes("/node_modules/pptxgenjs/")) return "vendor-pptx";
  if (id.includes("/node_modules/react-router-dom/") || id.includes("/node_modules/react-router/"))
    return "vendor-router";
  if (
    id.includes("/node_modules/react-dom/") ||
    id.includes("/node_modules/react/") ||
    id.includes("/node_modules/scheduler/")
  )
    return "vendor-react";
  return undefined;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: isolatedE2ERuntime ? "127.0.0.1" : undefined,
    allowedHosts: [".ts.net"],
    watch: {
      ignored: ["**/.climpire-worktrees/**", "**/.tmp/e2e-runtime/**"],
    },
    proxy: {
      "/api": {
        target: apiTarget,
        configure: configureProxy,
      },
      "/ws": {
        target: wsTarget,
        ws: true,
        configure: configureProxy,
      },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
