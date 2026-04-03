import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();

export function setupSSE(fastify: FastifyInstance) {
  fastify.get('/events', (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const listener = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    eventBus.on('broadcast', listener);

    request.raw.on('close', () => {
      eventBus.off('broadcast', listener);
    });
  });
}

export function broadcastEvent(eventType: string, payload: any) {
  eventBus.emit('broadcast', { type: eventType, payload, ts: new Date().toISOString() });
}
