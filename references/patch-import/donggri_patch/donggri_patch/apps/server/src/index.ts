import { createServer } from "./app.js";

const start = async (): Promise<void> => {
  const server = await createServer();
  try {
    await server.listen({
      port: Number(process.env.PORT ?? 4315),
      host: "0.0.0.0",
    });
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
};

void start();
