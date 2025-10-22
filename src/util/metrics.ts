import { register, Counter, Histogram, Gauge } from 'prom-client';
import { FastifyInstance } from 'fastify';

// Metrics definitions
export const metrics = {
  // Counters
  ingestRowsTotal: new Counter({
    name: 'oracle_ingest_rows_total',
    help: 'Total number of telemetry rows ingested',
    labelNames: ['source', 'site_id'],
  }),

  digestBuiltTotal: new Counter({
    name: 'oracle_digest_built_total',
    help: 'Total number of daily digests built',
    labelNames: ['site_id'],
  }),

  anchorSuccessTotal: new Counter({
    name: 'oracle_anchor_success_total',
    help: 'Total number of successful anchor operations',
    labelNames: ['site_id'],
  }),

  anchorFailureTotal: new Counter({
    name: 'oracle_anchor_failure_total',
    help: 'Total number of failed anchor operations',
    labelNames: ['site_id', 'error_type'],
  }),

  // Histograms
  jobDurationSeconds: new Histogram({
    name: 'oracle_job_duration_seconds',
    help: 'Duration of aggregation jobs in seconds',
    labelNames: ['type', 'site_id'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  }),

  requestDurationSeconds: new Histogram({
    name: 'oracle_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),

  // Gauges
  activeConnections: new Gauge({
    name: 'oracle_active_connections',
    help: 'Number of active connections',
    labelNames: ['type'],
  }),

  databaseConnections: new Gauge({
    name: 'oracle_database_connections',
    help: 'Number of database connections',
    labelNames: ['state'],
  }),

  mqttConnectionStatus: new Gauge({
    name: 'oracle_mqtt_connection_status',
    help: 'MQTT connection status (1 = connected, 0 = disconnected)',
  }),

  adapterConnectionStatus: new Gauge({
    name: 'oracle_adapter_connection_status',
    help: 'Adapter API connection status (1 = connected, 0 = disconnected)',
  }),
};

// Metrics middleware for Fastify
export const metricsMiddleware = (fastify: FastifyInstance) => {
  // Request duration metrics
  fastify.addHook('onRequest', (request, reply, done) => {
    request.startTime = Date.now();
    done();
  });

  fastify.addHook('onSend', (request, reply, payload, done) => {
    const duration = (Date.now() - (request as any).startTime) / 1000;
    
    metrics.requestDurationSeconds
      .labels(
        request.method,
        request.routerPath || request.url,
        reply.statusCode.toString()
      )
      .observe(duration);
    
    done();
  });

  // Health check metrics
  fastify.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });
};

// Utility functions for updating metrics
export const updateIngestMetrics = (source: string, siteId: string, count: number) => {
  metrics.ingestRowsTotal.labels(source, siteId).inc(count);
};

export const updateDigestMetrics = (siteId: string) => {
  metrics.digestBuiltTotal.labels(siteId).inc();
};

export const updateAnchorMetrics = (siteId: string, success: boolean, errorType?: string) => {
  if (success) {
    metrics.anchorSuccessTotal.labels(siteId).inc();
  } else {
    metrics.anchorFailureTotal.labels(siteId, errorType || 'unknown').inc();
  }
};

export const updateJobDurationMetrics = (type: string, siteId: string, duration: number) => {
  metrics.jobDurationSeconds.labels(type, siteId).observe(duration);
};

export const updateConnectionMetrics = (type: 'mqtt' | 'adapter', connected: boolean) => {
  if (type === 'mqtt') {
    metrics.mqttConnectionStatus.set(connected ? 1 : 0);
  } else if (type === 'adapter') {
    metrics.adapterConnectionStatus.set(connected ? 1 : 0);
  }
};

// Initialize default metrics
export const initializeMetrics = () => {
  // Set default values
  metrics.mqttConnectionStatus.set(0);
  metrics.adapterConnectionStatus.set(0);
  metrics.databaseConnections.labels('active').set(0);
  metrics.databaseConnections.labels('idle').set(0);
};
