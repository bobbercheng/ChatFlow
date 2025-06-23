import { WebSocket } from 'ws';
import { rateLimitService } from '../middleware/rate-limit';
import { EncryptionService } from '../middleware/encryption';
import { MESSAGE_LIMITS } from '../config/constants';

interface AuthenticatedWebSocket extends WebSocket {
  userEmail?: string;
  _socket?: any;
}

interface WebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: string;
}

interface WebSocketContext {
  ws: AuthenticatedWebSocket;
  message: WebSocketMessage;
  userEmail: string;
  clientIP: string;
}

interface RateLimitInfo {
  allowed: boolean;
  resetTime?: Date;
  remaining?: number;
}

export class WebSocketMiddlewareRunner {
  private static instance: WebSocketMiddlewareRunner;
  private userConnections = new Map<string, { ws: AuthenticatedWebSocket; lastActivity: number }>();
  private encryptionService = new EncryptionService();
  
  static getInstance(): WebSocketMiddlewareRunner {
    if (!this.instance) {
      this.instance = new WebSocketMiddlewareRunner();
    }
    return this.instance;
  }

  // Register connection for tracking
  registerConnection(userEmail: string, ws: AuthenticatedWebSocket): void {
    this.userConnections.set(userEmail, {
      ws,
      lastActivity: Date.now()
    });
  }

  unregisterConnection(userEmail: string): void {
    this.userConnections.delete(userEmail);
  }

  // Get client IP from WebSocket connection
  private getClientIP(ws: AuthenticatedWebSocket): string {
    return ws._socket?.remoteAddress || '127.0.0.1';
  }

  // Rate limiting for WebSocket connections
  async checkRateLimit(context: WebSocketContext): Promise<RateLimitInfo> {
    try {
      const { userEmail, clientIP } = context;
      
      // Check if user is currently being punished
      const isPunished = await rateLimitService.isPunished(clientIP, userEmail);
      if (isPunished) {
        return { allowed: false, resetTime: new Date(Date.now() + 15 * 60 * 1000) };
      }

      // Get user's rate limit configuration
      const userRateLimit = await rateLimitService.getUserRateLimit(userEmail);
      const config = rateLimitService.getConfig();
      
      // Determine rate limit based on user tier
      let limit = config.authorized.max;
      if (userRateLimit) {
        if (userRateLimit.tier === 'premium') {
          limit = config.premium.max;
        } else if (userRateLimit.tier === 'admin') {
          limit = config.admin.max;
        } else if (userRateLimit.requestsPerHour) {
          limit = userRateLimit.requestsPerHour;
        }
      }

      // Simple in-memory rate limiting (in production, use Redis or similar)
      const key = `ws_${userEmail}`;
      const windowStart = Math.floor(Date.now() / (15 * 60 * 1000)) * (15 * 60 * 1000);
      const requests = await this.getRequestCount(key, windowStart);
      
      if (requests >= limit) {
        // Log violation
        await rateLimitService.logViolation({
          ipAddress: clientIP,
          userEmail,
          violationType: 'user_limit',
          endpoint: '/ws',
          requestCount: requests,
          limit
        });

        return { 
          allowed: false, 
          resetTime: new Date(windowStart + 15 * 60 * 1000),
          remaining: 0
        };
      }

      // Increment request count
      await this.incrementRequestCount(key, windowStart);
      
      return { 
        allowed: true, 
        remaining: limit - requests - 1 
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // On error, allow the request but log it
      return { allowed: true };
    }
  }

  // Simple in-memory request counting (replace with Redis in production)
  private requestCounts = new Map<string, { count: number; windowStart: number }>();

  private async getRequestCount(key: string, windowStart: number): Promise<number> {
    const entry = this.requestCounts.get(key);
    if (!entry || entry.windowStart !== windowStart) {
      return 0;
    }
    return entry.count;
  }

  private async incrementRequestCount(key: string, windowStart: number): Promise<void> {
    const entry = this.requestCounts.get(key);
    if (!entry || entry.windowStart !== windowStart) {
      this.requestCounts.set(key, { count: 1, windowStart });
    } else {
      entry.count++;
    }
  }

  // Validate and decrypt encrypted fields
  async processEncryption(context: WebSocketContext): Promise<boolean> {
    try {
      const { message, userEmail } = context;
      
      if (!message.payload) {
        return true; // No payload to process
      }

      // Check if payload contains encrypted fields
      const hasEncryptedContent = this.hasEncryptedFields(message.payload);
      
      if (hasEncryptedContent) {
        // Validate encrypted field structure
        if (!this.validateEncryptedFieldStructure(message.payload)) {
          this.sendError(context.ws, 'Invalid encrypted field structure', 'ENCRYPTION_ERROR');
          return false;
        }

        // Decrypt the content field if it's encrypted
        if (message.payload.content && this.isEncryptedField(message.payload.content)) {
          try {
            message.payload.content = await this.encryptionService.decryptField(
              message.payload.content, 
              userEmail
            );
          } catch (error) {
            console.error('Decryption error:', error);
            this.sendError(context.ws, 'Decryption failed', 'DECRYPTION_ERROR');
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Encryption processing error:', error);
      this.sendError(context.ws, 'Encryption processing failed', 'ENCRYPTION_ERROR');
      return false;
    }
  }

  // Validate message payload
  validateMessage(context: WebSocketContext): boolean {
    const { message, ws } = context;
    
    if (!message || !message.type) {
      return true; // Allow empty/invalid messages to be handled elsewhere
    }
    
    if (message.type === 'message:create') {
      const { conversationId, content, messageType } = message.payload || {};
      
      // Required fields check
      if (!conversationId || !content) {
        this.sendError(ws, 'Missing required fields: conversationId, content', 'VALIDATION_ERROR');
        return false;
      }

      // Validate conversation ID format
      if (!/^conv_[0-9]+_[a-z0-9]+$/.test(conversationId)) {
        this.sendError(ws, 'Invalid conversationId format', 'VALIDATION_ERROR');
        return false;
      }

      // Validate content length (after decryption)
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      if (contentStr.length > MESSAGE_LIMITS.MAX_CONTENT_LENGTH) {
        this.sendError(ws, `Content too long (max ${MESSAGE_LIMITS.MAX_CONTENT_LENGTH.toLocaleString()} characters)`, 'VALIDATION_ERROR');
        return false;
      }

      // Validate message type
      if (messageType && !['TEXT', 'IMAGE', 'FILE'].includes(messageType)) {
        this.sendError(ws, 'Invalid messageType', 'VALIDATION_ERROR');
        return false;
      }
    }

    return true;
  }

  // Run the complete middleware pipeline
  async runMiddlewarePipeline(ws: AuthenticatedWebSocket, message: WebSocketMessage): Promise<boolean> {
    if (!ws.userEmail) {
      this.sendError(ws, 'User not authenticated', 'AUTH_ERROR');
      return false;
    }

    const context: WebSocketContext = {
      ws,
      message,
      userEmail: ws.userEmail,
      clientIP: this.getClientIP(ws)
    };

    try {
      // 1. Rate limiting
      const rateLimitResult = await this.checkRateLimit(context);
      if (!rateLimitResult.allowed) {
        this.sendError(ws, 'Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', {
          resetTime: rateLimitResult.resetTime,
          remaining: rateLimitResult.remaining
        });
        return false;
      }

      // 2. Encryption processing
      if (!(await this.processEncryption(context))) {
        return false;
      }

      // 3. Message validation
      if (!this.validateMessage(context)) {
        return false;
      }

      // Update activity timestamp
      this.updateActivity(ws.userEmail);

      return true;
    } catch (error) {
      console.error('Middleware pipeline error:', error);
      this.sendError(ws, 'Internal server error', 'MIDDLEWARE_ERROR');
      return false;
    }
  }

  // Helper methods
  private hasEncryptedFields(payload: any): boolean {
    if (!payload || typeof payload !== 'object') return false;
    
    // Check common encrypted fields
    return this.isEncryptedField(payload.content) || 
           this.isEncryptedField(payload.query) || 
           this.isEncryptedField(payload.suggestionText);
  }

  private isEncryptedField(field: any): boolean {
    return field && 
           typeof field === 'object' && 
           field.data && 
           field.encryption && 
           field.encryption.algorithm === 'AES-256-GCM';
  }

  private validateEncryptedFieldStructure(payload: any): boolean {
    if (!payload || typeof payload !== 'object') return true;
    
    for (const [, value] of Object.entries(payload)) {
      if (this.isEncryptedField(value)) {
        const encryption = (value as any).encryption;
        
        // Validate required encryption metadata
        if (!encryption.keyId || !encryption.iv || !encryption.tag || !encryption.timestamp) {
          return false;
        }
        
        // Validate timestamp (prevent replay attacks)
        const age = Date.now() - encryption.timestamp;
        if (age > 5 * 60 * 1000) { // 5 minutes
          return false;
        }
      }
    }
    
    return true;
  }

  private sendError(ws: AuthenticatedWebSocket, message: string, code: string, details?: any): void {
    ws.send(JSON.stringify({
      type: 'error',
      payload: {
        message,
        code,
        ...details
      },
      timestamp: new Date().toISOString()
    }));
  }

  private updateActivity(userEmail: string): void {
    const connection = this.userConnections.get(userEmail);
    if (connection) {
      connection.lastActivity = Date.now();
    }
  }

  // Monitoring and cleanup methods
  getActiveConnections(): number {
    return this.userConnections.size;
  }

  cleanupInactiveConnections(maxAge: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [userEmail, connection] of this.userConnections.entries()) {
      if (now - connection.lastActivity > maxAge) {
        this.unregisterConnection(userEmail);
      }
    }
  }

  // Clear caches for testing
  clearCaches(): void {
    this.requestCounts.clear();
    this.userConnections.clear();
  }
}

export const webSocketMiddleware = WebSocketMiddlewareRunner.getInstance(); 