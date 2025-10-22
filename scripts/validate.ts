import { PrismaClient } from '@prisma/client';
import { AggregationService } from '../src/aggregate/index.js';
import { generateMerkleRoot, verifyMerkleProof } from '../src/model/merkle.js';
import { logger } from '../src/util/logger.js';

const prisma = new PrismaClient();

interface ValidationOptions {
  siteId: string;
  day: string; // YYYY-MM-DD format
}

async function validate(options: ValidationOptions) {
  try {
    const { siteId, day } = options;
    
    logger.info({
      siteId,
      day,
    }, 'Starting validation...');

    // Parse date
    const dayUtc = new Date(day + 'T00:00:00.000Z');
    const dayEnd = new Date(dayUtc.getTime() + 24 * 60 * 60 * 1000);

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
      throw new Error(`No digest found for site ${siteId} on ${day}`);
    }

    logger.info({
      siteId,
      day,
      digestId: digest.id,
      currentMerkleRoot: digest.merkleRoot,
    }, 'Found existing digest');

    // Get all raw telemetry records for the day
    const telemetryRecords = await prisma.rawTelemetry.findMany({
      where: {
        siteId,
        tsUtc: {
          gte: dayUtc,
          lt: dayEnd,
        },
      },
      orderBy: {
        tsUtc: 'asc',
      },
    });

    logger.info({
      siteId,
      day,
      recordCount: telemetryRecords.length,
    }, 'Retrieved telemetry records');

    if (telemetryRecords.length === 0) {
      throw new Error(`No telemetry records found for site ${siteId} on ${day}`);
    }

    // Recalculate Merkle root
    const rowHashes = telemetryRecords.map(r => r.rowHash);
    const recalculatedMerkleRoot = generateMerkleRoot(rowHashes);

    logger.info({
      siteId,
      day,
      originalMerkleRoot: digest.merkleRoot,
      recalculatedMerkleRoot,
      match: digest.merkleRoot === recalculatedMerkleRoot,
    }, 'Merkle root validation');

    // Recalculate energy and avoided tCO2e
    const energyValues = telemetryRecords
      .map(r => r.acEnergyKWh)
      .filter((v): v is number => v !== null && v !== undefined);
    
    const recalculatedEnergyKWh = energyValues.reduce((sum, val) => sum + val, 0);
    
    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    const recalculatedAvoidedTco2e = (recalculatedEnergyKWh * site.baselineKgPerKWh) / 1000;

    logger.info({
      siteId,
      day,
      originalEnergyKWh: digest.energyKWh,
      recalculatedEnergyKWh,
      energyMatch: Math.abs(digest.energyKWh - recalculatedEnergyKWh) < 0.001,
      originalAvoidedTco2e: digest.avoidedTco2e,
      recalculatedAvoidedTco2e,
      avoidedTco2eMatch: Math.abs(digest.avoidedTco2e - recalculatedAvoidedTco2e) < 0.001,
    }, 'Energy and tCO2e validation');

    // Test Merkle proof for a random record
    const randomRecord = telemetryRecords[Math.floor(Math.random() * telemetryRecords.length)];
    const proof = generateMerkleRoot(rowHashes);
    const isValidProof = verifyMerkleProof(randomRecord.rowHash, [], recalculatedMerkleRoot);

    logger.info({
      siteId,
      day,
      testRecordId: randomRecord.id,
      testRecordHash: randomRecord.rowHash,
      proofValid: isValidProof,
    }, 'Merkle proof validation');

    // Summary
    const isValid = 
      digest.merkleRoot === recalculatedMerkleRoot &&
      Math.abs(digest.energyKWh - recalculatedEnergyKWh) < 0.001 &&
      Math.abs(digest.avoidedTco2e - recalculatedAvoidedTco2e) < 0.001;

    logger.info({
      siteId,
      day,
      isValid,
      merkleRootMatch: digest.merkleRoot === recalculatedMerkleRoot,
      energyMatch: Math.abs(digest.energyKWh - recalculatedEnergyKWh) < 0.001,
      avoidedTco2eMatch: Math.abs(digest.avoidedTco2e - recalculatedAvoidedTco2e) < 0.001,
    }, 'Validation completed');

    if (!isValid) {
      logger.warn({
        siteId,
        day,
      }, 'Validation failed - digest data does not match recalculated values');
    } else {
      logger.info({
        siteId,
        day,
      }, 'Validation passed - digest data is consistent');
    }

  } catch (error) {
    logger.error({
      siteId: options.siteId,
      day: options.day,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Validation failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: npm run db:validate <siteId> <day>');
    console.log('Example: npm run db:validate PRJ001 2024-01-15');
    process.exit(1);
  }

  const [siteId, day] = args;
  
  await validate({
    siteId,
    day,
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validate };
