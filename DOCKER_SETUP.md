# Docker Setup Documentation

## Overview

The ChatFlow application has been successfully containerized using Docker and Docker Compose. The setup includes:

- **PostgreSQL Database** (port 5434)
- **Redis Cache/Pub-Sub** (port 6380) 
- **Backend API Server** (port 3002)

## Services Configuration

### Backend Service

The backend service is built from a custom Dockerfile with the following features:

#### **Dockerfile Highlights**
- **Base Image**: `node:18-alpine`
- **Dependencies**: Includes OpenSSL for Prisma compatibility
- **Multi-stage Build**: Optimized for production deployment
- **Security**: Runs as non-root user (`chatflow:nodejs`)
- **Health Checks**: Built-in health monitoring

#### **Key Features**
- **Environment Configuration**: Uses `env.docker` for container-specific settings
- **Prisma Integration**: Automatic client generation and database connectivity
- **REST API Files**: Copies `openapi.yaml` and other non-TypeScript files to dist
- **Working Directory**: Properly configured for file path resolution

### Environment Configuration

#### **env.docker** (Container Environment)
```bash
DATABASE_URL=postgresql://chatflow:password@postgres:5432/chatflow
REDIS_URL=redis://redis:6379
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
PORT=3002
NODE_ENV=development
CORS_ORIGIN=http://localhost:3003
```

#### **env.local** (Local Development)
```bash
DATABASE_URL=postgresql://chatflow:password@localhost:5434/chatflow
REDIS_URL=redis://localhost:6380
# ... other settings same as env.docker
```

## Health Monitoring

### Enhanced Health Endpoint: `/health`

The backend includes a comprehensive health monitoring system:

```json
{
  "status": "ok",
  "timestamp": "2025-06-13T00:58:02.366Z",
  "uptime": 10.943163006,
  "system": {
    "hostname": "42751a633b7d",
    "platform": "linux",
    "arch": "arm64",
    "nodeVersion": "v18.20.8",
    "memory": { "used": 17, "total": 19, "system": 7838, "free": 2914 },
    "cpu": { "cores": 8, "loadAverage": [7.03, 6.98, 7] },
    "network": { "eth0": ["172.21.0.4 (IPv4)"] }
  },
  "services": {
    "database": {
      "status": "connected",
      "info": {
        "version": "PostgreSQL 15.13",
        "database": "chatflow",
        "user": "chatflow"
      }
    },
    "redis": {
      "publisher": { "status": "connected" },
      "subscriber": { "status": "connected" }
    },
    "websocket": {
      "status": "active",
      "totalConnections": 0,
      "uniqueUsers": 0
    }
  }
}
```

## Usage Commands

### **Start All Services**
```bash
docker-compose up -d
```

### **View Service Status**
```bash
docker-compose ps
```

### **View Logs**
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs postgres
docker-compose logs redis
```

### **Stop Services**
```bash
docker-compose down
```

### **Rebuild and Start**
```bash
docker-compose up --build -d
```

## API Endpoints

With the containerized backend running on port 3002:

- **Health Check**: http://localhost:3002/health
- **API Documentation**: http://localhost:3002/api-docs
- **WebSocket**: ws://localhost:3002/ws


## Development Workflow

### **Local Development** (Outside Docker)
1. Start infrastructure: `docker-compose up postgres redis -d`
2. Use `env.local` for environment variables
3. Run backend locally: `npm run dev`

### **Full Docker Development**
1. Start all services: `docker-compose up -d`
2. View logs: `docker-compose logs -f backend`
3. Make changes and rebuild: `docker-compose up --build -d`

## Security Considerations

- **Non-root User**: Backend runs as `chatflow:nodejs` (UID 1001)
- **Environment Isolation**: Separate environment files for different contexts
- **Network Isolation**: Services communicate via Docker internal network
- **Health Monitoring**: Comprehensive service status tracking

## Performance Features

- **Multi-stage Build**: Optimized Docker image size
- **Health Checks**: Automatic service monitoring and restart
- **Connection Pooling**: Prisma database connection management
- **Redis Pub/Sub**: Efficient real-time messaging

## Next Steps

1. **Production Deployment**: Configure production environment variables
2. **SSL/TLS**: Add HTTPS support for production
3. **Monitoring**: Integrate with monitoring solutions (Prometheus, Grafana)
4. **Scaling**: Configure horizontal scaling with load balancers
5. **CI/CD**: Set up automated deployment pipelines 