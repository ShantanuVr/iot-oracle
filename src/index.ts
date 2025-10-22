import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/index.js';
import { logger, addRequestId, logRequest } from './util/logger.js';
import { metricsMiddleware, initializeMetrics } from './util/metrics.js';
import { registerPublicRoutes } from './api/public.js';
import { registerAdminRoutes } from './api/admin.js';
import { ingestTelemetry } from './ingest/http.js';
import { MQTTIngester } from './ingest/mqtt.js';
import { createWorkers, scheduleRecurringJobs, shutdownQueues } from './util/scheduler.js';
import { prisma, disconnectDatabase } from './db.js';

// Extend Fastify instance types
declare module 'fastify' {
  interface FastifyInstance {
    mqttIngester: MQTTIngester;
  }
}

const createServer = async () => {
  const fastify = Fastify({
    logger: logger.child({ component: 'server' }),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => Math.random().toString(36).substring(2, 15),
  });

  // Initialize metrics
  initializeMetrics();

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    origin: false, // Disable CORS by default as specified
  });

  await fastify.register(rateLimit, {
    max: 1000, // requests per timeWindow
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Rate limit exceeded',
      message: 'Too many requests',
    }),
  });

  // Register middleware
  fastify.addHook('preHandler', addRequestId);
  fastify.addHook('preHandler', logRequest);

  // Register metrics middleware
  metricsMiddleware(fastify);

  // Register routes
  await fastify.register(registerPublicRoutes);
  await fastify.register(registerAdminRoutes);

  // Register ingestion endpoint
  fastify.post('/v1/ingest', ingestTelemetry);

  // Initialize MQTT ingester
  const mqttIngester = new MQTTIngester(logger.child({ component: 'mqtt' }));
  fastify.decorate('mqttIngester', mqttIngester);

  // Initialize job workers
  const workers = createWorkers();

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    
    try {
      // Stop accepting new requests
      await fastify.close();
      
      // Disconnect MQTT
      await mqttIngester.disconnect();
      
      // Shutdown job queues
      await shutdownQueues();
      
      // Disconnect database
      await disconnectDatabase();
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return fastify;
};

const start = async () => {
  try {
    const server = await createServer();
    
    // Start MQTT ingester
    await server.mqttIngester.connect();
    
    // Schedule recurring jobs
    scheduleRecurringJobs();
    
    // Start server
    const address = await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });
    
    logger.info({ address }, 'Server started');
    
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Failed to start server');
    process.exit(1);
  }
};

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { createServer, start };
