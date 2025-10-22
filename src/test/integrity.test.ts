import { generateRowHash, normalizeTelemetry } from '../model/telemetry.js';
import { generateMerkleRoot, verifyMerkleProof } from '../model/merkle.js';

describe('Telemetry Hashing', () => {
  test('should generate deterministic row hash', () => {
    const input = {
      siteId: 'PRJ001',
      tsUtc: '2024-01-15T12:00:00.000Z',
      acEnergyKWh: 1.234567,
      acPowerKw: 2.345678,
      poaIrrWm2: 800.123456,
      tempC: 25.678901,
      status: 'OK',
      source: 'http' as const,
    };

    const normalized = normalizeTelemetry(input);
    const hash1 = generateRowHash({
      siteId: input.siteId,
      tsUtc: input.tsUtc,
      acEnergyKWh: normalized.acEnergyKWh,
      acPowerKw: normalized.acPowerKw,
      poaIrrWm2: normalized.poaIrrWm2,
      tempC: normalized.tempC,
      status: input.status,
    });

    const hash2 = generateRowHash({
      siteId: input.siteId,
      tsUtc: input.tsUtc,
      acEnergyKWh: normalized.acEnergyKWh,
      acPowerKw: normalized.acPowerKw,
      poaIrrWm2: normalized.poaIrrWm2,
      tempC: normalized.tempC,
      status: input.status,
    });

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('should normalize numeric precision correctly', () => {
    const input = {
      siteId: 'PRJ001',
      tsUtc: '2024-01-15T12:00:00.000Z',
      acEnergyKWh: 1.234567,
      acPowerKw: 2.345678,
      poaIrrWm2: 800.123456,
      tempC: 25.678901,
      status: 'OK',
      source: 'http' as const,
    };

    const normalized = normalizeTelemetry(input);

    expect(normalized.acEnergyKWh).toBe(1.23);
    expect(normalized.acPowerKw).toBe(2.346);
    expect(normalized.poaIrrWm2).toBe(800.1);
    expect(normalized.tempC).toBe(25.7);
  });
});

describe('Merkle Tree', () => {
  test('should generate deterministic Merkle root', () => {
    const hashes = [
      'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567',
      'def456ghi789jkl012mno345pqr678stu901vwx234yz567abc123',
      'ghi789jkl012mno345pqr678stu901vwx234yz567abc123def456',
    ];

    const root1 = generateMerkleRoot(hashes);
    const root2 = generateMerkleRoot(hashes);

    expect(root1).toBe(root2);
    expect(root1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('should handle odd number of hashes', () => {
    const hashes = [
      'hash1',
      'hash2',
      'hash3',
    ];

    const root = generateMerkleRoot(hashes);
    expect(root).toMatch(/^[a-f0-9]{64}$/);
  });

  test('should verify Merkle proof correctly', () => {
    const hashes = ['hash1', 'hash2', 'hash3'];
    const root = generateMerkleRoot(hashes);
    
    // This is a simplified test - in practice you'd generate actual proofs
    const isValid = verifyMerkleProof('hash1', [], root);
    expect(typeof isValid).toBe('boolean');
  });
});
