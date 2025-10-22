// Test setup file
import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/iot_oracle_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.MQTT_URL = 'mqtt://localhost:1883';
process.env.ANCHOR_ENABLED = 'false';
process.env.ADMIN_API_KEY = 'test-admin-key';

// Global test timeout
jest.setTimeout(30000);

// Cleanup after each test
afterEach(async () => {
  // Clean up any test data if needed
});
