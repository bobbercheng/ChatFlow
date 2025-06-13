# Trade-offs and Key Technical Decisions

This document captures the deliberate compromises made while building **ChatFlow**, the alternatives we evaluated, and what we would improve with additional time.

## 1. Technology Stack

| Decision | Alternatives Considered | Why Chosen | Primary Trade-off |
|----------|------------------------|------------|-------------------|
| TypeScript across backend & frontend | Go, Python, Java | Single language reduces context-switching; strong type-safety and enormous ecosystem | Higher runtime overhead than Go; build step overhead |
| Node.js + Express / ws | NestJS, Fastify, Go (Gin/Fiber), Elixir Phoenix | Familiarity, rapid iteration, rich middleware | Less opinionated; needs extra patterns for large codebases |
| WebSockets for real-time | Server-Sent Events, long-polling, gRPC streaming | Full-duplex, broad browser support, low latency | Stateful connections require sticky sessions & memory |
| PostgreSQL (partitioned) | MySQL, MongoDB, DynamoDB, Cassandra | Strong relational model *and* JSON; mature partitioning & indexing | Vertical scaling ceiling; needs tuning for write spikes |
| Redis Pub/Sub for transient fan-out | Kafka, RabbitMQ, NATS | Zero-config, sub-millisecond latency, already used for cache, easy for local development | No persistence; best-effort delivery only |
| Kubernetes + HPA | AWS Lambda, ECS Fargate, Heroku | Fine-grained control, autoscaling, ubiquitous | Operational complexity; cluster management overhead |
| NGINX + lightweight Node gateway | Envoy, Kong, AWS API Gateway | Simple, low-footprint, easy sticky-session config | Fewer built-in policies / plugins than dedicated API-GW |
| JWT stateless auth | Session cookies, OAuth2 full flow | Works for SPA & mobile, caches well, avoids sticky sessions | Token revocation is harder; clock skew sensitivity |
| LWC for UI | React, Vue, Svelte | Re-uses existing component library in org | Smaller community; fewer ready-made chat widgets |

## 2. Key Architectural Choices

1. **Gateway pattern** – A single entry Node process handles both REST and WebSocket upgrades, simplifying DNS & TLS yet still letting us shard by service internally.
2. **Database partitioning** – Time-based partitions on `messages` enable cheap archiving and keep hot data in RAM.
3. **In-memory fan-out** – Chat delivery is pushed to connected clients via Redis Pub/Sub to avoid hits on Postgres.
4. **Thin services** – "Auth", "Conversation", and "RTC" services share code via a monorepo package, keeping duplicate logic minimal.

## 3. What We'd Improve With More Time

* Add **Kafka** for durable message streaming & retries when delivery fails.
* Implement **end-to-end encryption** for message payloads.
* Roll out **rate-limiting & abuse protection** at the gateway.
* Introduce **blue-green deployments** and automated smoke tests in CI.
* Build **offline push notifications** using APNs/FCM.
* Replace Redis Pub/Sub with **Redis Streams** or Kafka when group-chat fan-out exceeds a few thousand recipients.
* Harden observability (OpenTelemetry traces, SLOs, alert playbooks).

## 4. Known Limitations

1. Message order is guaranteed only within a single Node instance; cross-pod sequencing awaits Kafka integration.
2. At-least-once delivery: duplicates are possible; the client de-dupes by `messageId`. It can be resolved by appending current max message id to each new message.
3. No automated disaster-recovery scripts for Postgres yet (manual logical replication).
4. Nice UI with accessibility audits and mobile PWA optimisations.

---

_Last updated: <!-- TODO: date -->_ 