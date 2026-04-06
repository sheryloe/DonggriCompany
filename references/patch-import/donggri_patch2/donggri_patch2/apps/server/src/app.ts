import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";

import { registerErrorHandler } from "./errors.js";
import { registerAgentModelRoutes } from "./routes/agent-models.js";
import { registerAccountPoolRoutes } from "./routes/account-pools.js";
import { registerBootstrapRoutes } from "./routes/bootstrap.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerOAuthRoutes } from "./routes/oauth.js";
import { registerProviderUsageProbeRoutes } from "./routes/provider-usage-probes.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerRuntimeProfileRoutes } from "./routes/runtime-profiles.js";
import { registerRuntimeRouterRoutes } from "./routes/runtime-router.js";
import { registerRolePackRoutes } from "./routes/rolepacks.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerMeetingRoutes } from "./routes/meetings.js";
import { registerCliExecutionRoutes } from "./routes/cli-execution.js";
import { registerOfficeWs } from "./ws/office-ws.js";

export const createServer = async (): Promise<FastifyInstance> => {
  const server = Fastify({ logger: true });

  await server.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:7777",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });

  registerErrorHandler(server);
  registerHealthRoutes(server);
  registerBootstrapRoutes(server);
  registerProviderRoutes(server);
  registerRolePackRoutes(server);
  registerAccountPoolRoutes(server);
  registerRuntimeProfileRoutes(server);
  registerRuntimeRouterRoutes(server);
  registerProviderUsageProbeRoutes(server);
  registerAgentModelRoutes(server);
  registerOAuthRoutes(server);
  registerAgentRoutes(server);
  registerMeetingRoutes(server);
  registerCliExecutionRoutes(server);

  await registerOfficeWs(server);

  return server;
};
