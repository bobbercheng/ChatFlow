import '../test-setup';
import { Server } from 'http';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { initializeWebSocket } from './websocket';
import { authService } from '../services/auth.service';

// Clear the WebSocket mock from test-setup and use real WebSocket
jest.clearAllMocks();
jest.unmock('ws');
const { WebSocket } = require('ws');

// Override the JWT mock to handle our test tokens properly
jest.mock('jsonwebtoken', () => {
  const actualJWT = jest.requireActual('jsonwebtoken');
  return {
    ...actualJWT,
    sign: actualJWT.sign,
    verify: actualJWT.verify,
  };
});

// Mock the auth service
jest.mock('../services/auth.service', () => ({
  authService: {
    updateOnlineStatus: jest.fn(),
  },
}));

const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('WebSocket Server', () => {
  let server: Server;
  const PORT = 0; // Use random available port
  let serverUrl: string;
  const JWT_SECRET = 'test-secret';

  beforeAll(() => {
    process.env['JWT_SECRET'] = JWT_SECRET;
  });

  beforeEach((done) => {
    // Reset mocks before each test
    mockAuthService.updateOnlineStatus.mockReset();
    mockAuthService.updateOnlineStatus.mockResolvedValue({
      email: 'test@example.com',
      displayName: 'Test User',
      isOnline: true,
      lastSeen: new Date(),
      createdAt: new Date(),
    });
    
    server = createServer();
    initializeWebSocket(server);
    
    server.listen(PORT, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : PORT;
      serverUrl = `ws://localhost:${port}`;
      done();
    });
  });

  afterEach((done) => {
    // Clear any pending timers
    jest.clearAllTimers();
    
    // Force close any remaining connections
    if (server) {
      server.closeAllConnections?.();
      
      // Close the server with a timeout
      const closeTimeout = setTimeout(() => {
        done();
      }, 1000);
      
      server.close(() => {
        clearTimeout(closeTimeout);
        setTimeout(() => {
          done();
        }, 50);
      });
    } else {
      done();
    }
  });

  afterAll(() => {
    delete process.env['JWT_SECRET'];
  });

  describe('Authentication', () => {
    test('should accept connection with valid token in query params', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 2000);

      ws.on('open', () => {
        expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith('test@example.com', true);
      });

      ws.on('message', (data: any) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('connection');
        expect(message.payload.message).toBe('Connected successfully');
        clearTimeout(timeout);
        ws.terminate();
        done();
      });

      ws.on('error', (error: any) => {
        clearTimeout(timeout);
        ws.terminate();
        done(error);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
      });
    }, 4000);

    test('should accept connection with valid token in Authorization header', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 2000);

      ws.on('open', () => {
        expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith('test@example.com', true);
      });

      ws.on('message', (data: any) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('connection');
        clearTimeout(timeout);
        ws.terminate();
        done();
      });

      ws.on('error', (error: any) => {
        clearTimeout(timeout);
        ws.terminate();
        done(error);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
      });
    }, 4000);

    test('should reject connection without token', (done) => {
      const callsBefore = mockAuthService.updateOnlineStatus.mock.calls.length;
      const ws = new WebSocket(`${serverUrl}/ws`);

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 2000);

      ws.on('close', (code: any, reason: any) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Authentication required');
        
        // Check that no new calls were made since the start of this test
        const callsAfter = mockAuthService.updateOnlineStatus.mock.calls.length;
        expect(callsAfter).toBe(callsBefore);
        clearTimeout(timeout);
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
        clearTimeout(timeout);
      });
    }, 4000);

    test('should reject connection with invalid token', (done) => {
      const ws = new WebSocket(`${serverUrl}/ws?token=invalid-token`);

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 2000);

      ws.on('close', (code: any, reason: any) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Invalid token');
        expect(mockAuthService.updateOnlineStatus).not.toHaveBeenCalled();
        clearTimeout(timeout);
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
        clearTimeout(timeout);
      });
    }, 4000);

    test('should reject connection with expired token', (done) => {
      const token = jwt.sign(
        { email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 60 }, // Expired 1 minute ago
        JWT_SECRET
      );
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 2000);

      ws.on('close', (code: any, reason: any) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Invalid token');
        expect(mockAuthService.updateOnlineStatus).not.toHaveBeenCalled();
        clearTimeout(timeout);
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
        clearTimeout(timeout);
      });
    }, 4000);
  });

  describe('Online Status Management', () => {
    test('should set user online on connection and offline on disconnect', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 3000);
      
      mockAuthService.updateOnlineStatus.mockResolvedValue({
        email: 'test@example.com',
        displayName: 'Test User',
        isOnline: true,
        lastSeen: new Date(),
        createdAt: new Date(),
      });

      ws.on('open', () => {
        expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith('test@example.com', true);
        
        // Close the connection after a short delay
        setTimeout(() => {
          ws.close();
        }, 100);
      });

      ws.on('close', () => {
        // Give a small delay for the async close handler to execute
        setTimeout(() => {
          expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith('test@example.com', false);
          clearTimeout(timeout);
          done();
        }, 50);
      });

      ws.on('error', (error: any) => {
        clearTimeout(timeout);
        ws.terminate();
        done(error);
      });
    }, 5000);

    test('should handle errors when updating online status', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 3000);
      
      // Mock the service to throw an error on offline status update
      mockAuthService.updateOnlineStatus
        .mockResolvedValueOnce({
          email: 'test@example.com',
          displayName: 'Test User',
          isOnline: true,
          lastSeen: new Date(),
          createdAt: new Date(),
        })
        .mockRejectedValueOnce(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('open', () => {
        setTimeout(() => {
          ws.close();
        }, 100);
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Error updating offline status for test@example.com:'),
            expect.any(Error)
          );
          consoleSpy.mockRestore();
          clearTimeout(timeout);
          done();
        }, 50);
      });

      ws.on('error', (error: any) => {
        consoleSpy.mockRestore();
        clearTimeout(timeout);
        ws.terminate();
        done(error);
      });
    }, 5000);
  });

  describe('Message Handling', () => {
    test('should echo back valid JSON messages', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      const testMessage = { type: 'test', content: 'Hello World' };
      let messageCount = 0;

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 3000);

      ws.on('message', (data: any) => {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          // First message is the connection confirmation
          expect(message.type).toBe('connection');
        } else if (messageCount === 2) {
          // Second message is the echo
          expect(message.type).toBe('echo');
          expect(message.payload).toEqual(testMessage);
          expect(message.timestamp).toBeDefined();
          clearTimeout(timeout);
          ws.terminate();
          done();
        }
      });

      ws.on('open', () => {
        ws.send(JSON.stringify(testMessage));
      });

      ws.on('error', (error: any) => {
        clearTimeout(timeout);
        ws.terminate();
        done(error);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
      });
    }, 5000);

    test('should handle invalid JSON messages', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      let messageCount = 0;

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        ws.terminate();
        done(new Error('Test timed out'));
      }, 3000);

      ws.on('message', (data: any) => {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          // First message is the connection confirmation
          expect(message.type).toBe('connection');
        } else if (messageCount === 2) {
          // Second message is the error response
          expect(message.type).toBe('error');
          expect(message.payload.message).toBe('Invalid message format');
          clearTimeout(timeout);
          ws.terminate();
          done();
        }
      });

      ws.on('open', () => {
        ws.send('invalid-json');
      });

      ws.on('error', (error: any) => {
        clearTimeout(timeout);
        ws.terminate();
        done(error);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
      });
    }, 5000);
  });

  describe('Connection Management', () => {
    test('should handle WebSocket errors gracefully', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        consoleSpy.mockRestore();
        done(new Error('Test timed out'));
      }, 3000);
      
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('open', () => {
        // Simulate an error by trying to send after closing
        ws.close();
        setTimeout(() => {
          try {
            ws.send('test message');
          } catch (error) {
            // This should trigger the error handler
          }
        }, 10);
      });

      ws.on('close', () => {
        setTimeout(() => {
          consoleSpy.mockRestore();
          clearTimeout(timeout);
          done();
        }, 50);
      });

      ws.on('error', () => {
        // Expected error, continue
      });
    }, 5000);

    test('should log connection and disconnection events', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        consoleSpy.mockRestore();
        done(new Error('Test timed out'));
      }, 3000);
      
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('open', () => {
        expect(consoleSpy).toHaveBeenCalledWith('New WebSocket connection attempt');
        expect(consoleSpy).toHaveBeenCalledWith('WebSocket authenticated for user: test@example.com');
        
        setTimeout(() => {
          ws.close(1000, 'Normal closure');
        }, 100);
      });

      ws.on('close', () => {
        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('WebSocket connection closed for test@example.com: 1000 Normal closure')
          );
          consoleSpy.mockRestore();
          clearTimeout(timeout);
          done();
        }, 50);
      });

      ws.on('error', (error: any) => {
        consoleSpy.mockRestore();
        clearTimeout(timeout);
        done(error);
      });
    }, 4000);
  });

  describe('Server Configuration Errors', () => {
    test('should handle missing JWT_SECRET', (done) => {
      const originalSecret = process.env['JWT_SECRET'];
      delete process.env['JWT_SECRET'];

      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        process.env['JWT_SECRET'] = originalSecret;
        done(new Error('Test timed out'));
      }, 3000);

      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('close', (code: any, reason: any) => {
        expect(code).toBe(1011);
        expect(reason.toString()).toBe('Server configuration error');
        
        // Restore the secret
        process.env['JWT_SECRET'] = originalSecret;
        clearTimeout(timeout);
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
        clearTimeout(timeout);
      });
    }, 5000);
  });
}); 