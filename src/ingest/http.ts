import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { 
  validateTelemetryArray, 
  clampValues, 
  normalizeTelemetry,
  RawTelemetryInput 
} from '../model/telemetry.js';
import { generateRequestId, createError } from '../util/index.js';

export interface IngestRequest {
  telemetry: RawTelemetryInput[];
}

export const ingestTelemetry = async (
  request: FastifyRequest<{ Body: IngestRequest }>,
  reply: FastifyReply
) => {
  const requestId = generateRequestId();
  
  try {
    const { telemetry } = request.body;
    
    if (!Array.isArray(telemetry) || telemetry.length === 0) {
      throw createError('Telemetry array is required and must not be empty', 'INVALID_INPUT', 400);
    }
    
    // Validate and clamp values
    const validatedTelemetry = validateTelemetryArray(telemetry);
    const clampedTelemetry = validatedTelemetry.map(clampValues);
    
    // Process each telemetry record
    const results = [];
    const errors = [];
    
    for (const input of clampedTelemetry) {
      try {
        const normalized = normalizeTelemetry(input);
        
        // Upsert raw telemetry (idempotent by siteId + tsUtc)
        const rawTelemetry = await prisma.rawTelemetry.upsert({
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
            uniqKey: normalized.uniqKey,
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
            uniqKey: normalized.uniqKey,
          },
        });
        
        results.push({
          id: rawTelemetry.id,
          siteId: rawTelemetry.siteId,
          tsUtc: rawTelemetry.tsUtc.toISOString(),
          rowHash: rawTelemetry.rowHash,
        });
        
      } catch (error) {
        errors.push({
          input,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    // Log ingestion results
    request.log.info({
      requestId,
      totalRecords: telemetry.length,
      successful: results.length,
      errors: errors.length,
    }, 'Telemetry ingestion completed');
    
    return reply.code(200).send({
      success: true,
      requestId,
      processed: results.length,
      errors: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
    
  } catch (error) {
    request.log.error({
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Telemetry ingestion failed');
    
    if (error instanceof Error && 'statusCode' in error) {
      return reply.code((error as any).statusCode).send({
        success: false,
        requestId,
        error: error.message,
        code: (error as any).code,
      });
    }
    
    return reply.code(500).send({
      success: false,
      requestId,
      error: 'Internal server error',
    });
  }
};
