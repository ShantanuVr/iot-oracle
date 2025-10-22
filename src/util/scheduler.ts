import { Queue, Worker } from 'bullmq';
import { env } from './config/index.js';
import { AggregationService } from './aggregate/index.js';
import { AnchorService } from './anchor/index.js';
import { prisma } from './db.js';
import { logger, updateJobDurationMetrics, updateAnchorMetrics } from './util/index.js';

// Job types
export interface HourlyAggregationJob {
  type: 'hourly';
  siteId: string;
  hourUtc: string;
}

export interface DailyAggregationJob {
  type: 'daily';
  siteId: string;
  dayUtc: string;
}

export interface AnchorJob {
  type: 'anchor';
  digestId: string;
}

export type JobData = HourlyAggregationJob | DailyAggregationJob | AnchorJob;

// Create queues
export const hourlyQueue = new Queue<HourlyAggregationJob>('hourly-aggregation', {
  connection: { host: 'localhost', port: 6379 },
});

export const dailyQueue = new Queue<DailyAggregationJob>('daily-aggregation', {
  connection: { host: 'localhost', port: 6379 },
});

export const anchorQueue = new Queue<AnchorJob>('anchor', {
  connection: { host: 'localhost', port: 6379 },
});

// Create workers
export const createWorkers = () => {
  // Hourly aggregation worker
  const hourlyWorker = new Worker<HourlyAggregationJob>(
    'hourly-aggregation',
    async (job) => {
      const startTime = Date.now();
      const { siteId, hourUtc } = job.data;
      
      logger.info({
        jobId: job.id,
        siteId,
        hourUtc,
      }, 'Starting hourly aggregation job');
      
      try {
        const aggregationService = new AggregationService(logger);
        const result = await aggregationService.aggregateHourly(siteId, new Date(hourUtc));
        
        const duration = (Date.now() - startTime) / 1000;
        updateJobDurationMetrics('hourly', siteId, duration);
        
        logger.info({
          jobId: job.id,
          siteId,
          hourUtc,
          duration,
          success: !!result,
        }, 'Hourly aggregation job completed');
        
        return result;
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        updateJobDurationMetrics('hourly', siteId, duration);
        
        logger.error({
          jobId: job.id,
          siteId,
          hourUtc,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Hourly aggregation job failed');
        
        throw error;
      }
    },
    {
      connection: { host: 'localhost', port: 6379 },
      concurrency: 5,
    }
  );

  // Daily aggregation worker
  const dailyWorker = new Worker<DailyAggregationJob>(
    'daily-aggregation',
    async (job) => {
      const startTime = Date.now();
      const { siteId, dayUtc } = job.data;
      
      logger.info({
        jobId: job.id,
        siteId,
        dayUtc,
      }, 'Starting daily aggregation job');
      
      try {
        const aggregationService = new AggregationService(logger);
        const result = await aggregationService.aggregateDaily(siteId, new Date(dayUtc));
        
        const duration = (Date.now() - startTime) / 1000;
        updateJobDurationMetrics('daily', siteId, duration);
        
        logger.info({
          jobId: job.id,
          siteId,
          dayUtc,
          duration,
          success: !!result,
        }, 'Daily aggregation job completed');
        
        // Schedule anchor job if anchoring is enabled
        if (result && env.ANCHOR_ENABLED) {
          const digest = await prisma.dailyDigest.findUnique({
            where: {
              siteId_dayUtc: {
                siteId,
                dayUtc: new Date(dayUtc),
              },
            },
          });
          
          if (digest && !digest.anchored) {
            await anchorQueue.add('anchor', {
              type: 'anchor',
              digestId: digest.id,
            }, {
              delay: 5000, // 5 second delay
            });
          }
        }
        
        return result;
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        updateJobDurationMetrics('daily', siteId, duration);
        
        logger.error({
          jobId: job.id,
          siteId,
          dayUtc,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Daily aggregation job failed');
        
        throw error;
      }
    },
    {
      connection: { host: 'localhost', port: 6379 },
      concurrency: 3,
    }
  );

  // Anchor worker
  const anchorWorker = new Worker<AnchorJob>(
    'anchor',
    async (job) => {
      const startTime = Date.now();
      const { digestId } = job.data;
      
      logger.info({
        jobId: job.id,
        digestId,
      }, 'Starting anchor job');
      
      try {
        const digest = await prisma.dailyDigest.findUnique({
          where: { id: digestId },
        });
        
        if (!digest) {
          throw new Error(`Digest ${digestId} not found`);
        }
        
        if (digest.anchored) {
          logger.info({
            jobId: job.id,
            digestId,
          }, 'Digest already anchored, skipping');
          return;
        }
        
        const anchorService = new AnchorService(logger);
        const result = await anchorService.anchorDigest(digest);
        
        const duration = (Date.now() - startTime) / 1000;
        
        if (result.success) {
          updateAnchorMetrics(digest.siteId, true);
          
          // Update digest with anchor info
          await prisma.dailyDigest.update({
            where: { id: digestId },
            data: {
              anchored: true,
              adapterTxId: result.adapterTxId,
              txHash: result.txHash,
            },
          });
          
          logger.info({
            jobId: job.id,
            digestId,
            siteId: digest.siteId,
            adapterTxId: result.adapterTxId,
            txHash: result.txHash,
            duration,
          }, 'Anchor job completed successfully');
        } else {
          updateAnchorMetrics(digest.siteId, false, result.error);
          
          logger.error({
            jobId: job.id,
            digestId,
            siteId: digest.siteId,
            error: result.error,
            duration,
          }, 'Anchor job failed');
          
          throw new Error(result.error);
        }
        
        return result;
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        
        logger.error({
          jobId: job.id,
          digestId,
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Anchor job failed');
        
        throw error;
      }
    },
    {
      connection: { host: 'localhost', port: 6379 },
      concurrency: 2,
    }
  );

  return { hourlyWorker, dailyWorker, anchorWorker };
};

// Schedule recurring jobs
export const scheduleRecurringJobs = () => {
  // Schedule hourly aggregation every hour
  hourlyQueue.add('hourly-aggregation', {
    type: 'hourly',
    siteId: 'all',
    hourUtc: new Date().toISOString(),
  }, {
    repeat: { cron: '0 * * * *' }, // Every hour at minute 0
    removeOnComplete: 10,
    removeOnFail: 5,
  });

  // Schedule daily aggregation every day at 1 AM UTC
  dailyQueue.add('daily-aggregation', {
    type: 'daily',
    siteId: 'all',
    dayUtc: new Date().toISOString(),
  }, {
    repeat: { cron: '0 1 * * *' }, // Every day at 1 AM UTC
    removeOnComplete: 10,
    removeOnFail: 5,
  });

  logger.info('Recurring jobs scheduled');
};

// Graceful shutdown
export const shutdownQueues = async () => {
  await Promise.all([
    hourlyQueue.close(),
    dailyQueue.close(),
    anchorQueue.close(),
  ]);
  
  logger.info('Job queues closed');
};
