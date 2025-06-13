import os from 'os';
import { PrismaClient } from '@prisma/client';
import { notificationService } from './notification.service';

const prisma = new PrismaClient();

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
  redis: RedisStatus;
  websocket: WebSocketStatus;
}

export interface DatabaseStatus {
  status: 'connected' | 'disconnected';
  info?: {
    version: string;
    database: string;
    user: string;
    server_addr: string;
    server_port: number;
  };
  connectionPool?: {
    active: string;
  };
  error?: string;
}

export interface RedisStatus {
  publisher: {
    status: 'connected' | 'disconnected' | 'error';
    error: string | null;
  };
  subscriber: {
    status: 'connected' | 'disconnected' | 'error';
    error: string | null;
  };
}

export interface WebSocketStatus {
  status: 'active' | 'error';
  totalConnections?: number;
  uniqueUsers?: number;
  userConnections?: { [email: string]: number };
  error?: string;
}

export class HealthService {
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
        redis: await this.checkRedisConnections(),
        websocket: this.getWebSocketStatus(),
      },
    };

    return healthStatus;
  }

  /**
   * Determine if the application is healthy based on critical services
   */
  isHealthy(healthStatus: HealthStatus): boolean {
    return healthStatus.services.database.status === 'connected' &&
           healthStatus.services.redis.publisher.status === 'connected' &&
           healthStatus.services.redis.subscriber.status === 'connected';
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
   * Check database connection and retrieve connection information
   */
  private async checkDatabaseConnection(): Promise<DatabaseStatus> {
    try {
      // Simple query to test connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Get database info
      const result = await prisma.$queryRaw`
        SELECT 
          version() as version,
          current_database() as database,
          current_user as user,
          inet_server_addr() as server_addr,
          inet_server_port() as server_port
      ` as any[];

      return {
        status: 'connected',
        info: result[0],
        connectionPool: {
          // Note: Prisma doesn't expose pool stats directly, but we can check if connection works
          active: 'available',
        },
      };
    } catch (error) {
      return {
        status: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Redis publisher and subscriber connection status
   */
  private async checkRedisConnections(): Promise<RedisStatus> {
    const redisStatus: RedisStatus = {
      publisher: { status: 'unknown' as any, error: null },
      subscriber: { status: 'unknown' as any, error: null },
    };

    try {
      // Access Redis clients from notification service
      const redisPub = (notificationService as any).redisPub;
      const redisSub = (notificationService as any).redisSub;

      // Check publisher connection
      try {
        if (redisPub && redisPub.isReady) {
          await redisPub.ping();
          redisStatus.publisher.status = 'connected';
        } else {
          redisStatus.publisher.status = 'disconnected';
          redisStatus.publisher.error = 'Client not ready';
        }
      } catch (error) {
        redisStatus.publisher.status = 'disconnected';
        redisStatus.publisher.error = error instanceof Error ? error.message : 'Unknown error';
      }

      // Check subscriber connection
      try {
        if (redisSub && redisSub.isReady) {
          await redisSub.ping();
          redisStatus.subscriber.status = 'connected';
        } else {
          redisStatus.subscriber.status = 'disconnected';
          redisStatus.subscriber.error = 'Client not ready';
        }
      } catch (error) {
        redisStatus.subscriber.status = 'disconnected';
        redisStatus.subscriber.error = error instanceof Error ? error.message : 'Unknown error';
      }
    } catch (error) {
      redisStatus.publisher.status = 'error';
      redisStatus.subscriber.status = 'error';
      redisStatus.publisher.error = error instanceof Error ? error.message : 'Unknown error';
      redisStatus.subscriber.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return redisStatus;
  }

  /**
   * Get WebSocket connection status and active connections count
   */
  private getWebSocketStatus(): WebSocketStatus {
    try {
      // Access connections from notification service
      const connections = (notificationService as any).connections as Map<string, Set<any>>;
      
      let totalConnections = 0;
      const userConnections: { [email: string]: number } = {};
      
      for (const [email, socketSet] of connections.entries()) {
        const count = socketSet.size;
        userConnections[email] = count;
        totalConnections += count;
      }

      return {
        status: 'active',
        totalConnections,
        uniqueUsers: connections.size,
        userConnections,
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
}

export const healthService = new HealthService(); 