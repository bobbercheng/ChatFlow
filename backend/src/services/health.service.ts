import os from 'os';
import { databaseAdapter } from '../adapters';
import { notificationService } from './notification.service';

export interface HealthStatus {
  status: string;
  timestamp: string;
  uptime: number;
  system: SystemInfo;
  services: ServicesStatus;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  memory: {
    used: number;
    total: number;
    system: number;
    free: number;
  };
  cpu: {
    cores: number;
    loadAverage: number[];
  };
  network: { [key: string]: string[] };
}

export interface ServicesStatus {
  database: DatabaseStatus;
  pubsub: PubSubStatus;
  websocket: WebSocketStatus;
}

export interface DatabaseStatus {
  status: 'connected' | 'disconnected';
  type: 'firestore' | 'postgresql';
  info?: {
    project?: string;
    collections?: number;
  };
  error?: string;
}

export interface PubSubStatus {
  status: 'connected' | 'disconnected' | 'error';
  type: 'gcp-pubsub';
  details?: string;
  topics?: string[];
  subscriptions?: string[];
}

export interface WebSocketStatus {
  status: 'active' | 'error';
  totalConnections?: number;
  uniqueUsers?: number;
  userConnections?: { [email: string]: number };
  error?: string;
}

export class HealthServicePubSub {
  /**
   * Get comprehensive health status of the application
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const healthStatus: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      system: this.getSystemInfo(),
      services: {
        database: await this.checkDatabaseConnection(),
        pubsub: await this.checkPubSubConnection(),
        websocket: await this.getWebSocketStatus(),
      },
    };

    // Determine overall status
    healthStatus.status = this.isHealthy(healthStatus) ? 'healthy' : 'unhealthy';

    return healthStatus;
  }

  /**
   * Determine if the application is healthy based on critical services
   */
  isHealthy(healthStatus: HealthStatus): boolean {
    return healthStatus.services.database.status === 'connected' &&
           healthStatus.services.pubsub.status === 'connected' &&
           healthStatus.services.websocket.status === 'active';
  }

  /**
   * Get system information including CPU, memory, and network details
   */
  private getSystemInfo(): SystemInfo {
    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        system: Math.round(os.totalmem() / 1024 / 1024),
        free: Math.round(os.freemem() / 1024 / 1024),
      },
      cpu: {
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      network: this.getNetworkInterfaces(),
    };
  }

  /**
   * Check Firestore database connection
   */
  private async checkDatabaseConnection(): Promise<DatabaseStatus> {
    try {
      // Test basic operations with Firestore adapter
      const testCollectionName = 'health-check';
      const testId = `health-${Date.now()}`;
      
      // Try to create a test document
      await databaseAdapter.create(testCollectionName, testId, { test: true, timestamp: new Date() });
      
      // Try to read it back
      await databaseAdapter.findById(testCollectionName, testId);
      
      // Clean up test document
      await databaseAdapter.delete(testCollectionName, testId);

      return {
        status: 'connected',
        type: 'firestore',
        info: {
          project: process.env['GOOGLE_CLOUD_PROJECT'] || 'unknown',
          collections: 1, // Could expand to count actual collections
        },
      };
    } catch (error) {
      return {
        status: 'disconnected',
        type: 'firestore',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check GCP Pub/Sub connection status
   */
  private async checkPubSubConnection(): Promise<PubSubStatus> {
    try {
      const health = await notificationService.checkHealth();
      
      const result: PubSubStatus = {
        status: health.pubSub?.status === 'healthy' ? 'connected' : 'disconnected',
        type: 'gcp-pubsub',
        topics: ['chatflow-events'],
        subscriptions: ['chatflow-events-subscription'],
      };

      if (health.pubSub?.details) {
        result.details = health.pubSub.details;
      }

      return result;
    } catch (error) {
      return {
        status: 'error',
        type: 'gcp-pubsub',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get WebSocket connection status from notification service
   */
  private async getWebSocketStatus(): Promise<WebSocketStatus> {
    try {
      const health = await notificationService.checkHealth();
      const stats = notificationService.getConnectionStats();
      
      return {
        status: 'active',
        totalConnections: health.connections?.total || 0,
        uniqueUsers: health.connections?.users || 0,
        userConnections: this.buildUserConnectionsMap(stats.connectedUsers),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build user connections map for health response
   */
  private buildUserConnectionsMap(connectedUsers: string[]): { [email: string]: number } {
    const connectionMap: { [email: string]: number } = {};
    
    // For now, assume 1 connection per user (could be enhanced to show actual counts)
    for (const email of connectedUsers) {
      connectionMap[email] = 1;
    }
    
    return connectionMap;
  }

  /**
   * Get network interfaces with external IP addresses
   */
  private getNetworkInterfaces(): { [key: string]: string[] } {
    const interfaces = os.networkInterfaces();
    const result: { [key: string]: string[] } = {};
    
    for (const [name, addresses] of Object.entries(interfaces)) {
      if (addresses) {
        result[name] = addresses
          .filter(addr => !addr.internal)
          .map(addr => `${addr.address} (${addr.family})`);
      }
    }
    
    return result;
  }

  /**
   * Get detailed service information for debugging
   */
  async getDetailedStatus(): Promise<{
    health: HealthStatus;
    database: { adapter: string; mock: boolean };
    pubsub: { adapter: string; mock: boolean; topics: string[]; subscriptions: string[] };
    notifications: { connections: any; stats: any };
  }> {
    const health = await this.getHealthStatus();
    const notificationStats = notificationService.getConnectionStats();

    return {
      health,
      database: {
        adapter: 'firestore',
        mock: true, // Will be false when using real Firestore
      },
      pubsub: {
        adapter: 'gcp-pubsub', 
        mock: true, // Will be false when using real GCP Pub/Sub
        topics: ['chatflow-events'],
        subscriptions: ['chatflow-events-subscription'],
      },
      notifications: {
        connections: notificationStats,
        stats: await notificationService.checkHealth(),
      },
    };
  }

  /**
   * Perform a quick health check (faster than full status)
   */
  async quickHealthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; timestamp: string }> {
    try {
      // Quick checks for critical services
      const [dbHealthy, pubsubHealthy] = await Promise.all([
        this.quickDbCheck(),
        this.quickPubSubCheck(),
      ]);

      const isHealthy = dbHealthy && pubsubHealthy;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async quickDbCheck(): Promise<boolean> {
    try {
      // Simple adapter availability check
      return databaseAdapter !== null;
    } catch {
      return false;
    }
  }

  private async quickPubSubCheck(): Promise<boolean> {
    try {
      const health = await notificationService.checkHealth();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}

export const healthService = new HealthServicePubSub(); 