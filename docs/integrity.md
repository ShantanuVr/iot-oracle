# Data Integrity Documentation

This document describes the deterministic data processing, hashing, and verification mechanisms used in the IoT Oracle to ensure data integrity and reproducibility.

## Overview

The IoT Oracle implements a multi-layered integrity verification system:

1. **Row-level Hashing**: Each telemetry record gets a deterministic SHA-256 hash
2. **Merkle Tree Construction**: Daily digests include Merkle roots of all telemetry rows
3. **Deterministic Aggregation**: Reproducible energy calculations and tCO2e conversions
4. **Proof Generation**: Merkle proofs for individual telemetry record verification

## Row Hashing

### Normalization Rules

All numeric values are normalized to specific decimal precision before hashing:

- **Power (kW)**: 3 decimal places
- **Energy (kWh)**: 2 decimal places  
- **Temperature (°C)**: 1 decimal place
- **Irradiance (W/m²)**: 1 decimal place

### Hash Generation

The row hash is computed as:

```typescript
const normalized = [
  siteId,
  tsUtc.toISOString(),
  acEnergyKWh?.toFixed(2) || '',
  acPowerKw?.toFixed(3) || '',
  poaIrrWm2?.toFixed(1) || '',
  tempC?.toFixed(1) || '',
  status || '',
].join('|');

const rowHash = sha256(normalized);
```

### Example

For a telemetry record:
```json
{
  "siteId": "PRJ001",
  "tsUtc": "2024-01-15T12:00:00.000Z",
  "acEnergyKWh": 1.234567,
  "acPowerKw": 2.345678,
  "poaIrrWm2": 800.123456,
  "tempC": 25.678901,
  "status": "OK"
}
```

Normalized values:
- `acEnergyKWh`: "1.23"
- `acPowerKw`: "2.346" 
- `poaIrrWm2`: "800.1"
- `tempC`: "25.7"

Concatenated string:
```
PRJ001|2024-01-15T12:00:00.000Z|1.23|2.346|800.1|25.7|OK
```

SHA-256 hash: `a1b2c3d4e5f6...` (example)

## Merkle Tree Construction

### Algorithm

1. **Collect**: Gather all `rowHash` values for the day
2. **Sort**: Sort hashes lexicographically (deterministic ordering)
3. **Build Tree**: 
   - Pair adjacent hashes
   - Concatenate and hash each pair
   - If odd number of hashes, duplicate the last one
   - Repeat until single root hash remains

### Implementation

```typescript
class MerkleTree {
  constructor(leaves: string[]) {
    this.leaves = [...leaves].sort(); // Deterministic ordering
    this.tree = this.buildTree();
  }

  private buildTree(): string[][] {
    const tree: string[][] = [];
    tree.push([...this.leaves]);

    let currentLevel = this.leaves;
    
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] || left; // Duplicate last hash if odd
        
        const combined = left + right;
        const hash = sha256(combined);
        nextLevel.push(hash);
      }
      
      tree.push(nextLevel);
      currentLevel = nextLevel;
    }
    
    return tree;
  }
}
```

### Example

For 3 telemetry records with hashes:
- `hash1`: "abc123..."
- `hash2`: "def456..."  
- `hash3`: "ghi789..."

Sorted: `["abc123...", "def456...", "ghi789..."]`

Level 1: `["abc123...", "def456...", "ghi789..."]`
Level 2: `[sha256("abc123..." + "def456..."), sha256("ghi789..." + "ghi789...")]`
Level 3: `[sha256(level2[0] + level2[1])]`

Root: `sha256(level2[0] + level2[1])`

## Energy Aggregation

### Daily Energy Calculation

```typescript
const energyValues = telemetryRecords
  .map(r => r.acEnergyKWh)
  .filter((v): v is number => v !== null && v !== undefined);

const totalEnergyKWh = energyValues.reduce((sum, val) => sum + val, 0);
```

### tCO2e Calculation

```typescript
const avoidedTco2e = (totalEnergyKWh * site.baselineKgPerKWh) / 1000;
```

Where:
- `totalEnergyKWh`: Sum of all energy readings for the day
- `site.baselineKgPerKWh`: Grid emission factor (e.g., 0.708 kg CO2/kWh for India)
- Division by 1000: Convert kg to tonnes

## Merkle Proof Generation

### Proof Structure

A Merkle proof contains:
- `included`: Boolean indicating if the record is in the tree
- `leafHash`: The hash of the target record
- `branch`: Array of sibling hashes needed to reconstruct the root
- `root`: The Merkle root hash

### Verification Algorithm

```typescript
function verifyProof(leaf: string, proof: string[], root: string): boolean {
  let hash = leaf;
  
  for (const sibling of proof) {
    const combined = hash + sibling;
    hash = sha256(combined);
  }
  
  return hash === root;
}
```

## Deterministic Properties

### Reproducibility

Running the same aggregation process multiple times produces identical results:

1. **Same Input Data**: Identical telemetry records
2. **Same Normalization**: Fixed decimal precision rules
3. **Same Hashing**: Deterministic SHA-256 algorithm
4. **Same Sorting**: Lexicographic ordering of hashes
5. **Same Aggregation**: Identical energy summation

### Test Vectors

#### Test Case 1: Single Record
```json
{
  "siteId": "PRJ001",
  "tsUtc": "2024-01-15T12:00:00.000Z",
  "acEnergyKWh": 1.0,
  "acPowerKw": 1.0,
  "status": "OK"
}
```

Expected row hash: `sha256("PRJ001|2024-01-15T12:00:00.000Z|1.00|1.000|||OK")`

#### Test Case 2: Multiple Records
Three records with the same energy values should produce:
- Individual row hashes: Different (due to timestamps)
- Merkle root: Deterministic based on sorted hashes
- Total energy: Sum of all energy values

#### Test Case 3: Odd Number of Records
Five records should:
- Sort lexicographically
- Duplicate the last hash in the first level
- Produce a valid Merkle root

## Validation Procedures

### Daily Digest Validation

1. **Retrieve**: Get all telemetry records for the day
2. **Recalculate**: Compute Merkle root from row hashes
3. **Compare**: Verify against stored Merkle root
4. **Energy Check**: Verify energy summation matches
5. **tCO2e Check**: Verify tCO2e calculation matches

### Proof Validation

1. **Generate**: Create Merkle proof for a specific record
2. **Verify**: Use proof to reconstruct root hash
3. **Compare**: Verify reconstructed root matches digest root

## Error Handling

### Invalid Data
- Non-finite numbers are filtered out
- Missing required fields cause rejection
- Absurd values are clamped to reasonable ranges

### Hash Collisions
- SHA-256 provides 2^256 possible hash values
- Collision probability is negligible for practical purposes
- Duplicate timestamps are prevented by database constraints

## Security Considerations

### Tamper Detection
- Any modification to telemetry data changes the row hash
- Changed row hashes invalidate the Merkle root
- Anchored Merkle roots provide immutable verification

### Audit Trail
- All operations are logged with request IDs
- Row hashes provide cryptographic proof of data integrity
- Merkle proofs enable selective verification

## Performance Characteristics

### Hashing
- SHA-256: ~100MB/s on modern hardware
- Row hashing: O(1) per record
- Merkle tree: O(n log n) for n records

### Memory Usage
- Row hashes: 64 bytes each (hex string)
- Merkle tree: O(n) storage for n records
- Proof size: O(log n) for n records

## Compliance

This implementation ensures:
- **Deterministic**: Same input always produces same output
- **Auditable**: All operations are logged and verifiable
- **Reproducible**: Results can be independently verified
- **Immutable**: Anchored digests cannot be modified
- **Transparent**: All algorithms are documented and testable
