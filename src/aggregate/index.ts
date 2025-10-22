import { prisma } from '../db.js';
import { getDayStart, getDayEnd, getHourStart, sum, average, max } from '../util/index.js';
import { generateMerkleRoot } from '../model/merkle.js';
import { defaults } from '../config/index.js';

export interface HourlyAggregationResult {
  siteId: string;
  hourUtc: Date;
  energyKWh: number;
  maxPowerKw?: number;
  avgTempC?: number;
  avgIrrWm2?: number;
  rows: number;
}

export interface DailyAggregationResult {
  siteId: string;
  dayUtc: Date;
  energyKWh: number;
  avoidedTco2e: number;
  rows: number;
  merkleRoot: string;
}

export class AggregationService {
  constructor(private logger: any) {}

  async aggregateHourly(siteId: string, hourUtc: Date): Promise<HourlyAggregationResult | null> {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      const hourStart = getHourStart(hourUtc);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000 - 1);

      this.logger.info({
        siteId,
        hourStart: hourStart.toISOString(),
        hourEnd: hourEnd.toISOString(),
        requestId,
      }, 'Starting hourly aggregation');

      // Get all telemetry records for this hour
      const telemetryRecords = await prisma.rawTelemetry.findMany({
        where: {
          siteId,
          tsUtc: {
            gte: hourStart,
            lte: hourEnd,
          },
        },
        orderBy: {
          tsUtc: 'asc',
        },
      });

      if (telemetryRecords.length === 0) {
        this.logger.warn({
          siteId,
          hourStart: hourStart.toISOString(),
          requestId,
        }, 'No telemetry records found for hourly aggregation');
        return null;
      }

      // Calculate aggregations
      const energyValues = telemetryRecords
        .map(r => r.acEnergyKWh)
        .filter((v): v is number => v !== null && v !== undefined);
      
      const powerValues = telemetryRecords
        .map(r => r.acPowerKw)
        .filter((v): v is number => v !== null && v !== undefined);
      
      const tempValues = telemetryRecords
        .map(r => r.tempC)
        .filter((v): v is number => v !== null && v !== undefined);
      
      const irradianceValues = telemetryRecords
        .map(r => r.poaIrrWm2)
        .filter((v): v is number => v !== null && v !== undefined);

      const result: HourlyAggregationResult = {
        siteId,
        hourUtc: hourStart,
        energyKWh: sum(energyValues),
        maxPowerKw: powerValues.length > 0 ? max(powerValues) : undefined,
        avgTempC: tempValues.length > 0 ? average(tempValues) : undefined,
        avgIrrWm2: irradianceValues.length > 0 ? average(irradianceValues) : undefined,
        rows: telemetryRecords.length,
      };

      // Upsert hourly summary
      await prisma.hourlySummary.upsert({
        where: {
          siteId_hourUtc: {
            siteId,
            hourUtc: hourStart,
          },
        },
        update: {
          energyKWh: result.energyKWh,
          maxPowerKw: result.maxPowerKw,
          avgTempC: result.avgTempC,
          avgIrrWm2: result.avgIrrWm2,
          rows: result.rows,
        },
        create: {
          siteId: result.siteId,
          hourUtc: result.hourUtc,
          energyKWh: result.energyKWh,
          maxPowerKw: result.maxPowerKw,
          avgTempC: result.avgTempC,
          avgIrrWm2: result.avgIrrWm2,
          rows: result.rows,
        },
      });

      this.logger.info({
        siteId,
        hourStart: hourStart.toISOString(),
        energyKWh: result.energyKWh,
        rows: result.rows,
        requestId,
      }, 'Hourly aggregation completed');

      return result;

    } catch (error) {
      this.logger.error({
        siteId,
        hourUtc: hourUtc.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }, 'Hourly aggregation failed');
      throw error;
    }
  }

  async aggregateDaily(siteId: string, dayUtc: Date): Promise<DailyAggregationResult | null> {
    const requestId = Math.random().toString(36).substring(2, 15);
    
    try {
      const dayStart = getDayStart(dayUtc);
      const dayEnd = getDayEnd(dayUtc);

      this.logger.info({
        siteId,
        dayStart: dayStart.toISOString(),
        dayEnd: dayEnd.toISOString(),
        requestId,
      }, 'Starting daily aggregation');

      // Get site configuration for baseline factor
      const site = await prisma.site.findUnique({
        where: { id: siteId },
      });

      if (!site) {
        throw new Error(`Site ${siteId} not found`);
      }

      // Get all telemetry records for this day
      const telemetryRecords = await prisma.rawTelemetry.findMany({
        where: {
          siteId,
          tsUtc: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        orderBy: {
          tsUtc: 'asc',
        },
      });

      if (telemetryRecords.length === 0) {
        this.logger.warn({
          siteId,
          dayStart: dayStart.toISOString(),
          requestId,
        }, 'No telemetry records found for daily aggregation');
        return null;
      }

      // Calculate energy sum
      const energyValues = telemetryRecords
        .map(r => r.acEnergyKWh)
        .filter((v): v is number => v !== null && v !== undefined);
      
      const totalEnergyKWh = sum(energyValues);

      // Calculate avoided tCO2e
      const avoidedTco2e = (totalEnergyKWh * site.baselineKgPerKWh) / 1000;

      // Generate Merkle root from row hashes
      const rowHashes = telemetryRecords.map(r => r.rowHash);
      const merkleRoot = generateMerkleRoot(rowHashes);

      const result: DailyAggregationResult = {
        siteId,
        dayUtc: dayStart,
        energyKWh: totalEnergyKWh,
        avoidedTco2e,
        rows: telemetryRecords.length,
        merkleRoot,
      };

      // Upsert daily digest
      await prisma.dailyDigest.upsert({
        where: {
          siteId_dayUtc: {
            siteId,
            dayUtc: dayStart,
          },
        },
        update: {
          energyKWh: result.energyKWh,
          avoidedTco2e: result.avoidedTco2e,
          rows: result.rows,
          merkleRoot: result.merkleRoot,
        },
        create: {
          siteId: result.siteId,
          dayUtc: result.dayUtc,
          energyKWh: result.energyKWh,
          avoidedTco2e: result.avoidedTco2e,
          rows: result.rows,
          merkleRoot: result.merkleRoot,
        },
      });

      this.logger.info({
        siteId,
        dayStart: dayStart.toISOString(),
        energyKWh: result.energyKWh,
        avoidedTco2e: result.avoidedTco2e,
        merkleRoot: result.merkleRoot,
        rows: result.rows,
        requestId,
      }, 'Daily aggregation completed');

      return result;

    } catch (error) {
      this.logger.error({
        siteId,
        dayUtc: dayUtc.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }, 'Daily aggregation failed');
      throw error;
    }
  }

  async aggregateAllSitesHourly(hourUtc: Date): Promise<Record<string, HourlyAggregationResult | null>> {
    const sites = await prisma.site.findMany({
      select: { id: true },
    });

    const results: Record<string, HourlyAggregationResult | null> = {};

    for (const site of sites) {
      try {
        results[site.id] = await this.aggregateHourly(site.id, hourUtc);
      } catch (error) {
        this.logger.error({
          siteId: site.id,
          hourUtc: hourUtc.toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed hourly aggregation for site');
        results[site.id] = null;
      }
    }

    return results;
  }

  async aggregateAllSitesDaily(dayUtc: Date): Promise<Record<string, DailyAggregationResult | null>> {
    const sites = await prisma.site.findMany({
      select: { id: true },
    });

    const results: Record<string, DailyAggregationResult | null> = {};

    for (const site of sites) {
      try {
        results[site.id] = await this.aggregateDaily(site.id, dayUtc);
      } catch (error) {
        this.logger.error({
          siteId: site.id,
          dayUtc: dayUtc.toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Failed daily aggregation for site');
        results[site.id] = null;
      }
    }

    return results;
  }
}
