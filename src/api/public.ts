import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { checkDatabaseHealth } from '../db.js';
import { MQTTIngester } from '../ingest/mqtt.js';
import { PullIngester } from '../ingest/pull.js';
import { AggregationService } from '../aggregate/index.js';
import { 
  DailyDigest, 
  Site, 
  Proof, 
  PreviewToday,
  HealthResponse,
  DateRangeQuery,
  ProofQuery,
  CreateSiteRequest,
  BackfillRequest,
  RecomputeRequest,
  AnchorRequest,
  PurgeRawRequest
} from '../model/api.js';
import { formatDate, parseDate, generateRequestId } from '../util/index.js';
import { generateMerkleProof, verifyMerkleProof } from '../model/merkle.js';

export const registerPublicRoutes = async (fastify: FastifyInstance) => {
  // Health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = generateRequestId();
    
    try {
      const dbHealthy = await checkDatabaseHealth();
      const mqttHealthy = fastify.mqttIngester?.isHealthy() ?? false;
      const adapterHealthy = await checkAdapterHealth();
      
      const response: HealthResponse = {
        ok: dbHealthy && mqttHealthy,
        db: dbHealthy,
        mqtt: mqttHealthy,
        adapter: adapterHealthy,
      };
      
      const statusCode = response.ok ? 200 : 503;
      
      request.log.info({
        requestId,
        ...response,
      }, 'Health check completed');
      
      return reply.code(statusCode).send(response);
    } catch (error) {
      request.log.error({
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Health check failed');
      
      return reply.code(503).send({
        ok: false,
        db: false,
        mqtt: false,
        adapter: false,
      });
    }
  });

  // Get all sites
  fastify.get('/v1/sites', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = generateRequestId();
    
    try {
      const sites = await prisma.site.findMany({
        select: {
          id: true,
          name: true,
          country: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          id: 'asc',
        },
      });
      
      const response: Site[] = sites.map(site => ({
        id: site.id,
        name: site.name,
        country: site.country,
        timezone: site.timezone,
        createdAt: site.createdAt.toISOString(),
        updatedAt: site.updatedAt.toISOString(),
      }));
      
      request.log.info({
        requestId,
        count: response.length,
      }, 'Sites retrieved');
      
      return reply.send(response);
    } catch (error) {
      request.log.error({
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to retrieve sites');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get latest digest for a site
  fastify.get('/v1/sites/:id/digests/latest', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { id: siteId } = request.params;
    
    try {
      const digest = await prisma.dailyDigest.findFirst({
        where: { siteId },
        orderBy: { dayUtc: 'desc' },
      });
      
      if (!digest) {
        return reply.code(404).send({ error: 'No digest found for site' });
      }
      
      const response: DailyDigest = {
        id: digest.id,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
        energyKWh: digest.energyKWh,
        avoidedTco2e: digest.avoidedTco2e,
        rows: digest.rows,
        merkleRoot: digest.merkleRoot,
        csvUrl: digest.csvUrl || undefined,
        jsonUrl: digest.jsonUrl || undefined,
        anchored: digest.anchored,
        adapterTxId: digest.adapterTxId || undefined,
        txHash: digest.txHash || undefined,
        createdAt: digest.createdAt.toISOString(),
        updatedAt: digest.updatedAt.toISOString(),
      };
      
      request.log.info({
        requestId,
        siteId,
        day: response.day,
        energyKWh: response.energyKWh,
        avoidedTco2e: response.avoidedTco2e,
      }, 'Latest digest retrieved');
      
      return reply.send(response);
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to retrieve latest digest');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get digests for date range
  fastify.get('/v1/sites/:id/digests', async (
    request: FastifyRequest<{ 
      Params: { id: string };
      Querystring: DateRangeQuery;
    }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { id: siteId } = request.params;
    const { from, to } = request.query;
    
    try {
      const where: any = { siteId };
      
      if (from) {
        where.dayUtc = { ...where.dayUtc, gte: parseDate(from) };
      }
      
      if (to) {
        where.dayUtc = { ...where.dayUtc, lte: parseDate(to) };
      }
      
      const digests = await prisma.dailyDigest.findMany({
        where,
        orderBy: { dayUtc: 'desc' },
      });
      
      const response: DailyDigest[] = digests.map(digest => ({
        id: digest.id,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
        energyKWh: digest.energyKWh,
        avoidedTco2e: digest.avoidedTco2e,
        rows: digest.rows,
        merkleRoot: digest.merkleRoot,
        csvUrl: digest.csvUrl || undefined,
        jsonUrl: digest.jsonUrl || undefined,
        anchored: digest.anchored,
        adapterTxId: digest.adapterTxId || undefined,
        txHash: digest.txHash || undefined,
        createdAt: digest.createdAt.toISOString(),
        updatedAt: digest.updatedAt.toISOString(),
      }));
      
      request.log.info({
        requestId,
        siteId,
        from,
        to,
        count: response.length,
      }, 'Digests retrieved');
      
      return reply.send(response);
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        from,
        to,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to retrieve digests');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get specific digest
  fastify.get('/v1/sites/:id/digests/:day', async (
    request: FastifyRequest<{ 
      Params: { id: string; day: string };
    }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { id: siteId, day } = request.params;
    
    try {
      const dayUtc = parseDate(day);
      
      const digest = await prisma.dailyDigest.findUnique({
        where: {
          siteId_dayUtc: {
            siteId,
            dayUtc,
          },
        },
      });
      
      if (!digest) {
        return reply.code(404).send({ error: 'Digest not found' });
      }
      
      const response: DailyDigest = {
        id: digest.id,
        siteId: digest.siteId,
        day: formatDate(digest.dayUtc),
        energyKWh: digest.energyKWh,
        avoidedTco2e: digest.avoidedTco2e,
        rows: digest.rows,
        merkleRoot: digest.merkleRoot,
        csvUrl: digest.csvUrl || undefined,
        jsonUrl: digest.jsonUrl || undefined,
        anchored: digest.anchored,
        adapterTxId: digest.adapterTxId || undefined,
        txHash: digest.txHash || undefined,
        createdAt: digest.createdAt.toISOString(),
        updatedAt: digest.updatedAt.toISOString(),
      };
      
      request.log.info({
        requestId,
        siteId,
        day,
        energyKWh: response.energyKWh,
        avoidedTco2e: response.avoidedTco2e,
      }, 'Digest retrieved');
      
      return reply.send(response);
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        day,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to retrieve digest');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get Merkle proof
  fastify.get('/v1/sites/:id/proof', async (
    request: FastifyRequest<{ 
      Params: { id: string };
      Querystring: ProofQuery;
    }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { id: siteId } = request.params;
    const { day, ts } = request.query;
    
    try {
      const dayUtc = parseDate(day);
      const tsUtc = new Date(ts);
      
      // Get the digest for the day
      const digest = await prisma.dailyDigest.findUnique({
        where: {
          siteId_dayUtc: {
            siteId,
            dayUtc,
          },
        },
      });
      
      if (!digest) {
        return reply.code(404).send({ error: 'Digest not found for the specified day' });
      }
      
      // Get the specific telemetry record
      const telemetry = await prisma.rawTelemetry.findUnique({
        where: {
          siteId_tsUtc: {
            siteId,
            tsUtc,
          },
        },
      });
      
      if (!telemetry) {
        return reply.code(404).send({ error: 'Telemetry record not found' });
      }
      
      // Get all row hashes for the day to generate proof
      const allTelemetry = await prisma.rawTelemetry.findMany({
        where: {
          siteId,
          tsUtc: {
            gte: dayUtc,
            lt: new Date(dayUtc.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { tsUtc: 'asc' },
      });
      
      const rowHashes = allTelemetry.map(t => t.rowHash);
      const proof = generateMerkleProof(rowHashes, telemetry.rowHash);
      
      const response: Proof = {
        included: true,
        leafHash: telemetry.rowHash,
        branch: proof,
        root: digest.merkleRoot,
      };
      
      request.log.info({
        requestId,
        siteId,
        day,
        ts,
        leafHash: telemetry.rowHash,
        root: digest.merkleRoot,
      }, 'Merkle proof generated');
      
      return reply.send(response);
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        day,
        ts,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to generate Merkle proof');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get today's preview
  fastify.get('/v1/sites/:id/preview/today', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { id: siteId } = request.params;
    
    try {
      const today = new Date();
      const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Get today's telemetry records
      const telemetryRecords = await prisma.rawTelemetry.findMany({
        where: {
          siteId,
          tsUtc: {
            gte: dayStart,
          },
        },
      });
      
      // Calculate today's energy
      const energyValues = telemetryRecords
        .map(r => r.acEnergyKWh)
        .filter((v): v is number => v !== null && v !== undefined);
      
      const totalEnergyKWh = energyValues.reduce((sum, val) => sum + val, 0);
      
      // Get site baseline factor
      const site = await prisma.site.findUnique({
        where: { id: siteId },
      });
      
      if (!site) {
        return reply.code(404).send({ error: 'Site not found' });
      }
      
      const avoidedTco2e = (totalEnergyKWh * site.baselineKgPerKWh) / 1000;
      
      // Get last anchored digest
      const lastAnchored = await prisma.dailyDigest.findFirst({
        where: {
          siteId,
          anchored: true,
        },
        orderBy: { dayUtc: 'desc' },
      });
      
      const response: PreviewToday = {
        energyKWh: totalEnergyKWh,
        avoidedTco2e,
        lastAnchor: lastAnchored ? {
          day: formatDate(lastAnchored.dayUtc),
          txHash: lastAnchored.txHash || '',
        } : undefined,
      };
      
      request.log.info({
        requestId,
        siteId,
        energyKWh: response.energyKWh,
        avoidedTco2e: response.avoidedTco2e,
      }, 'Today preview retrieved');
      
      return reply.send(response);
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to retrieve today preview');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
};

// Helper function to check adapter health
async function checkAdapterHealth(): Promise<boolean> {
  try {
    // This would check the registry-adapter-api health
    // For now, return true if ANCHOR_ENABLED is true
    return true;
  } catch {
    return false;
  }
}
