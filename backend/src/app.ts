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
import searchRoutes from './rest/v1/routes/search';
import { healthService } from './services/health.service';

const app = express();

// CORS configuration
const getAllowedOrigins = () => {
  const corsOrigin = process.env['CORS_ORIGIN'];
  
  // Default development origins + Google Storage
  const defaultOrigins = [
    'http://localhost:3001', 
    'http://localhost:3003',
    'https://storage.googleapis.com'
  ];
  
  if (corsOrigin) {
    if (corsOrigin === '*') {
      return true; // Allow all origins
    }
    
    // Split comma-separated origins and add defaults for development
    const configuredOrigins = corsOrigin.split(',').map(origin => origin.trim());
    return [...defaultOrigins, ...configuredOrigins];
  }
  
  return defaultOrigins;
};

// Security middleware
app.use(helmet());

// CORS middleware with optimized preflight caching
// Note: Preflight requests (OPTIONS) are still required for:
// - Non-simple methods (anything other than GET, HEAD, POST)
// - Custom headers like Authorization
// - Content-Type other than application/x-www-form-urlencoded, multipart/form-data, or text/plain
// The maxAge helps reduce frequency by caching the preflight response
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Requested-With'],
  maxAge: 86400, // 24 hours (Safari caps at 1 hour, but other browsers respect this)
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Load OpenAPI specification
const openApiPath = path.join(__dirname, 'rest', 'v1', 'openapi.yaml');
const baseSwaggerDocument = YAML.load(openApiPath);

// Function to get server URL from request
const getServerUrlFromRequest = (req: express.Request) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}/v1`;
};

// Dynamic Swagger UI setup with request-based server URL
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', (req, res, next) => {
  // Clone the base document to avoid modifying the original
  const swaggerDocument = JSON.parse(JSON.stringify(baseSwaggerDocument));
  
  // Get the current server URL from the request
  const currentServerUrl = getServerUrlFromRequest(req);
  
  // Update the servers array
  if (swaggerDocument && swaggerDocument.servers) {
    // Add current server as the first option
    swaggerDocument.servers.unshift({
      url: currentServerUrl,
      description: 'Current Server'
    });
  }
  
  // Set up Swagger UI with the updated document
  const swaggerUiHandler = swaggerUi.setup(swaggerDocument, {
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
  });
  
  swaggerUiHandler(req, res, next);
});

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
app.use('/v1/search', searchRoutes);

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