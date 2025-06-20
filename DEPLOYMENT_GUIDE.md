# ChatFlow Deployment Guide

## Overview
ChatFlow now uses **Google Cloud Firestore** and **Google Cloud Pub/Sub** instead of PostgreSQL and Redis. This guide covers both local development and production deployment.

## Prerequisites

### Local Development
- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Google Cloud SDK (for production deployment)

### Production Deployment
- Google Cloud Platform account
- gcloud CLI configured with appropriate permissions
- Firebase project with Firestore enabled

## Local Development Setup

### 1. Start Local Development Environment
```bash
# Start Firestore and Pub/Sub emulators with Docker
npm run docker:up

# Or start full development environment (emulators + backend)
npm run dev:full
```

### 2. Development Scripts
```bash
# Start just the backend in development mode
npm run dev

# Run tests
npm run test

# Build the application
npm run build

# View Docker logs
npm run docker:logs
```

### 3. Emulator Management
```bash
# Start emulators (Firestore + Pub/Sub)
npm run emulators:start

# Stop emulators
npm run emulators:stop

# Reset emulators (clear all data)
npm run docker:reset
```

## Production Deployment

### 1. Google Cloud Setup
```bash
# Create Firestore database
npm run firestore:setup

# Create Pub/Sub topics and subscriptions
npm run pubsub:setup

# Setup both Firestore and Pub/Sub
npm run gcp:setup
```

### 2. Deploy to Google Cloud
```bash
# Build and deploy to Google App Engine
npm run deploy

# Or deploy manually
npm run build
npm run gcp:deploy
```

### 3. Docker Deployment
```bash
# Build Docker images
npm run docker:build

# Deploy with Docker Compose
npm run docker:deploy

# Reset Docker environment
npm run docker:reset
```

## Environment Configuration

### Local Development (.env.local)
```bash
NODE_ENV=development
JWT_SECRET=your-local-jwt-secret
FIRESTORE_EMULATOR_HOST=localhost:8080
PUBSUB_EMULATOR_HOST=localhost:8085
GOOGLE_CLOUD_PROJECT=chatflow-dev
USE_FIRESTORE=true
USE_PUBSUB=true
```

### Production (.env.production)
```bash
NODE_ENV=production
JWT_SECRET=your-production-jwt-secret
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
USE_FIRESTORE=true
USE_PUBSUB=true
# FIRESTORE_EMULATOR_HOST and PUBSUB_EMULATOR_HOST should NOT be set in production
```

## Docker Services

The docker-compose.yml now includes:

### Firestore Emulator
- **Port**: 8080
- **Image**: google/cloud-sdk:alpine
- **Purpose**: Local Firestore development

### Pub/Sub Emulator  
- **Port**: 8085
- **Image**: google/cloud-sdk:alpine
- **Purpose**: Local Pub/Sub development

### Backend Service
- **Port**: 3002
- **Dependencies**: Firestore and Pub/Sub emulators
- **Health Check**: `/health` endpoint

## Firestore Collections Structure

```
users/{email}
  - hashedPassword: string
  - displayName: string
  - avatarUrl?: string
  - isOnline: boolean
  - lastSeen: timestamp
  - createdAt: timestamp

conversations/{conversationId}
  - type: 'DIRECT' | 'GROUP'
  - participantEmails: string[]
  - createdAt: timestamp
  - updatedAt: timestamp
  
  participants/{userEmail}
    - userId: string
    - role: 'ADMIN' | 'MEMBER'
    - joinedAt: timestamp
  
  messages/{messageId}
    - senderId: string
    - messageType: 'TEXT' | 'IMAGE' | 'FILE'
    - content: string
    - createdAt: timestamp
    - updatedAt: timestamp
    
    status/{userEmail}
      - userId: string
      - status: 'SENT' | 'DELIVERED' | 'READ'
      - sentAt: timestamp
      - deliveredAt?: timestamp
      - readAt?: timestamp
```

## Pub/Sub Topics

### chatflow-events
- **Purpose**: Cross-pod message distribution
- **Subscription**: chatflow-events-subscription
- **Message Types**: 
  - `message:new` - New message notifications
  - `message:status` - Read receipt updates

## Monitoring and Health Checks

### Health Endpoint
```bash
curl http://localhost:3002/health
```

Returns status of:
- Firestore connection
- Pub/Sub connection  
- WebSocket connections
- System resources

### Available Scripts Summary

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start backend in development mode |
| `npm run docker:up` | Start emulators |
| `npm run docker:deploy` | Build and deploy locally |
| `npm run gcp:setup` | Setup GCP resources |
| `npm run deploy` | Deploy to production |
| `npm run cleanup` | Clean up Docker resources |

## Troubleshooting

### Emulator Issues
```bash
# Reset emulators
npm run docker:reset

# Check emulator logs
npm run docker:logs
```

### GCP Authentication
```bash
# Login to gcloud
gcloud auth login

# Set project
gcloud config set project YOUR_PROJECT_ID

# Enable APIs
gcloud services enable firestore.googleapis.com
gcloud services enable pubsub.googleapis.com
```

### Port Conflicts
If ports 8080 or 8085 are in use:
1. Stop conflicting services
2. Modify `docker-compose.yml` port mappings
3. Update environment variables accordingly

## Migration from PostgreSQL/Prisma

The migration has been completed! Key changes:
- ✅ PostgreSQL → Firestore
- ✅ Prisma ORM → Firestore SDK  
- ✅ Redis Pub/Sub → GCP Pub/Sub
- ✅ Docker composition updated
- ✅ Test infrastructure updated

For production deployment, ensure you:
1. Set up GCP project and enable APIs
2. Configure authentication
3. Run `npm run gcp:setup` to create resources
4. Deploy with `npm run deploy` 