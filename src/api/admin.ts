import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { 
  CreateSiteRequest,
  BackfillRequest,
  RecomputeRequest,
  AnchorRequest,
  PurgeRawRequest
} from '../model/api.js';
import { PullIngester } from '../ingest/pull.js';
import { AggregationService } from '../aggregate/index.js';
import { formatDate, parseDate, generateRequestId } from '../util/index.js';
import { env } from '../config/index.js';

// Admin authentication middleware
const authenticateAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const apiKey = request.headers['x-admin-key'] as string;
  
  if (!apiKey || apiKey !== env.ADMIN_API_KEY) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
};

export const registerAdminRoutes = async (fastify: FastifyInstance) => {
  // Add authentication hook for all admin routes
  fastify.addHook('preHandler', authenticateAdmin);

  // Create or update site
  fastify.post('/v1/sites', async (
    request: FastifyRequest<{ Body: CreateSiteRequest }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const siteData = request.body;
    
    try {
      const site = await prisma.site.upsert({
        where: { id: siteData.id },
        update: {
          name: siteData.name,
          country: siteData.country,
          timezone: siteData.timezone,
          baselineKgPerKWh: siteData.baselineKgPerKWh,
        },
        create: {
          id: siteData.id,
          name: siteData.name,
          country: siteData.country,
          timezone: siteData.timezone,
          baselineKgPerKWh: siteData.baselineKgPerKWh,
        },
      });
      
      request.log.info({
        requestId,
        siteId: site.id,
        name: site.name,
      }, 'Site created/updated');
      
      return reply.send({
        success: true,
        site: {
          id: site.id,
          name: site.name,
          country: site.country,
          timezone: site.timezone,
          baselineKgPerKWh: site.baselineKgPerKWh,
          createdAt: site.createdAt.toISOString(),
          updatedAt: site.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      request.log.error({
        requestId,
        siteData,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to create/update site');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Backfill data
  fastify.post('/v1/backfill', async (
    request: FastifyRequest<{ Body: BackfillRequest }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { siteId, from, to, intervalMinutes } = request.body;
    
    try {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      
      request.log.info({
        requestId,
        siteId,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        intervalMinutes,
      }, 'Starting backfill');
      
      const pullIngester = new PullIngester(request.log);
      const processedCount = await pullIngester.pullFromSim(siteId, fromDate, toDate);
      
      // Trigger aggregation for the backfilled period
      const aggregationService = new AggregationService(request.log);
      const currentDate = new Date(fromDate);
      
      while (currentDate <= toDate) {
        try {
          await aggregationService.aggregateDaily(siteId, currentDate);
        } catch (error) {
          request.log.error({
            siteId,
            day: currentDate.toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'Failed to aggregate backfilled day');
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      request.log.info({
        requestId,
        siteId,
        processedCount,
      }, 'Backfill completed');
      
      return reply.send({
        success: true,
        processedCount,
        message: `Backfilled ${processedCount} records for site ${siteId}`,
      });
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        from,
        to,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Backfill failed');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Recompute digest
  fastify.post('/v1/recompute', async (
    request: FastifyRequest<{ Body: RecomputeRequest }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { siteId, day } = request.body;
    
    try {
      const dayUtc = parseDate(day);
      
      request.log.info({
        requestId,
        siteId,
        day,
      }, 'Starting recompute');
      
      const aggregationService = new AggregationService(request.log);
      const result = await aggregationService.aggregateDaily(siteId, dayUtc);
      
      if (!result) {
        return reply.code(404).send({ error: 'No data found for recomputation' });
      }
      
      request.log.info({
        requestId,
        siteId,
        day,
        energyKWh: result.energyKWh,
        avoidedTco2e: result.avoidedTco2e,
        merkleRoot: result.merkleRoot,
      }, 'Recompute completed');
      
      return reply.send({
        success: true,
        digest: {
          siteId: result.siteId,
          day: formatDate(result.dayUtc),
          energyKWh: result.energyKWh,
          avoidedTco2e: result.avoidedTco2e,
          rows: result.rows,
          merkleRoot: result.merkleRoot,
        },
      });
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        day,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Recompute failed');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Force anchor digest
  fastify.post('/v1/anchor', async (
    request: FastifyRequest<{ Body: AnchorRequest }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { siteId, day } = request.body;
    
    try {
      const dayUtc = parseDate(day);
      
      request.log.info({
        requestId,
        siteId,
        day,
      }, 'Starting manual anchor');
      
      // Get the digest
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
      
      if (digest.anchored) {
        return reply.send({
          success: true,
          message: 'Digest already anchored',
          adapterTxId: digest.adapterTxId,
          txHash: digest.txHash,
        });
      }
      
      // Call anchoring service
      const { AnchorService } = await import('../anchor/index.js');
      const anchorService = new AnchorService(request.log);
      const anchorResult = await anchorService.anchorDigest(digest);
      
      if (anchorResult.success) {
        // Update digest with anchor info
        await prisma.dailyDigest.update({
          where: { id: digest.id },
          data: {
            anchored: true,
            adapterTxId: anchorResult.adapterTxId,
            txHash: anchorResult.txHash,
          },
        });
        
        request.log.info({
          requestId,
          siteId,
          day,
          adapterTxId: anchorResult.adapterTxId,
          txHash: anchorResult.txHash,
        }, 'Manual anchor completed');
        
        return reply.send({
          success: true,
          adapterTxId: anchorResult.adapterTxId,
          txHash: anchorResult.txHash,
          message: 'Digest anchored successfully',
        });
      } else {
        return reply.code(500).send({
          error: 'Failed to anchor digest',
          details: anchorResult.error,
        });
      }
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        day,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Manual anchor failed');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Purge raw data
  fastify.delete('/v1/raw', async (
    request: FastifyRequest<{ Body: PurgeRawRequest }>,
    reply: FastifyReply
  ) => {
    const requestId = generateRequestId();
    const { siteId, day } = request.body;
    
    try {
      const dayUtc = parseDate(day);
      const dayEnd = new Date(dayUtc.getTime() + 24 * 60 * 60 * 1000);
      
      request.log.info({
        requestId,
        siteId,
        day,
      }, 'Starting raw data purge');
      
      // Delete raw telemetry records
      const deleteResult = await prisma.rawTelemetry.deleteMany({
        where: {
          siteId,
          tsUtc: {
            gte: dayUtc,
            lt: dayEnd,
          },
        },
      });
      
      // Delete hourly summaries
      await prisma.hourlySummary.deleteMany({
        where: {
          siteId,
          hourUtc: {
            gte: dayUtc,
            lt: dayEnd,
          },
        },
      });
      
      // Delete daily digest
      await prisma.dailyDigest.deleteMany({
        where: {
          siteId,
          dayUtc,
        },
      });
      
      request.log.info({
        requestId,
        siteId,
        day,
        deletedRecords: deleteResult.count,
      }, 'Raw data purge completed');
      
      return reply.send({
        success: true,
        deletedRecords: deleteResult.count,
        message: `Purged ${deleteResult.count} raw records for site ${siteId} on ${day}`,
      });
    } catch (error) {
      request.log.error({
        requestId,
        siteId,
        day,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Raw data purge failed');
      
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
};
