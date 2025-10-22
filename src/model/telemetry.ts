import { z } from 'zod';
import { precisionConfig } from '../config/index.js';

// Raw telemetry input schema
export const RawTelemetryInputSchema = z.object({
  siteId: z.string().min(1),
  tsUtc: z.string().datetime(),
  poaIrrWm2: z.number().finite().nonnegative().optional(),
  tempC: z.number().finite().optional(),
  windMps: z.number().finite().nonnegative().optional(),
  acPowerKw: z.number().finite().nonnegative().optional(),
  acEnergyKWh: z.number().finite().nonnegative().optional(),
  status: z.enum(['OK', 'OUTAGE', 'CURTAILED']).optional(),
  source: z.enum(['mqtt', 'http', 'pull']),
  uniqKey: z.string().optional(),
});

export type RawTelemetryInput = z.infer<typeof RawTelemetryInputSchema>;

// Normalized telemetry data
export interface NormalizedTelemetry {
  siteId: string;
  tsUtc: Date;
  poaIrrWm2?: number;
  tempC?: number;
  windMps?: number;
  acPowerKw?: number;
  acEnergyKWh?: number;
  status?: string;
  source: string;
  uniqKey?: string;
  rowHash: string;
}

// Normalization functions
export const normalizeNumber = (value: number | undefined, precision: number): number | undefined => {
  if (value === undefined || !isFinite(value)) return undefined;
  return Number(value.toFixed(precision));
};

export const normalizeTelemetry = (input: RawTelemetryInput): NormalizedTelemetry => {
  const tsUtc = new Date(input.tsUtc);
  
  // Normalize numeric values with configured precision
  const poaIrrWm2 = normalizeNumber(input.poaIrrWm2, precisionConfig.irradiance);
  const tempC = normalizeNumber(input.tempC, precisionConfig.temp);
  const windMps = normalizeNumber(input.windMps, precisionConfig.temp); // Using temp precision for wind
  const acPowerKw = normalizeNumber(input.acPowerKw, precisionConfig.power);
  const acEnergyKWh = normalizeNumber(input.acEnergyKWh, precisionConfig.energy);
  
  // Generate row hash
  const rowHash = generateRowHash({
    siteId: input.siteId,
    tsUtc: tsUtc.toISOString(),
    acEnergyKWh,
    acPowerKw,
    poaIrrWm2,
    tempC,
    status: input.status || '',
  });
  
  return {
    siteId: input.siteId,
    tsUtc,
    poaIrrWm2,
    tempC,
    windMps,
    acPowerKw,
    acEnergyKWh,
    status: input.status,
    source: input.source,
    uniqKey: input.uniqKey,
    rowHash,
  };
};

// Row hash generation
export const generateRowHash = (data: {
  siteId: string;
  tsUtc: string;
  acEnergyKWh?: number;
  acPowerKw?: number;
  poaIrrWm2?: number;
  tempC?: number;
  status: string;
}): string => {
  const crypto = require('crypto');
  
  // Create deterministic string representation
  const normalized = [
    data.siteId,
    data.tsUtc,
    data.acEnergyKWh?.toString() || '',
    data.acPowerKw?.toString() || '',
    data.poaIrrWm2?.toString() || '',
    data.tempC?.toString() || '',
    data.status,
  ].join('|');
  
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

// Validation functions
export const validateTelemetryInput = (input: unknown): RawTelemetryInput => {
  return RawTelemetryInputSchema.parse(input);
};

export const validateTelemetryArray = (inputs: unknown[]): RawTelemetryInput[] => {
  return z.array(RawTelemetryInputSchema).parse(inputs);
};

// Clamp absurd values
export const clampValues = (input: RawTelemetryInput): RawTelemetryInput => {
  return {
    ...input,
    poaIrrWm2: input.poaIrrWm2 ? Math.min(Math.max(input.poaIrrWm2, 0), 2000) : undefined,
    tempC: input.tempC ? Math.min(Math.max(input.tempC, -50), 80) : undefined,
    windMps: input.windMps ? Math.min(Math.max(input.windMps, 0), 100) : undefined,
    acPowerKw: input.acPowerKw ? Math.min(Math.max(input.acPowerKw, 0), 10000) : undefined,
    acEnergyKWh: input.acEnergyKWh ? Math.min(Math.max(input.acEnergyKWh, 0), 1000) : undefined,
  };
};
