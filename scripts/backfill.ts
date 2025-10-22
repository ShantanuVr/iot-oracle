import { PrismaClient } from '@prisma/client';
import { PullIngester } from '../src/ingest/pull.js';
import { AggregationService } from '../src/aggregate/index.js';
import { logger } from '../src/util/logger.js';
import { env } from '../src/config/index.js';

const prisma = new PrismaClient();

interface BackfillOptions {
  siteId: string;
  from: string; // YYYY-MM-DD format
  to: string;   // YYYY-MM-DD format
  intervalMinutes?: number;
}

async function backfill(options: BackfillOptions) {
  try {
    const { siteId, from, to, intervalMinutes = 15 } = options;
    
    logger.info({
      siteId,
      from,
      to,
      intervalMinutes,
    }, 'Starting backfill...');

    // Validate site exists
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    // Parse dates
    const fromDate = new Date(from + 'T00:00:00.000Z');
    const toDate = new Date(to + 'T23:59:59.999Z');

    if (fromDate >= toDate) {
      throw new Error('From date must be before to date');
    }

    // Initialize services
    const pullIngester = new PullIngester(logger);
    const aggregationService = new AggregationService(logger);

    // Pull data from sim
    logger.info({
      siteId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    }, 'Pulling data from simulator...');

    const processedCount = await pullIngester.pullFromSim(siteId, fromDate, toDate);
    
    logger.info({
      siteId,
      processedCount,
    }, 'Data pull completed');

    // Aggregate data for each day
    const currentDate = new Date(fromDate);
    let aggregatedDays = 0;

    while (currentDate <= toDate) {
      try {
        logger.info({
          siteId,
          day: currentDate.toISOString().split('T')[0],
        }, 'Aggregating daily data...');

        const result = await aggregationService.aggregateDaily(siteId, currentDate);
        
        if (result) {
          aggregatedDays++;
          logger.info({
            siteId,
            day: currentDate.toISOString().split('T')[0],
            energyKWh: result.energyKWh,
            avoidedTco2e: result.avoidedTco2e,
            merkleRoot: result.merkleRoot,
            rows: result.rows,
          }, 'Daily aggregation completed');
        }
      } catch (error) {
        logger.error({
          siteId,
          day: currentDate.toISOString().split('T')[0],
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Daily aggregation failed');
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    logger.info({
      siteId,
      from,
      to,
      processedCount,
      aggregatedDays,
    }, 'Backfill completed successfully');

  } catch (error) {
    logger.error({
      siteId: options.siteId,
      from: options.from,
      to: options.to,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Backfill failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: npm run db:backfill <siteId> <from> <to> [intervalMinutes]');
    console.log('Example: npm run db:backfill PRJ001 2024-01-01 2024-01-31');
    process.exit(1);
  }

  const [siteId, from, to, intervalMinutes] = args;
  
  await backfill({
    siteId,
    from,
    to,
    intervalMinutes: intervalMinutes ? parseInt(intervalMinutes) : undefined,
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { backfill };
