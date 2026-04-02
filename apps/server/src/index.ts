import Fastify from "fastify";

import { registerErrorHandler } from "./errors.js";
import { registerAccountPoolRoutes } from "./routes/account-pools.js";
import { registerBootstrapRoutes } from "./routes/bootstrap.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProviderUsageProbeRoutes } from "./routes/provider-usage-probes.js";
import { registerProviderRoutes } from "./routes/providers.js";
import { registerRuntimeRouterRoutes } from "./routes/runtime-router.js";
import { registerRolePackRoutes } from "./routes/rolepacks.js";

const server = Fastify({ logger: true });

registerErrorHandler(server);
registerHealthRoutes(server);
registerBootstrapRoutes(server);
registerProviderRoutes(server);
registerRolePackRoutes(server);
registerAccountPoolRoutes(server);
registerRuntimeRouterRoutes(server);
registerProviderUsageProbeRoutes(server);

const start = async (): Promise<void> => {
  try {
    await server.listen({
      port: 4315,
      host: "0.0.0.0"
    });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

void start();
