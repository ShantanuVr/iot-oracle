# IoT Oracle

A deterministic, auditable **Oracle** that ingests telemetry from IoT producers, verifies integrity, aggregates to daily/weekly digests, computes **tCO2e avoided**, and exposes **stable APIs** for consumers.

## Features

- **Multi-source Ingestion**: HTTP push, MQTT subscribe, and pull from iot-solar-sim
- **Data Integrity**: SHA-256 row hashing and Merkle tree verification
- **Aggregation**: Hourly and daily summaries with deterministic Merkle roots
- **Carbon Credits**: Automatic tCO2e calculation using configurable grid emission factors
- **Anchoring**: Optional on-chain anchoring via registry-adapter-api
- **Observability**: Comprehensive logging, metrics, and health checks
- **APIs**: Public read APIs and admin management endpoints

## Quick Start

### Using Docker Compose

1. **Clone and setup**:
   ```bash
   git clone <repository>
   cd iot-oracle
   cp env.example .env
   # Edit .env with your configuration
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Seed database**:
   ```bash
   docker-compose exec iot-oracle npm run db:seed
   ```

4. **Backfill sample data**:
   ```bash
   docker-compose exec iot-oracle npm run db:backfill PRJ001 2024-01-01 2024-01-31
   ```

5. **Test the API**:
   ```bash
   curl http://localhost:4201/health
   curl http://localhost:4201/v1/sites
   curl http://localhost:4201/v1/sites/PRJ001/digests/latest
   ```

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup database**:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

## Architecture

### Data Flow

```
IoT Devices → [HTTP/MQTT/Pull] → Raw Telemetry → Aggregation → Daily Digest → Anchoring
     ↓              ↓                    ↓              ↓              ↓
  Sensors      Normalization        Hourly Sum    Merkle Tree    On-chain Hash
```

### Components

- **Ingestion Layer**: HTTP push, MQTT subscribe, pull from sim
- **Data Models**: Normalization, validation, hashing
- **Aggregation**: Hourly/daily jobs with Merkle tree building
- **APIs**: Public read and admin management endpoints
- **Anchoring**: Optional on-chain anchoring
- **Observability**: Logging, metrics, health checks

## API Reference

### Public Endpoints

- `GET /health` - Health check
- `GET /v1/sites` - List all sites
- `GET /v1/sites/:id/digests/latest` - Latest digest for site
- `GET /v1/sites/:id/digests?from=YYYY-MM-DD&to=YYYY-MM-DD` - Digests in date range
- `GET /v1/sites/:id/digests/:day` - Specific digest
- `GET /v1/sites/:id/proof?day=YYYY-MM-DD&ts=ISO` - Merkle proof for telemetry row
- `GET /v1/sites/:id/preview/today` - Today's energy preview

### Admin Endpoints (require `x-admin-key` header)

- `POST /v1/sites` - Create/update site
- `POST /v1/backfill` - Backfill historical data
- `POST /v1/recompute` - Recompute digest
- `POST /v1/anchor` - Force anchor digest
- `DELETE /v1/raw` - Purge raw data

### Ingestion Endpoint

- `POST /v1/ingest` - Push telemetry data

## Configuration

### Environment Variables

```bash
# Server
PORT=4201
NODE_ENV=development

# Database
DATABASE_URL=postgres://postgres:password@localhost:5432/iot_oracle

# Redis (for job queues)
REDIS_URL=redis://localhost:6379

# MQTT
MQTT_URL=mqtt://localhost:1883

# Optional pull source
SIM_BASE_URL=http://localhost:4200

# Anchoring
ANCHOR_ENABLED=true
ADAPTER_API_URL=http://localhost:4100
ADAPTER_API_KEY=your-adapter-api-key

# Precision settings for hashing
HASH_PRECISION_POWER_DP=3
HASH_PRECISION_ENERGY_DP=2
HASH_PRECISION_TEMP_DP=1
HASH_PRECISION_IRR_DP=1

# Defaults
DEFAULT_BASELINE_FACTOR_KG_PER_KWH=0.82
DEFAULT_TIMEZONE=UTC

# Security
JWT_SECRET=your-jwt-secret-key
ADMIN_API_KEY=your-admin-api-key
```

### Site Configuration

Sites are configured in `src/config/sites.ts`:

```typescript
{
  id: 'PRJ001',
  name: 'Solar Farm Alpha',
  country: 'India',
  timezone: 'Asia/Kolkata',
  baselineKgPerKWh: 0.708,
  mqttTopic: 'iot/PRJ001/telemetry',
  pullEnabled: true,
}
```

## Data Model

### Raw Telemetry
- Site ID, timestamp, power/energy readings
- Row hash for integrity verification
- Source tracking (HTTP/MQTT/pull)

### Daily Digest
- Aggregated energy and avoided tCO2e
- Merkle root of all telemetry rows
- Anchoring status and transaction hashes

### Merkle Tree
- Deterministic ordering of row hashes
- Duplicate last hash for odd cardinality
- SHA-256 hashing throughout

## Scripts

- `npm run db:seed` - Seed database with default sites
- `npm run db:backfill <siteId> <from> <to>` - Backfill historical data
- `npm run db:validate <siteId> <day>` - Validate digest integrity
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server

## Monitoring

### Health Checks
- Database connectivity
- MQTT broker status
- Adapter API reachability

### Metrics (Prometheus)
- `oracle_ingest_rows_total{source, site_id}`
- `oracle_digest_built_total{site_id}`
- `oracle_anchor_success_total{site_id}`
- `oracle_job_duration_seconds{type, site_id}`

### Logging
- Structured JSON logging with request IDs
- Trace correlation across components
- Error tracking and alerting

## Security

- Public endpoints are read-only
- Admin endpoints require API key authentication
- Rate limiting and request size limits
- Input validation and sanitization
- Deterministic hashing prevents tampering

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### End-to-End Tests
```bash
docker-compose --profile testing up
npm run test:e2e
```

## Deployment

### Production Checklist

1. **Environment**: Set `NODE_ENV=production`
2. **Security**: Generate strong API keys and JWT secrets
3. **Database**: Run migrations and seed data
4. **Monitoring**: Configure logging and metrics collection
5. **Backup**: Setup database backups
6. **Scaling**: Configure Redis clustering if needed

### Docker Production

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
