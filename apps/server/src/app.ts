import Fastify, { type FastifyInstance } from "fastify";

import { registerErrorHandler } from "./errors.js";
import { registerAccountPoolRoutes } from "./routes/account-pools.js";
import { registerBootstrapRoutes } from "./routes/bootstrap.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProviderUsageProbeRoutes } from "./routes/provider-usage-probes.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerRuntimeProfileRoutes } from "./routes/runtime-profiles.js";
import { registerRuntimeRouterRoutes } from "./routes/runtime-router.js";
import { registerRolePackRoutes } from "./routes/rolepacks.js";

export const createServer = (): FastifyInstance => {
  const server = Fastify({ logger: true });

  registerErrorHandler(server);
  registerHealthRoutes(server);
  registerBootstrapRoutes(server);
  registerProviderRoutes(server);
  registerRolePackRoutes(server);
  registerAccountPoolRoutes(server);
  registerRuntimeProfileRoutes(server);
  registerRuntimeRouterRoutes(server);
  registerProviderUsageProbeRoutes(server);

  return server;
};
