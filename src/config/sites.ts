import { SiteConfig, validateSiteConfig } from './index.js';

// Site configuration files
export const siteConfigs: Record<string, SiteConfig> = {
  PRJ001: validateSiteConfig({
    id: 'PRJ001',
    name: 'Solar Farm Alpha',
    country: 'India',
    timezone: 'Asia/Kolkata',
    baselineKgPerKWh: 0.708,
    mqttTopic: 'iot/PRJ001/telemetry',
    pullEnabled: true,
  }),
  
  PRJ002: validateSiteConfig({
    id: 'PRJ002',
    name: 'Wind Farm Beta',
    country: 'Germany',
    timezone: 'Europe/Berlin',
    baselineKgPerKWh: 0.485,
    mqttTopic: 'iot/PRJ002/telemetry',
    pullEnabled: false,
  }),
};

export const getSiteConfig = (siteId: string): SiteConfig | null => {
  return siteConfigs[siteId] || null;
};

export const getAllSiteConfigs = (): SiteConfig[] => {
  return Object.values(siteConfigs);
};
