import Fastify from 'fastify';
import { getDb } from '@prn/db';
import { setupSSE, broadcastEvent } from './events/sse';

const fastify = Fastify({ logger: true });

fastify.get('/ping', async (request, reply) => {
  broadcastEvent('ping', { msg: 'ping received' });
  return { status: 'ok', orchestrator: 'running' };
});

setupSSE(fastify);

const start = async () => {
  try {
    getDb();
    await fastify.listen({ port: 3001 });
    console.log('Orchestrator daemon running on http://localhost:3001');

    // Test SSE heartbeat
    setInterval(() => {
      broadcastEvent('heartbeat', { uptime: process.uptime() });
    }, 10000);

  } catch (err) {
    fastify.log.error(err);
  }
};

start();
