# Changelog

All notable changes to the IoT Oracle project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added
- **Multi-source Data Ingestion**
  - HTTP push endpoint for telemetry data
  - MQTT subscriber with automatic topic discovery
  - Pull integration with iot-solar-sim

- **Data Integrity & Verification**
  - SHA-256 row hashing with deterministic normalization
  - Merkle tree construction for daily digests
  - Merkle proof generation and verification
  - Deterministic aggregation ensuring reproducibility

- **Carbon Credit Processing**
  - Automatic tCO2e calculation using configurable grid emission factors
  - Site-specific baseline factors (e.g., 0.708 kg CO2/kWh for India)
  - Daily energy aggregation and conversion

- **Comprehensive APIs**
  - Public read APIs: health, sites, digests, proofs, preview
  - Admin APIs: site management, backfill, recompute, anchor, purge
  - Ingestion API: HTTP push for telemetry data

- **Optional On-chain Anchoring**
  - Integration with registry-adapter-api
  - Automatic anchoring after daily aggregation
  - Manual anchor triggering via admin API

- **Production-Ready Infrastructure**
  - Docker containerization with health checks
  - Docker Compose with PostgreSQL, Redis, MQTT
  - Job scheduling with BullMQ
  - Comprehensive logging and metrics

- **Observability**
  - Prometheus metrics for monitoring
  - Structured JSON logging with request IDs
  - Health checks for all dependencies
  - Request tracing and correlation

- **Testing & Validation**
  - Unit tests for integrity verification
  - Validation scripts for deterministic recomputation
  - Backfill scripts for historical data processing
  - Comprehensive test coverage

- **Documentation**
  - Complete setup and usage guide
  - Detailed data integrity documentation
  - API tour with real examples
  - Contributing guidelines and code of conduct

### Technical Details
- **Architecture**: Node.js 20 + TypeScript with strict type safety
- **Database**: PostgreSQL + Prisma ORM for data persistence
- **Job Queue**: Redis + BullMQ for scheduling
- **API Server**: Fastify for high-performance endpoints
- **IoT Integration**: MQTT for real-time data ingestion
- **Monitoring**: Prometheus metrics for observability

### Security Features
- Deterministic processing preventing tampering
- Cryptographic verification with SHA-256 and Merkle proofs
- Comprehensive audit trail with request IDs
- Input validation with Zod schemas and value clamping
- API key-based admin authentication

### Performance Characteristics
- SHA-256 hashing: ~100MB/s on modern hardware
- Row hashing: O(1) per record
- Merkle tree: O(n log n) for n records
- Memory usage: O(n) storage for n records
- Proof size: O(log n) for n records

## [Unreleased]

### Planned Features
- Support for multiple blockchain networks
- Advanced analytics and reporting
- Integration with more IoT platforms
- Enhanced monitoring and alerting
- Horizontal scaling capabilities
- Caching implementations
- Database sharding strategies

### Known Issues
- None currently identified

---

## Release Notes

### v1.0.0 - Initial Release

This is the initial release of IoT Oracle, providing a complete solution for:
- Deterministic IoT data processing
- Carbon credit calculation and verification
- On-chain anchoring for immutable records
- Production-ready deployment with Docker

The system serves as the **bridge of trust** for telemetry → digest → on-chain hash, providing verifiable, reproducible, and auditable carbon credit data processing.

### Installation

```bash
git clone https://github.com/shantanuvr/iot-oracle.git
cd iot-oracle
docker-compose up -d
```

### Quick Start

```bash
# Seed database
docker-compose exec iot-oracle npm run db:seed

# Backfill sample data
docker-compose exec iot-oracle npm run db:backfill PRJ001 2024-01-01 2024-01-31

# Test the API
curl http://localhost:4201/health
curl http://localhost:4201/v1/sites/PRJ001/digests/latest
```

### Breaking Changes
- None (initial release)

### Migration Guide
- Not applicable (initial release)
