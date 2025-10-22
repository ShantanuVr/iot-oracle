import { z } from 'zod';

// API response types
export interface DailyDigest {
  id: string;
  siteId: string;
  day: string; // YYYY-MM-DD format
  energyKWh: number;
  avoidedTco2e: number;
  rows: number;
  merkleRoot: string;
  csvUrl?: string;
  jsonUrl?: string;
  anchored: boolean;
  adapterTxId?: string;
  txHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HourlySummary {
  id: string;
  siteId: string;
  hourUtc: string;
  energyKWh: number;
  maxPowerKw?: number;
  avgTempC?: number;
  avgIrrWm2?: number;
  rows: number;
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  country: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Proof {
  included: boolean;
  leafHash?: string;
  branch?: string[];
  root: string;
}

export interface PreviewToday {
  energyKWh: number;
  avoidedTco2e: number;
  lastAnchor?: {
    day: string;
    txHash: string;
  };
}

// Request schemas
export const CreateSiteSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(1),
  timezone: z.string().min(1),
  baselineKgPerKWh: z.number().positive(),
});

export const BackfillRequestSchema = z.object({
  siteId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  intervalMinutes: z.number().int().positive().default(15),
});

export const RecomputeRequestSchema = z.object({
  siteId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const AnchorRequestSchema = z.object({
  siteId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const PurgeRawRequestSchema = z.object({
  siteId: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Query schemas
export const DateRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ProofQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ts: z.string().datetime(),
});

// Type exports
export type CreateSiteRequest = z.infer<typeof CreateSiteSchema>;
export type BackfillRequest = z.infer<typeof BackfillRequestSchema>;
export type RecomputeRequest = z.infer<typeof RecomputeRequestSchema>;
export type AnchorRequest = z.infer<typeof AnchorRequestSchema>;
export type PurgeRawRequest = z.infer<typeof PurgeRawRequestSchema>;
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>;
export type ProofQuery = z.infer<typeof ProofQuerySchema>;

// Response schemas
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  mqtt: z.boolean(),
  adapter: z.boolean(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
