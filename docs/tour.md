# IoT Oracle Tour Guide

This guide walks you through the IoT Oracle system using real examples and API calls.

## Prerequisites

- Docker and Docker Compose installed
- Basic familiarity with REST APIs
- Understanding of carbon credit concepts

## Quick Start

### 1. Start the System

```bash
# Clone and setup
git clone <repository>
cd iot-oracle
cp env.example .env

# Start all services
docker-compose up -d

# Wait for services to be ready
docker-compose logs -f iot-oracle
```

### 2. Seed the Database

```bash
# Create default sites
docker-compose exec iot-oracle npm run db:seed
```

### 3. Backfill Sample Data

```bash
# Pull data from simulator for January 2024
docker-compose exec iot-oracle npm run db:backfill PRJ001 2024-01-01 2024-01-31
```

## API Tour

### Health Check

```bash
curl http://localhost:4201/health
```

Expected response:
```json
{
  "ok": true,
  "db": true,
  "mqtt": true,
  "adapter": true
}
```

### List Sites

```bash
curl http://localhost:4201/v1/sites
```

Expected response:
```json
[
  {
    "id": "PRJ001",
    "name": "Solar Farm Alpha",
    "country": "India",
    "timezone": "Asia/Kolkata",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

### Get Latest Digest

```bash
curl http://localhost:4201/v1/sites/PRJ001/digests/latest
```

Expected response:
```json
{
  "id": "digest-123",
  "siteId": "PRJ001",
  "day": "2024-01-31",
  "energyKWh": 1250.45,
  "avoidedTco2e": 0.885,
  "rows": 96,
  "merkleRoot": "0xa1b2c3d4e5f6...",
  "anchored": true,
  "adapterTxId": "tx-123",
  "txHash": "0x1234567890abcdef...",
  "createdAt": "2024-02-01T01:30:00.000Z",
  "updatedAt": "2024-02-01T01:30:00.000Z"
}
```

### Get Digest Range

```bash
curl "http://localhost:4201/v1/sites/PRJ001/digests?from=2024-01-01&to=2024-01-07"
```

### Get Merkle Proof

```bash
curl "http://localhost:4201/v1/sites/PRJ001/proof?day=2024-01-15&ts=2024-01-15T12:00:00.000Z"
```

Expected response:
```json
{
  "included": true,
  "leafHash": "0xabc123def456...",
  "branch": ["0xdef456abc123...", "0xghi789jkl012..."],
  "root": "0xa1b2c3d4e5f6..."
}
```

### Today's Preview

```bash
curl http://localhost:4201/v1/sites/PRJ001/preview/today
```

Expected response:
```json
{
  "energyKWh": 45.2,
  "avoidedTco2e": 0.032,
  "lastAnchor": {
    "day": "2024-01-31",
    "txHash": "0x1234567890abcdef..."
  }
}
```

## Data Ingestion

### HTTP Push

```bash
curl -X POST http://localhost:4201/v1/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "telemetry": [
      {
        "siteId": "PRJ001",
        "tsUtc": "2024-01-15T12:00:00.000Z",
        "acEnergyKWh": 1.25,
        "acPowerKw": 5.0,
        "poaIrrWm2": 800.5,
        "tempC": 25.3,
        "status": "OK",
        "source": "http"
      }
    ]
  }'
```

### MQTT Publish

```bash
# Using mosquitto_pub
mosquitto_pub -h localhost -t "iot/PRJ001/telemetry" -m '{
  "tsUtc": "2024-01-15T12:15:00.000Z",
  "acEnergyKWh": 1.30,
  "acPowerKw": 5.2,
  "poaIrrWm2": 820.1,
  "tempC": 25.5,
  "status": "OK"
}'
```

## Admin Operations

### Create Site

```bash
curl -X POST http://localhost:4201/v1/sites \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-admin-api-key" \
  -d '{
    "id": "PRJ003",
    "name": "Wind Farm Gamma",
    "country": "Spain",
    "timezone": "Europe/Madrid",
    "baselineKgPerKWh": 0.350
  }'
```

### Recompute Digest

```bash
curl -X POST http://localhost:4201/v1/recompute \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-admin-api-key" \
  -d '{
    "siteId": "PRJ001",
    "day": "2024-01-15"
  }'
```

### Force Anchor

```bash
curl -X POST http://localhost:4201/v1/anchor \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-admin-api-key" \
  -d '{
    "siteId": "PRJ001",
    "day": "2024-01-15"
  }'
```

## Monitoring

### Metrics

```bash
curl http://localhost:4201/metrics
```

Key metrics to watch:
- `oracle_ingest_rows_total` - Total ingested records
- `oracle_digest_built_total` - Total digests created
- `oracle_anchor_success_total` - Successful anchors
- `oracle_job_duration_seconds` - Job execution times

### Logs

```bash
# View application logs
docker-compose logs -f iot-oracle

# View specific component logs
docker-compose logs -f iot-oracle | grep "mqtt"
docker-compose logs -f iot-oracle | grep "aggregation"
```

## Validation

### Verify Digest Integrity

```bash
docker-compose exec iot-oracle npm run db:validate PRJ001 2024-01-15
```

This will:
1. Retrieve all telemetry records for the day
2. Recalculate the Merkle root
3. Verify energy summation
4. Check tCO2e calculation
5. Test Merkle proof generation

### Expected Output

```
[INFO] Starting validation...
[INFO] Found existing digest
[INFO] Retrieved 96 telemetry records
[INFO] Merkle root validation: PASS
[INFO] Energy validation: PASS
[INFO] tCO2e validation: PASS
[INFO] Merkle proof validation: PASS
[INFO] Validation passed - digest data is consistent
```

## Explorer Integration

### Deep Links

Once digests are anchored, you can create deep links to the explorer:

```
https://explorer.example.com/digest/PRJ001/2024-01-15
https://explorer.example.com/proof/PRJ001/2024-01-15/12:00:00
```

### Registry Integration

The oracle provides the registry with:
- Site metadata
- Daily digest summaries
- Merkle roots for verification
- Anchoring transaction hashes

## Troubleshooting

### Common Issues

1. **Health Check Fails**
   ```bash
   # Check database connection
   docker-compose exec postgres pg_isready -U postgres
   
   # Check Redis connection
   docker-compose exec redis redis-cli ping
   
   # Check MQTT connection
   docker-compose exec mqtt mosquitto_pub -h localhost -t test -m test
   ```

2. **No Data in Digests**
   ```bash
   # Check raw telemetry
   docker-compose exec iot-oracle npx prisma studio
   
   # Trigger manual aggregation
   curl -X POST http://localhost:4201/v1/recompute \
     -H "x-admin-key: your-admin-api-key" \
     -d '{"siteId": "PRJ001", "day": "2024-01-15"}'
   ```

3. **Anchoring Failures**
   ```bash
   # Check adapter API
   curl http://localhost:4100/health
   
   # Check environment variables
   docker-compose exec iot-oracle env | grep ADAPTER
   ```

### Performance Tuning

1. **Database Optimization**
   - Add indexes for common queries
   - Configure connection pooling
   - Monitor query performance

2. **Job Queue Tuning**
   - Adjust worker concurrency
   - Configure retry policies
   - Monitor queue depths

3. **Memory Usage**
   - Monitor heap usage
   - Configure garbage collection
   - Scale horizontally if needed

## Next Steps

1. **Production Deployment**
   - Configure production environment
   - Setup monitoring and alerting
   - Implement backup strategies

2. **Integration**
   - Connect real IoT devices
   - Integrate with registry
   - Setup explorer frontend

3. **Scaling**
   - Horizontal scaling with load balancers
   - Database sharding strategies
   - Caching implementations

## Support

For issues and questions:
- Check the logs first
- Review the integrity documentation
- Validate data consistency
- Contact the development team
