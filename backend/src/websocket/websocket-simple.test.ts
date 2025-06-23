import { webSocketMiddleware } from './websocket-middleware';
import * as websocketRefactored from './websocket-refactored';
import { MESSAGE_LIMITS } from '../config/constants';

describe('WebSocket Implementation - Basic Tests', () => {
  // Set test timeout
  jest.setTimeout(5000);

  beforeEach(() => {
    // Clear any existing caches
    webSocketMiddleware.clearCaches();
  });

  describe('WebSocket Middleware', () => {
    test('should have expected methods', () => {
      expect(webSocketMiddleware.registerConnection).toBeInstanceOf(Function);
      expect(webSocketMiddleware.unregisterConnection).toBeInstanceOf(Function);
      expect(webSocketMiddleware.runMiddlewarePipeline).toBeInstanceOf(Function);
      expect(webSocketMiddleware.getActiveConnections).toBeInstanceOf(Function);
      expect(webSocketMiddleware.cleanupInactiveConnections).toBeInstanceOf(Function);
      expect(webSocketMiddleware.clearCaches).toBeInstanceOf(Function);
    });

    test('should track connections', () => {
      expect(webSocketMiddleware.getActiveConnections()).toBe(0);
      
      // Mock WebSocket object
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn()
      } as any;

      webSocketMiddleware.registerConnection('test@example.com', mockWs);
      expect(webSocketMiddleware.getActiveConnections()).toBe(1);

      webSocketMiddleware.unregisterConnection('test@example.com');
      expect(webSocketMiddleware.getActiveConnections()).toBe(0);
    });

    test('should cleanup inactive connections', (done) => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn()
      } as any;

      webSocketMiddleware.registerConnection('test@example.com', mockWs);
      expect(webSocketMiddleware.getActiveConnections()).toBe(1);

      // Wait a bit then cleanup with very short max age
      setTimeout(() => {
        webSocketMiddleware.cleanupInactiveConnections(1); // 1ms max age
        expect(webSocketMiddleware.getActiveConnections()).toBe(0);
        done();
      }, 10);
    });

    test('should validate message structure', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      // Test valid message
      const validContext = {
        ws: mockWs,
        message: {
          type: 'message:create',
          payload: {
            conversationId: 'conv_1234567890_abc123',
            content: 'Test message'
          }
        },
        userEmail: 'test@example.com',
        clientIP: '127.0.0.1'
      };

      const result = webSocketMiddleware.validateMessage(validContext);
      expect(result).toBe(true);
    });

    test('should reject invalid message structure', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      // Test invalid message (missing required fields)
      const invalidContext = {
        ws: mockWs,
        message: {
          type: 'message:create',
          payload: {
            conversationId: 'conv_1234567890_abc123'
            // Missing content
          }
        },
        userEmail: 'test@example.com',
        clientIP: '127.0.0.1'
      };

      const result = webSocketMiddleware.validateMessage(invalidContext);
      expect(result).toBe(false);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Missing required fields')
      );
    });

    test('should reject invalid conversation ID format', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      const invalidContext = {
        ws: mockWs,
        message: {
          type: 'message:create',
          payload: {
            conversationId: 'invalid-format',
            content: 'Test message'
          }
        },
        userEmail: 'test@example.com',
        clientIP: '127.0.0.1'
      };

      const result = webSocketMiddleware.validateMessage(invalidContext);
      expect(result).toBe(false);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid conversationId format')
      );
    });

    test('should reject message with content too long', async () => {
      const longContent = 'a'.repeat(MESSAGE_LIMITS.MAX_CONTENT_LENGTH + 1); // Exceeds 2M character limit
      
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      const invalidContext = {
        ws: mockWs,
        message: {
          type: 'message:create',
          payload: {
            conversationId: 'conv_1234567890_abc123',
            content: longContent
          }
        },
        userEmail: 'test@example.com',
        clientIP: '127.0.0.1'
      };

      const result = webSocketMiddleware.validateMessage(invalidContext);
      expect(result).toBe(false);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Content too long')
      );
    });

    test('should allow valid message types', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      const validTypes = ['TEXT', 'IMAGE', 'FILE'];

      for (const messageType of validTypes) {
        const context = {
          ws: mockWs,
          message: {
            type: 'message:create',
            payload: {
              conversationId: 'conv_1234567890_abc123',
              content: 'Test message',
              messageType
            }
          },
          userEmail: 'test@example.com',
          clientIP: '127.0.0.1'
        };

        const result = webSocketMiddleware.validateMessage(context);
        expect(result).toBe(true);
      }
    });

    test('should reject invalid message types', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      const invalidContext = {
        ws: mockWs,
        message: {
          type: 'message:create',
          payload: {
            conversationId: 'conv_1234567890_abc123',
            content: 'Test message',
            messageType: 'INVALID_TYPE'
          }
        },
        userEmail: 'test@example.com',
        clientIP: '127.0.0.1'
      };

      const result = webSocketMiddleware.validateMessage(invalidContext);
      expect(result).toBe(false);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('Invalid messageType')
      );
    });

    test('should allow non-message:create types to pass through', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      const otherTypes = ['ping', 'typing:start', 'typing:stop'];

      for (const type of otherTypes) {
        const context = {
          ws: mockWs,
          message: {
            type,
            payload: {}
          },
          userEmail: 'test@example.com',
          clientIP: '127.0.0.1'
        };

        const result = webSocketMiddleware.validateMessage(context);
        expect(result).toBe(true);
      }
    });
  });

  describe('WebSocket Integration', () => {
    test('should have initializeWebSocket function', () => {
      expect(websocketRefactored.initializeWebSocket).toBeInstanceOf(Function);
    });

    test('should export administrative functions', () => {
      expect(websocketRefactored.getActiveUserConnections).toBeInstanceOf(Function);
      expect(websocketRefactored.forceDisconnectUser).toBeInstanceOf(Function);
      expect(websocketRefactored.forceDisconnectAllUsers).toBeInstanceOf(Function);
    });

    test('should export middleware runner', () => {
      expect(webSocketMiddleware).toBeDefined();
      expect(typeof webSocketMiddleware.runMiddlewarePipeline).toBe('function');
    });

    test('should export validation functions', () => {
      expect(webSocketMiddleware.validateMessage).toBeInstanceOf(Function);
      expect(webSocketMiddleware.clearCaches).toBeInstanceOf(Function);
    });

    test('should maintain backward compatibility', () => {
      // Verify that enhanced WebSocket maintains original interface
      expect(websocketRefactored.initializeWebSocket).toBeInstanceOf(Function);
      
      // Verify that middleware still supports all original functions
      expect(webSocketMiddleware.registerConnection).toBeInstanceOf(Function);
      expect(webSocketMiddleware.unregisterConnection).toBeInstanceOf(Function);
      expect(webSocketMiddleware.getActiveConnections).toBeInstanceOf(Function);
      expect(webSocketMiddleware.runMiddlewarePipeline).toBeInstanceOf(Function);
      
      // Verify new security features are available
      expect(websocketRefactored.getActiveUserConnections).toBeInstanceOf(Function);
      expect(websocketRefactored.forceDisconnectUser).toBeInstanceOf(Function);
      expect(websocketRefactored.forceDisconnectAllUsers).toBeInstanceOf(Function);
    });
  });

  describe('Error Handling', () => {
    test('should handle undefined websocket gracefully', () => {
      expect(() => {
        webSocketMiddleware.registerConnection('test@example.com', undefined as any);
      }).not.toThrow();

      expect(() => {
        webSocketMiddleware.unregisterConnection('test@example.com');
      }).not.toThrow();
    });

    test('should handle invalid input gracefully', () => {
      const mockWs = {
        userEmail: 'test@example.com',
        send: jest.fn(),
        _socket: { remoteAddress: '127.0.0.1' }
      } as any;

      // Test with null/undefined message
      const invalidContext = {
        ws: mockWs,
        message: null as any,
        userEmail: 'test@example.com',
        clientIP: '127.0.0.1'
      };

      expect(() => {
        webSocketMiddleware.validateMessage(invalidContext);
      }).not.toThrow();
    });
  });
}); 