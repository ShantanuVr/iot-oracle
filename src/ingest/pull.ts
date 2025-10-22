import { env } from '../config/index.js';
import { getSiteConfig, getAllSiteConfigs } from '../config/sites.js';
import { 
  validateTelemetryInput, 
  clampValues, 
  normalizeTelemetry,
  RawTelemetryInput 
} from '../model/telemetry.js';
import { prisma } from '../db.js';
import { generateRequestId, retryWithBackoff } from '../util/index.js';

export class PullIngester {
  constructor(private logger: any) {}

  async pullFromSim(siteId: string, from: Date, to: Date): Promise<number> {
    const requestId = generateRequestId();
    
    try {
      const siteConfig = getSiteConfig(siteId);
      if (!siteConfig || !siteConfig.pullEnabled) {
        this.logger.warn({ siteId, requestId }, 'Site not configured for pull ingestion');
        return 0;
      }

      if (!env.SIM_BASE_URL) {
        this.logger.warn({ siteId, requestId }, 'SIM_BASE_URL not configured');
        return 0;
      }

      this.logger.info({
        siteId,
        from: from.toISOString(),
        to: to.toISOString(),
        requestId,
      }, 'Starting pull from iot-solar-sim');

      // Fetch data from sim API
      const simData = await this.fetchFromSim(siteId, from, to);
      
      let processedCount = 0;
      
      for (const dataPoint of simData) {
        try {
          const telemetryInput: RawTelemetryInput = {
            siteId,
            source: 'pull',
            tsUtc: dataPoint.timestamp,
            poaIrrWm2: dataPoint.poaIrrWm2,
            tempC: dataPoint.tempC,
            windMps: dataPoint.windMps,
            acPowerKw: dataPoint.acPowerKw,
            acEnergyKWh: dataPoint.acEnergyKWh,
            status: dataPoint.status,
          };

          const validated = validateTelemetryInput(telemetryInput);
          const clamped = clampValues(validated);
          const normalized = normalizeTelemetry(clamped);

          await prisma.rawTelemetry.upsert({
            where: {
              siteId_tsUtc: {
                siteId: normalized.siteId,
                tsUtc: normalized.tsUtc,
              },
            },
            update: {
              poaIrrWm2: normalized.poaIrrWm2,
              tempC: normalized.tempC,
              windMps: normalized.windMps,
              acPowerKw: normalized.acPowerKw,
              acEnergyKWh: normalized.acEnergyKWh,
              status: normalized.status,
              rowHash: normalized.rowHash,
              source: normalized.source,
            },
            create: {
              siteId: normalized.siteId,
              tsUtc: normalized.tsUtc,
              poaIrrWm2: normalized.poaIrrWm2,
              tempC: normalized.tempC,
              windMps: normalized.windMps,
              acPowerKw: normalized.acPowerKw,
              acEnergyKWh: normalized.acEnergyKWh,
              status: normalized.status,
              rowHash: normalized.rowHash,
              source: normalized.source,
            },
          });

          processedCount++;

        } catch (error) {
          this.logger.error({
            siteId,
            dataPoint,
            error: error instanceof Error ? error.message : 'Unknown error',
            requestId,
          }, 'Failed to process sim data point');
        }
      }

      this.logger.info({
        siteId,
        processedCount,
        requestId,
      }, 'Pull from sim completed');

      return processedCount;

    } catch (error) {
      this.logger.error({
        siteId,
        from: from.toISOString(),
        to: to.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }, 'Pull from sim failed');
      throw error;
    }
  }

  private async fetchFromSim(siteId: string, from: Date, to: Date): Promise<any[]> {
    const url = `${env.SIM_BASE_URL}/api/sites/${siteId}/telemetry`;
    const params = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });

    const response = await retryWithBackoff(async () => {
      const res = await fetch(`${url}?${params}`);
      if (!res.ok) {
        throw new Error(`Sim API returned ${res.status}: ${res.statusText}`);
      }
      return res;
    });

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Sim API returned invalid data format');
    }

    return data;
  }

  async pullAllSites(from: Date, to: Date): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const sites = getAllSiteConfigs();

    for (const site of sites) {
      if (site.pullEnabled) {
        try {
          results[site.id] = await this.pullFromSim(site.id, from, to);
        } catch (error) {
          this.logger.error({
            siteId: site.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'Failed to pull from sim for site');
          results[site.id] = 0;
        }
      }
    }

    return results;
  }
}
