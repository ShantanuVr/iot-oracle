import { z } from 'zod';

// Environment validation schema
const envSchema = z.object({
  PORT: z.string().transform(Number).default('4201'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  
  // MQTT
  MQTT_URL: z.string().min(1, 'MQTT_URL is required'),
  
  // Optional pull source
  SIM_BASE_URL: z.string().url().optional(),
  
  // Anchoring
  ANCHOR_ENABLED: z.string().transform(val => val === 'true').default('false'),
  ADAPTER_API_URL: z.string().url().optional(),
  ADAPTER_API_KEY: z.string().optional(),
  
  // Precision settings
  HASH_PRECISION_POWER_DP: z.string().transform(Number).default('3'),
  HASH_PRECISION_ENERGY_DP: z.string().transform(Number).default('2'),
  HASH_PRECISION_TEMP_DP: z.string().transform(Number).default('1'),
  HASH_PRECISION_IRR_DP: z.string().transform(Number).default('1'),
  
  // Defaults
  DEFAULT_BASELINE_FACTOR_KG_PER_KWH: z.string().transform(Number).default('0.82'),
  DEFAULT_TIMEZONE: z.string().default('UTC'),
  
  // Security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters').optional(),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();

// Site configuration interface
export interface SiteConfig {
  id: string;
  name: string;
  country: string;
  timezone: string;
  baselineKgPerKWh: number;
  mqttTopic?: string;
  pullEnabled?: boolean;
}

// Default site configurations
export const defaultSites: SiteConfig[] = [
  {
    id: 'PRJ001',
    name: 'Solar Farm Alpha',
    country: 'India',
    timezone: 'Asia/Kolkata',
    baselineKgPerKWh: 0.708,
    mqttTopic: 'iot/PRJ001/telemetry',
    pullEnabled: true,
  },
  {
    id: 'PRJ002',
    name: 'Wind Farm Beta',
    country: 'Germany',
    timezone: 'Europe/Berlin',
    baselineKgPerKWh: 0.485,
    mqttTopic: 'iot/PRJ002/telemetry',
    pullEnabled: false,
  },
];

// Configuration validation
export const validateSiteConfig = (config: unknown): SiteConfig => {
  const schema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    country: z.string().min(1),
    timezone: z.string().min(1),
    baselineKgPerKWh: z.number().positive(),
    mqttTopic: z.string().optional(),
    pullEnabled: z.boolean().optional(),
  });
  
  return schema.parse(config);
};

// Precision configuration
export const precisionConfig = {
  power: env.HASH_PRECISION_POWER_DP,
  energy: env.HASH_PRECISION_ENERGY_DP,
  temp: env.HASH_PRECISION_TEMP_DP,
  irradiance: env.HASH_PRECISION_IRR_DP,
} as const;

// Default values
export const defaults = {
  baselineFactor: env.DEFAULT_BASELINE_FACTOR_KG_PER_KWH,
  timezone: env.DEFAULT_TIMEZONE,
} as const;
