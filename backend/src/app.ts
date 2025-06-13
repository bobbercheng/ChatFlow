import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

import { errorHandler } from './middleware/error';
import { authRoutes } from './rest/v1/routes/auth';
import { userRoutes } from './rest/v1/routes/users';
import { conversationRoutes } from './rest/v1/routes/conversations';
import { messageRoutes } from './rest/v1/routes/messages';
import { healthService } from './services/health.service';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3003'],
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Load OpenAPI specification
const openApiPath = path.join(__dirname, 'rest', 'v1', 'openapi.yaml');
const swaggerDocument = YAML.load(openApiPath);

// Swagger UI with Bearer token support
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  swaggerOptions: {
    persistAuthorization: true,
    securityDefinitions: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
}));

// Enhanced health check with system status
app.get('/health', async (_req, res) => {
  try {
    const healthStatus = await healthService.getHealthStatus();
    const isHealthy = healthService.isHealthy(healthStatus);
    
    res.status(isHealthy ? 200 : 503).json(healthStatus);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API routes
app.use('/v1/auth', authRoutes);
app.use('/v1/users', userRoutes);
app.use('/v1/conversations', conversationRoutes);
app.use('/v1/conversations', messageRoutes);
app.use('/v1/messages', messageRoutes);

// 404 handler
app.use('*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 'ROUTE_NOT_FOUND',
    },
  });
});

// Error handling middleware
app.use(errorHandler);

export { app }; 