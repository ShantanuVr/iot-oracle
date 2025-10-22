import mqtt from 'mqtt';
import { env } from '../config/index.js';
import { getSiteConfig } from '../config/sites.js';
import { 
  validateTelemetryInput, 
  clampValues, 
  normalizeTelemetry,
  RawTelemetryInput 
} from '../model/telemetry.js';
import { prisma } from '../db.js';
import { generateRequestId, createError } from '../util/index.js';

export class MQTTIngester {
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(private logger: any) {}

  async connect(): Promise<void> {
    try {
      this.client = mqtt.connect(env.MQTT_URL, {
        clientId: `iot-oracle-${Date.now()}`,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30 * 1000,
      });

      this.client.on('connect', () => {
        this.logger.info('Connected to MQTT broker');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.subscribeToTopics();
      });

      this.client.on('error', (error) => {
        this.logger.error({ error: error.message }, 'MQTT connection error');
        this.isConnected = false;
      });

      this.client.on('close', () => {
        this.logger.warn('MQTT connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnect', () => {
        this.reconnectAttempts++;
        this.logger.warn({ attempts: this.reconnectAttempts }, 'MQTT reconnecting');
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.logger.error('Max MQTT reconnection attempts reached');
          this.client?.end();
        }
      });

      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });

    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to connect to MQTT broker');
      throw error;
    }
  }

  private subscribeToTopics(): void {
    if (!this.client) return;

    // Subscribe to all configured site topics
    const siteConfigs = Object.values(getSiteConfig('PRJ001') ? { PRJ001: getSiteConfig('PRJ001') } : {});
    
    for (const config of siteConfigs) {
      if (config?.mqttTopic) {
        this.client.subscribe(config.mqttTopic, (error) => {
          if (error) {
            this.logger.error({ topic: config.mqttTopic, error: error.message }, 'Failed to subscribe to MQTT topic');
          } else {
            this.logger.info({ topic: config.mqttTopic }, 'Subscribed to MQTT topic');
          }
        });
      }
    }

    // Also subscribe to wildcard pattern for dynamic sites
    this.client.subscribe('iot/+/telemetry', (error) => {
      if (error) {
        this.logger.error({ error: error.message }, 'Failed to subscribe to MQTT wildcard topic');
      } else {
        this.logger.info('Subscribed to MQTT wildcard topic: iot/+/telemetry');
      }
    });
  }

  private async handleMessage(topic: string, message: Buffer): Promise<void> {
    const requestId = generateRequestId();
    
    try {
      const messageStr = message.toString();
      const data = JSON.parse(messageStr);
      
      // Extract siteId from topic (iot/{siteId}/telemetry)
      const topicParts = topic.split('/');
      const siteId = topicParts[1];
      
      if (!siteId) {
        this.logger.warn({ topic, requestId }, 'Could not extract siteId from MQTT topic');
        return;
      }

      // Validate site exists
      const siteConfig = getSiteConfig(siteId);
      if (!siteConfig) {
        this.logger.warn({ siteId, topic, requestId }, 'Unknown siteId in MQTT message');
        return;
      }

      // Prepare telemetry input
      const telemetryInput: RawTelemetryInput = {
        siteId,
        source: 'mqtt',
        tsUtc: data.tsUtc || new Date().toISOString(),
        poaIrrWm2: data.poaIrrWm2,
        tempC: data.tempC,
        windMps: data.windMps,
        acPowerKw: data.acPowerKw,
        acEnergyKWh: data.acEnergyKWh,
        status: data.status,
        uniqKey: data.uniqKey,
      };

      // Validate and process
      const validated = validateTelemetryInput(telemetryInput);
      const clamped = clampValues(validated);
      const normalized = normalizeTelemetry(clamped);

      // Store in database
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

      this.logger.info({
        requestId,
        siteId,
        tsUtc: normalized.tsUtc.toISOString(),
        rowHash: normalized.rowHash,
      }, 'MQTT telemetry processed successfully');

    } catch (error) {
      this.logger.error({
        requestId,
        topic,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: message.toString().substring(0, 200), // Log first 200 chars
      }, 'Failed to process MQTT message');
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      this.logger.info('Disconnected from MQTT broker');
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.client?.connected === true;
  }
}
