# Trade-offs and Key Technical Decisions

This document captures the deliberate compromises made while building **ChatFlow**, the alternatives we evaluated, and what we would improve with additional time.

## 1. Cost-Driven Serverless Migration

**Primary Motivation**: Reduce operational costs by 60-80% through serverless and cloud-native technologies while maintaining scalability and performance.

### Cost Comparison: Traditional vs Serverless

| Component | Traditional (Monthly) | Serverless (Monthly) | Savings |
|-----------|----------------------|---------------------|---------|
| Database (PostgreSQL + Redis) | $200-500 (managed instances) | $20-100 (pay-per-operation) | 70-80% |
| Compute (Kubernetes cluster) | $300-800 (3 nodes + management) | $50-200 (pay-per-request) | 75-85% |
| Load Balancer | $50-100 (dedicated) | $0-20 (integrated) | 80-100% |
| Monitoring & Logging | $100-200 (3rd party tools) | $10-50 (built-in Cloud Monitoring) | 75-90% |
| **Total Estimated** | **$650-1600** | **$80-370** | **~75%** |

### Serverless Benefits Beyond Cost
- **Zero infrastructure management**: No server patching, scaling decisions, or capacity planning
- **Automatic scaling**: From 0 to thousands of concurrent users without manual intervention
- **Built-in reliability**: Managed services provide 99.9%+ uptime with automatic failover
- **Global distribution**: Firestore and Cloud Run operate across multiple regions by default
- **Development velocity**: Focus on business logic instead of operations and infrastructure

## 2. Technology Stack

| Decision | Alternatives Considered | Why Chosen | Primary Trade-off |
|----------|------------------------|------------|-------------------|
| TypeScript across backend & frontend | Go, Python, Java | Single language reduces context-switching; strong type-safety and enormous ecosystem | Higher runtime overhead than Go; build step overhead |
| Node.js + Express / ws | NestJS, Fastify, Go (Gin/Fiber), Elixir Phoenix | Familiarity, rapid iteration, rich middleware, serverless compatibility | Less opinionated; needs extra patterns for large codebases |
| WebSockets for real-time | Server-Sent Events, long-polling, gRPC streaming | Full-duplex, broad browser support, low latency | Stateful connections require session affinity in serverless |
| **Cloud Firestore** | PostgreSQL, MongoDB, DynamoDB, Cassandra | **Serverless, zero-ops scaling, built-in real-time, pay-per-use pricing** | **Vendor lock-in; limited complex query capabilities** |
| **Cloud Pub/Sub** | Kafka, RabbitMQ, NATS, Redis Pub/Sub | **Serverless message delivery, automatic scaling, guaranteed delivery, global availability** | **Vendor lock-in; slightly higher latency than Redis** |
| **Cloud Run** | Kubernetes, AWS Lambda, ECS Fargate | **True serverless scaling, pay-per-request, no infrastructure management, Docker support** | **Cold start latency; less control over runtime environment** |
| Cloud Load Balancer | NGINX, Envoy, Kong | Managed service, automatic SSL, global anycast, integrates with Cloud Run | Less customization; higher cost than self-managed |
| JWT stateless auth | Session cookies, OAuth2 full flow | Works for SPA & mobile, caches well, perfect for serverless stateless design | Token revocation is harder; clock skew sensitivity |
| LWC for UI | React, Vue, Svelte | Re-uses existing component library in org | Smaller community; fewer ready-made chat widgets |

## 3. Key Architectural Choices

1. **Serverless-first design** – Cloud Run eliminates infrastructure management, provides automatic scaling, and enables pay-per-request pricing for significant cost reduction.
2. **Document-based data modeling** – Firestore's hierarchical structure (conversations > messages > status) reduces query complexity and eliminates join operations.
3. **Real-time fan-out via Pub/Sub** – Cloud Pub/Sub provides reliable, scalable message delivery with automatic retries and guaranteed delivery.
4. **Thin services with adapter pattern** – Database and messaging adapters enable easy switching between emulators (development) and production services.
5. **Cost optimization strategy** – Serverless components scale to zero when idle, dramatically reducing operational costs compared to always-on infrastructure.

## 4. What We'd Improve With More Time

* Implement **end-to-end encryption** for message payloads using client-side encryption.
* Add **Cloud Functions** for background processing (message cleanup, analytics, user activity tracking).
* Roll out **Cloud Endpoints** for advanced rate-limiting, API key management, and abuse protection.
* Introduce **Cloud Build** for CI/CD with automated testing and blue-green deployments to Cloud Run.
* Build **offline push notifications** using Firebase Cloud Messaging (FCM) integration.
* Add **Firestore security rules** for fine-grained access control and data validation.
* Implement **Cloud Monitoring** with custom metrics, SLOs, and alert policies for production readiness.
* Add **Cloud Storage** integration for file/image sharing with automatic virus scanning.
* Migrate from emulators to **production Firestore** with proper indexing strategies.

## 5. Known Limitations

1. **Firestore query limitations**: Complex queries requiring multiple inequality filters need composite indexes, which must be planned carefully.
2. **Message ordering**: Currently relies on timestamp-based IDs; true sequence ordering would require additional sequence fields.
3. **Vendor lock-in**: Heavy dependency on Google Cloud services makes migration to other providers complex.
4. **Cold start latency**: Cloud Run instances may experience ~1-2 second cold starts, though this is mitigated by minimum instances.
5. **Development complexity**: Emulator setup is more complex than traditional databases, requiring Docker and specific configurations.
6. **Limited offline capabilities**: Real-time features require network connectivity; offline message queuing not yet implemented.
7. **Cost monitoring**: Firestore's pay-per-operation model requires careful monitoring to avoid unexpected charges with high usage.

---

_Last updated: <!-- TODO: date -->_ 