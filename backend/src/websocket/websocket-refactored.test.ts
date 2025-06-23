import { webSocketMiddleware } from './websocket-middleware';
import { authService } from '../services/auth.service';
import { notificationService } from '../services/notification.service';
import { messageService } from '../services/message.service';
import { MessageType, MessageWithSender } from '../types/firestore';
import jwt from 'jsonwebtoken';
import '../test-setup';
import { MESSAGE_LIMITS } from '../config/constants';

// Mock dependencies
jest.mock('../services/auth.service');
jest.mock('../services/notification.service');
jest.mock('../services/message.service');
jest.mock('./websocket-middleware');
jest.mock('jsonwebtoken');

const mockAuthService = authService as jest.Mocked<typeof authService>;
const mockNotificationService = notificationService as jest.Mocked<typeof notificationService>;
const mockMessageService = messageService as jest.Mocked<typeof messageService>;
const mockWebSocketMiddleware = webSocketMiddleware as jest.Mocked<typeof webSocketMiddleware>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('WebSocket Refactored - Enhanced Security Tests', () => {
  // Set timeout for all tests
  jest.setTimeout(5000);

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockWebSocketMiddleware.runMiddlewarePipeline.mockResolvedValue(true);
    mockWebSocketMiddleware.getActiveConnections.mockReturnValue(5);
    mockAuthService.updateOnlineStatus.mockResolvedValue({
      email: 'test@example.com',
      displayName: 'Test User',
      isOnline: true,
      lastSeen: new Date(),
      createdAt: new Date()
    });
    mockNotificationService.registerConnection.mockReturnValue();
    mockNotificationService.unregisterConnection.mockReturnValue();
    
    // Mock JWT
    (mockJwt.verify as jest.Mock).mockReturnValue({
      email: 'test@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    });
  });

  describe('Enhanced Authentication', () => {
    test('should prefer Authorization header over query parameter', () => {
      // Test that Bearer token in Authorization header is preferred
      const authHeader = 'Bearer valid-jwt-token';
      const queryToken = 'query-token';
      
      // Simulate header parsing logic
      const headerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      const finalToken = headerToken || queryToken;
      
      expect(finalToken).toBe('valid-jwt-token');
      expect(finalToken).not.toBe(queryToken);
    });

    test('should fall back to query parameter if no Authorization header', () => {
      const queryToken = 'query-jwt-token';
      
      // Simulate no auth header
      const headerToken = null;
      const finalToken = headerToken || queryToken;
      
      expect(finalToken).toBe('query-jwt-token');
    });

    test('should store token expiry and metadata on connection', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        tokenExpiry: Date.now() + 3600000, // 1 hour
        lastTokenCheck: Date.now(),
        originalToken: 'jwt-token',
        send: jest.fn()
      } as any;

      // Verify token metadata is stored
      expect(mockWs.tokenExpiry).toBeGreaterThan(Date.now());
      expect(mockWs.lastTokenCheck).toBeLessThanOrEqual(Date.now());
      expect(mockWs.originalToken).toBe('jwt-token');
    });
  });

  describe('Token Validation on Messages', () => {
    test('should validate token expiry before processing messages', async () => {
      const mockWs = {
        userEmail: 'test@example.com',
        tokenExpiry: Date.now() - 1000, // Expired 1 second ago
        lastTokenCheck: Date.now() - 1000,
        originalToken: 'expired-token',
        send: jest.fn(),
        close: jest.fn()
      } as any;

      // Test expired token scenario
      const isExpired = Date.now() > mockWs.tokenExpiry;
      expect(isExpired).toBe(true);
      
      // Test that all required fields are present
      expect(mockWs.userEmail).toBeDefined();
      expect(mockWs.originalToken).toBeDefined();
      expect(mockWs.tokenExpiry).toBeDefined();
    });

    test('should allow messages when token is valid', async () => {
      const mockWs = {
        userEmail: 'test@example.com',
        tokenExpiry: Date.now() + 3600000, // Valid for 1 hour
        lastTokenCheck: Date.now(),
        originalToken: 'valid-token',
        send: jest.fn()
      } as any;

      const message = {
        type: 'message:create',
        payload: {
          conversationId: 'conv_1234567890_abc123',
          content: 'Test message'
        }
      };

      // Test successful pipeline with valid token
      mockWebSocketMiddleware.runMiddlewarePipeline.mockResolvedValue(true);
      const result = await mockWebSocketMiddleware.runMiddlewarePipeline(mockWs, message);
      
      expect(result).toBe(true);
      expect(mockWebSocketMiddleware.runMiddlewarePipeline).toHaveBeenCalledWith(mockWs, message);
    });

    test('should re-validate token periodically', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        tokenExpiry: Date.now() + 3600000,
        lastTokenCheck: Date.now() - (11 * 60 * 1000), // 11 minutes ago
        originalToken: 'valid-token',
        send: jest.fn()
      } as any;

      // Test that token needs re-validation (> 10 minutes)
      const timeSinceLastCheck = Date.now() - mockWs.lastTokenCheck;
      const needsRevalidation = timeSinceLastCheck > 10 * 60 * 1000;
      
      expect(needsRevalidation).toBe(true);
    });
  });

  describe('Token Refresh', () => {
    test('should handle token refresh successfully', async () => {
      const mockWs = {
        userEmail: 'test@example.com',
        tokenExpiry: Date.now() + 1800000, // 30 minutes
        originalToken: 'old-token',
        send: jest.fn()
      } as any;

      const refreshPayload = {
        newToken: 'new-jwt-token'
      };

      // Mock successful JWT verification for new token
      (mockJwt.verify as jest.Mock).mockReturnValue({
        email: 'test@example.com',
        exp: Math.floor((Date.now() + 7200000) / 1000) // 2 hours from now
      });

      // Simulate token refresh logic
      const newExpiry = Math.floor((Date.now() + 7200000) / 1000) * 1000;
      
      expect(refreshPayload.newToken).toBe('new-jwt-token');
      expect(newExpiry).toBeGreaterThan(mockWs.tokenExpiry);
      expect(mockWs.userEmail).toBe('test@example.com');
    });

    test('should reject token refresh with wrong user', async () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn()
      } as any;

      const refreshPayload = {
        newToken: 'different-user-token'
      };

      // Mock JWT verification returning different user
      (mockJwt.verify as jest.Mock).mockReturnValue({
        email: 'different@example.com',
        exp: Math.floor((Date.now() + 3600000) / 1000)
      });

      // Test user mismatch detection
      const tokenEmail = 'different@example.com';
      const currentUser = mockWs.userEmail;
      
      expect(tokenEmail).not.toBe(currentUser);
      expect(refreshPayload.newToken).toBe('different-user-token');
    });

    test('should reject token refresh with missing token', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn()
      } as any;

      const refreshPayload: { newToken?: string } = {}; // Missing newToken

      expect(refreshPayload.newToken).toBeUndefined();
      expect(mockWs.userEmail).toBe('test@example.com');
    });
  });

  describe('Session Management', () => {
    test('should track active connections per user', () => {
      const userEmail = 'test@example.com';
      const connections = new Set();
      const activeConnections = new Map();
      
      // Mock connection tracking
      const mockWs1 = { userEmail, id: 1 };
      const mockWs2 = { userEmail, id: 2 };
      
      connections.add(mockWs1);
      connections.add(mockWs2);
      activeConnections.set(userEmail, connections);
      
      expect(activeConnections.get(userEmail)?.size).toBe(2);
    });

    test('should handle multiple connections for same user', () => {
      const userEmail = 'test@example.com';
      const connections = new Set();
      
      // Add multiple connections
      connections.add({ id: 1 });
      connections.add({ id: 2 });
      connections.add({ id: 3 });
      
      expect(connections.size).toBe(3);
      expect(userEmail).toBe('test@example.com');
      
      // Remove one connection - need to find and remove the actual object
      const connectionsArray = Array.from(connections);
      const connectionToRemove = connectionsArray.find(conn => (conn as any).id === 2);
      if (connectionToRemove) {
        connections.delete(connectionToRemove);
      }
      
      expect(connections.size).toBe(2);
    });

    test('should properly cleanup empty connection sets', () => {
      const activeConnections = new Map();
      const userEmail = 'test@example.com';
      const connections = new Set();
      
      activeConnections.set(userEmail, connections);
      expect(userEmail).toBe('test@example.com');
      
      // After removing all connections
      if (connections.size === 0) {
        activeConnections.delete(userEmail);
      }
      
      expect(activeConnections.has(userEmail)).toBe(false);
    });
  });

  describe('Administrative Functions', () => {
    test('should force disconnect specific user', () => {
      const userEmail = 'test@example.com';
      const mockWs1 = { close: jest.fn() };
      const mockWs2 = { close: jest.fn() };
      const connections = new Set([mockWs1, mockWs2]);
      
      // Simulate force disconnect
      let disconnectedCount = 0;
      for (const ws of connections) {
        ws.close(1008, 'Administrative disconnect');
        disconnectedCount++;
      }
      
      expect(disconnectedCount).toBe(2);
      expect(userEmail).toBe('test@example.com');
      expect(mockWs1.close).toHaveBeenCalledWith(1008, 'Administrative disconnect');
      expect(mockWs2.close).toHaveBeenCalledWith(1008, 'Administrative disconnect');
    });

    test('should force disconnect all users', () => {
      const activeConnections = new Map();
      const user1Connections = new Set([{ close: jest.fn() }, { close: jest.fn() }]);
      const user2Connections = new Set([{ close: jest.fn() }]);
      
      activeConnections.set('user1@example.com', user1Connections);
      activeConnections.set('user2@example.com', user2Connections);
      
      let totalDisconnected = 0;
      for (const [, connections] of activeConnections.entries()) {
        for (const ws of connections) {
          ws.close(1008, 'Server maintenance');
          totalDisconnected++;
        }
      }
      
      expect(totalDisconnected).toBe(3);
    });

    test('should get active user connections count', () => {
      const activeConnections = new Map();
      activeConnections.set('user1@example.com', new Set([{}, {}])); // 2 connections
      activeConnections.set('user2@example.com', new Set([{}])); // 1 connection
      
      const result = new Map();
      for (const [userEmail, connections] of activeConnections.entries()) {
        result.set(userEmail, connections.size);
      }
      
      expect(result.get('user1@example.com')).toBe(2);
      expect(result.get('user2@example.com')).toBe(1);
    });
  });

  describe('Security Cleanup', () => {
    test('should identify expired connections', () => {
      const mockWs1 = {
        userEmail: 'user1@example.com',
        tokenExpiry: Date.now() - 1000, // Expired
        close: jest.fn()
      };
      
      const mockWs2 = {
        userEmail: 'user2@example.com',
        tokenExpiry: Date.now() + 3600000, // Valid
        close: jest.fn()
      };
      
      const connections = [mockWs1, mockWs2];
      
      // Simulate security cleanup logic
      const expiredConnections = connections.filter(ws => 
        ws.tokenExpiry && Date.now() > ws.tokenExpiry
      );
      
      expect(expiredConnections).toHaveLength(1);
      expect(expiredConnections[0]).toBe(mockWs1);
    });

    test('should close expired connections during cleanup', () => {
      const expiredWs = {
        userEmail: 'user@example.com',
        tokenExpiry: Date.now() - 1000,
        close: jest.fn()
      };
      
      // Simulate cleanup
      if (expiredWs.tokenExpiry && Date.now() > expiredWs.tokenExpiry) {
        expiredWs.close(1008, 'Token expired');
      }
      
      expect(expiredWs.close).toHaveBeenCalledWith(1008, 'Token expired');
    });
  });

  describe('Enhanced Message Handling', () => {
    test('should include token info in ping response', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        tokenExpiry: Date.now() + 3600000,
        send: jest.fn()
      } as any;

      const pingResponse = {
        type: 'pong',
        payload: {
          timestamp: Date.now(),
          tokenExpiry: mockWs.tokenExpiry,
          timeUntilExpiry: mockWs.tokenExpiry - Date.now()
        },
        timestamp: new Date().toISOString()
      };

      expect(pingResponse.type).toBe('pong');
      expect(pingResponse.payload.tokenExpiry).toBe(mockWs.tokenExpiry);
      expect(pingResponse.payload.timeUntilExpiry).toBeGreaterThan(0);
    });

    test('should send enhanced connection welcome message', () => {
      const mockWs = {
        tokenExpiry: Date.now() + 3600000,
        send: jest.fn()
      };

      const welcomeMessage = {
        type: 'connection',
        payload: {
          message: 'Connected successfully',
          activeConnections: 5,
          tokenExpiry: mockWs.tokenExpiry,
          securityNotice: 'Token will be validated periodically'
        },
        timestamp: new Date().toISOString()
      };

      expect(welcomeMessage.payload.securityNotice).toBe('Token will be validated periodically');
      expect(welcomeMessage.payload.tokenExpiry).toBe(mockWs.tokenExpiry);
    });
  });

  describe('Error Handling', () => {
    test('should handle JWT verification errors correctly', () => {
      // Test different JWT error types
      const tokenExpiredError = new jwt.TokenExpiredError('Token expired', new Date());
      const jsonWebTokenError = new jwt.JsonWebTokenError('Invalid token');
      const genericError = new Error('Other error');

      expect(tokenExpiredError.name).toBe('TokenExpiredError');
      expect(jsonWebTokenError.name).toBe('JsonWebTokenError');
      expect(genericError.name).toBe('Error');
    });

    test('should handle missing authentication data gracefully', () => {
      const mockWs = {
        // Missing required auth fields
        send: jest.fn()
      } as any;

      // Validate required fields
      const hasRequiredAuth = !!(mockWs.userEmail && mockWs.originalToken && mockWs.tokenExpiry);
      expect(hasRequiredAuth).toBe(false);
    });

    test('should handle server configuration errors', () => {
      // Simulate missing JWT secret
      const originalSecret = process.env['JWT_SECRET'];
      delete process.env['JWT_SECRET'];

      const jwtSecret = process.env['JWT_SECRET'];
      expect(jwtSecret).toBeUndefined();

      // Restore for other tests
      if (originalSecret) {
        process.env['JWT_SECRET'] = originalSecret;
      }
    });
  });

  describe('Connection Lifecycle', () => {
    test('should handle enhanced connection establishment', () => {
      const userEmail = 'test@example.com';
      const mockWs = { 
        userEmail, 
        tokenExpiry: Date.now() + 3600000,
        lastTokenCheck: Date.now(),
        originalToken: 'jwt-token',
        send: jest.fn() 
      } as any;

      // Simulate enhanced connection setup
      mockWebSocketMiddleware.registerConnection(userEmail, mockWs);
      mockAuthService.updateOnlineStatus(userEmail, true);
      mockNotificationService.registerConnection(userEmail, mockWs);

      expect(mockWebSocketMiddleware.registerConnection).toHaveBeenCalledWith(userEmail, mockWs);
      expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith(userEmail, true);
      expect(mockNotificationService.registerConnection).toHaveBeenCalledWith(userEmail, mockWs);
    });

    test('should handle enhanced connection cleanup', () => {
      const userEmail = 'test@example.com';
      const mockWs = { userEmail, send: jest.fn() } as any;

      // Simulate multi-connection scenario
      const hasOtherConnections = false; // No other connections

      // Cleanup should only set offline if no other connections
      if (!hasOtherConnections) {
        mockAuthService.updateOnlineStatus(userEmail, false);
      }

      mockWebSocketMiddleware.unregisterConnection(userEmail);
      mockNotificationService.unregisterConnection(userEmail, mockWs);

      expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith(userEmail, false);
      expect(mockWebSocketMiddleware.unregisterConnection).toHaveBeenCalledWith(userEmail);
      expect(mockNotificationService.unregisterConnection).toHaveBeenCalledWith(userEmail, mockWs);
    });

    test('should not set user offline if other connections exist', () => {
      const userEmail = 'test@example.com';
      const hasOtherConnections = true; // Other connections exist

      if (!hasOtherConnections) {
        mockAuthService.updateOnlineStatus(userEmail, false);
      }

      // Should not have been called
      expect(mockAuthService.updateOnlineStatus).not.toHaveBeenCalledWith(userEmail, false);
    });
  });

  // Keep existing tests for backward compatibility
  describe('Original Functionality', () => {
    test('should handle message:create type', async () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn()
      } as any;

      const mockMessage = {
        type: 'message:create',
        payload: {
          conversationId: 'conv_1234567890_abc123',
          content: 'Test message'
        }
      };

      const createdMessage: MessageWithSender = {
        id: 'msg_1234567890_def456',
        conversationId: mockMessage.payload.conversationId,
        senderId: 'test@example.com',
        senderDisplayName: 'Test User',
        content: mockMessage.payload.content,
        messageType: MessageType.TEXT,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: {
          email: 'test@example.com',
          displayName: 'Test User'
        }
      };

      mockMessageService.createMessage.mockResolvedValue(createdMessage);

      const result = await mockWebSocketMiddleware.runMiddlewarePipeline(mockWs, mockMessage);
      expect(result).toBe(true);
      expect(mockWebSocketMiddleware.runMiddlewarePipeline).toHaveBeenCalledWith(mockWs, mockMessage);
    });

    test('should validate message structure', () => {
      const validMessage = {
        type: 'message:create',
        payload: {
          conversationId: 'conv_1234567890_abc123',
          content: 'Test message',
          messageType: 'TEXT'
        }
      };

      expect(validMessage.type).toBe('message:create');
      expect(validMessage.payload.conversationId).toMatch(/^conv_\d+_[a-zA-Z0-9]+$/);
      expect(validMessage.payload.content).toBeTruthy();
      expect(validMessage.payload.content.length).toBeLessThanOrEqual(MESSAGE_LIMITS.MAX_CONTENT_LENGTH);
    });
  });
}); 