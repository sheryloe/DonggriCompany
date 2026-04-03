import { createServer } from "./app.js";

const server = createServer();

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
