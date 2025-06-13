# Health Endpoint Documentation

## Overview

The `/health` endpoint provides comprehensive system health monitoring for the ChatFlow backend application. It returns detailed information about system resources, service connections, and operational status.

## Endpoint

```
GET /health
```

## Response Format

The endpoint returns a JSON object with the following structure:

### HTTP Status Codes
- **200 OK**: All critical services are healthy
- **503 Service Unavailable**: One or more critical services are unhealthy

### Response Structure

```json
{
  "status": "ok",
  "timestamp": "2025-06-13T00:09:08.498Z",
  "uptime": 1.642101333,
  "system": {
    "hostname": "server-hostname",
    "platform": "darwin",
    "arch": "arm64",
    "nodeVersion": "v23.10.0",
    "memory": {
      "used": 42,
      "total": 64,
      "system": 16384,
      "free": 97
    },
    "cpu": {
      "cores": 8,
      "loadAverage": [3.0, 3.2, 3.1]
    },
    "network": {
      "en0": ["192.168.0.165 (IPv4)", "fe80::... (IPv6)"]
    }
  },
  "services": {
    "database": {
      "status": "connected",
      "info": {
        "version": "PostgreSQL 15.13...",
        "database": "chatflow",
        "user": "chatflow",
        "server_addr": "172.21.0.3",
        "server_port": 5432
      },
      "connectionPool": {
        "active": "available"
      }
    },
    "redis": {
      "publisher": {
        "status": "connected",
        "error": null
      },
      "subscriber": {
        "status": "connected",
        "error": null
      }
    },
    "websocket": {
      "status": "active",
      "totalConnections": 5,
      "uniqueUsers": 3,
      "userConnections": {
        "user1@example.com": 2,
        "user2@example.com": 1,
        "user3@example.com": 2
      }
    }
  }
}
```

## Field Descriptions

### System Information
- **hostname**: Server hostname
- **platform**: Operating system platform
- **arch**: CPU architecture
- **nodeVersion**: Node.js version
- **memory**: Memory usage in MB (used, total, system, free)
- **cpu**: CPU information (cores, load average)
- **network**: Network interfaces with IP addresses

### Service Status

#### Database (Prisma/PostgreSQL)
- **status**: `connected` | `disconnected`
- **info**: Database connection details
  - **version**: PostgreSQL version
  - **database**: Database name
  - **user**: Database user
  - **server_addr**: Database server IP
  - **server_port**: Database server port
- **connectionPool**: Connection pool status

#### Redis
- **publisher**: Redis publisher client status
- **subscriber**: Redis subscriber client status
- Each client shows:
  - **status**: `connected` | `disconnected` | `error`
  - **error**: Error message if connection failed

#### WebSocket
- **status**: `active` | `error`
- **totalConnections**: Total number of active WebSocket connections
- **uniqueUsers**: Number of unique users connected
- **userConnections**: Object mapping user emails to their connection count

## Health Determination

The overall health status is determined by:
- Database connection status
- Redis publisher connection status  
- Redis subscriber connection status

If any of these critical services are not connected, the endpoint returns HTTP 503.

## Usage Examples

### Basic Health Check
```bash
curl http://localhost:3002/health
```

### Check Only Service Status
```bash
curl -s http://localhost:3002/health | jq '.services'
```

### Check WebSocket Connections
```bash
curl -s http://localhost:3002/health | jq '.services.websocket'
```

### Monitor Database Status
```bash
curl -s http://localhost:3002/health | jq '.services.database'
```

## Monitoring Integration

This endpoint is designed for integration with monitoring systems like:
- Kubernetes health checks
- Load balancer health probes
- Monitoring tools (Prometheus, Grafana, etc.)
- Uptime monitoring services

### Example Kubernetes Probe
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3002
  initialDelaySeconds: 30
  periodSeconds: 10
```

## Error Scenarios

### Database Disconnected
```json
{
  "services": {
    "database": {
      "status": "disconnected",
      "error": "Connection refused"
    }
  }
}
```

### Redis Connection Issues
```json
{
  "services": {
    "redis": {
      "publisher": {
        "status": "disconnected",
        "error": "Client not ready"
      },
      "subscriber": {
        "status": "connected",
        "error": null
      }
    }
  }
}
```

### WebSocket Service Error
```json
{
  "services": {
    "websocket": {
      "status": "error",
      "error": "Unable to access connection registry"
    }
  }
}
``` 