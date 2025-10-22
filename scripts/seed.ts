import { PrismaClient } from '@prisma/client';
import { getAllSiteConfigs } from '../src/config/sites.js';
import { logger } from '../src/util/logger.js';

const prisma = new PrismaClient();

async function seed() {
  try {
    logger.info('Starting database seed...');

    // Get all site configurations
    const siteConfigs = getAllSiteConfigs();

    // Create sites
    for (const config of siteConfigs) {
      const site = await prisma.site.upsert({
        where: { id: config.id },
        update: {
          name: config.name,
          country: config.country,
          timezone: config.timezone,
          baselineKgPerKWh: config.baselineKgPerKWh,
        },
        create: {
          id: config.id,
          name: config.name,
          country: config.country,
          timezone: config.timezone,
          baselineKgPerKWh: config.baselineKgPerKWh,
        },
      });

      logger.info({
        siteId: site.id,
        name: site.name,
        country: site.country,
        baselineKgPerKWh: site.baselineKgPerKWh,
      }, 'Site created/updated');
    }

    logger.info('Database seed completed successfully');

  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Database seed failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

export { seed };
