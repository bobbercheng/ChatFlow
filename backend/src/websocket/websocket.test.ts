import { Server } from 'http';
import { createServer } from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { initializeWebSocket } from './websocket';
import { authService } from '../services/auth.service';
import '../test-setup';

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
    
    // Close the server and wait for all connections to be closed
    server.close(() => {
      // Small delay to ensure all async operations complete
      setTimeout(() => {
        done();
      }, 50);
    });
  });

  afterAll(() => {
    delete process.env['JWT_SECRET'];
  });

  describe('Authentication', () => {
    test('should accept connection with valid token in query params', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('open', () => {
        expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith('test@example.com', true);
        ws.close();
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('connection');
        expect(message.payload.message).toBe('Connected successfully');
        done();
      });

      ws.on('error', done);
    });

    test('should accept connection with valid token in Authorization header', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      ws.on('open', () => {
        expect(mockAuthService.updateOnlineStatus).toHaveBeenCalledWith('test@example.com', true);
        ws.close();
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('connection');
        done();
      });

      ws.on('error', done);
    });

    test('should reject connection without token', (done) => {
      const callsBefore = mockAuthService.updateOnlineStatus.mock.calls.length;
      const ws = new WebSocket(`${serverUrl}/ws`);

      ws.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Authentication required');
        
        // Check that no new calls were made since the start of this test
        const callsAfter = mockAuthService.updateOnlineStatus.mock.calls.length;
        expect(callsAfter).toBe(callsBefore);
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
      });
    });

    test('should reject connection with invalid token', (done) => {
      const ws = new WebSocket(`${serverUrl}/ws?token=invalid-token`);

      ws.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Invalid token');
        expect(mockAuthService.updateOnlineStatus).not.toHaveBeenCalled();
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
      });
    });

    test('should reject connection with expired token', (done) => {
      const token = jwt.sign(
        { email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 60 }, // Expired 1 minute ago
        JWT_SECRET
      );
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toBe('Invalid token');
        expect(mockAuthService.updateOnlineStatus).not.toHaveBeenCalled();
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
      });
    });
  });

  describe('Online Status Management', () => {
    test('should set user online on connection and offline on disconnect', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      
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
          done();
        }, 50);
      });

      ws.on('error', done);
    });

    test('should handle errors when updating online status', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      
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
          done();
        }, 50);
      });

      ws.on('error', done);
    });
  });

  describe('Message Handling', () => {
    test('should echo back valid JSON messages', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      const testMessage = { type: 'test', content: 'Hello World' };
      let messageCount = 0;

      ws.on('message', (data) => {
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
          ws.close();
          done();
        }
      });

      ws.on('open', () => {
        ws.send(JSON.stringify(testMessage));
      });

      ws.on('error', done);
    });

    test('should handle invalid JSON messages', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);
      let messageCount = 0;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (messageCount === 1) {
          // First message is the connection confirmation
          expect(message.type).toBe('connection');
        } else if (messageCount === 2) {
          // Second message is the error response
          expect(message.type).toBe('error');
          expect(message.payload.message).toBe('Invalid message format');
          ws.close();
          done();
        }
      });

      ws.on('open', () => {
        ws.send('invalid-json');
      });

      ws.on('error', done);
    });
  });

  describe('Connection Management', () => {
    test('should handle WebSocket errors gracefully', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
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
          done();
        }, 50);
      });

      ws.on('error', () => {
        // Expected error, continue
      });
    });

    test('should log connection and disconnection events', (done) => {
      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
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
          done();
        }, 50);
      });

      ws.on('error', done);
    });
  });

  describe('Server Configuration Errors', () => {
    test('should handle missing JWT_SECRET', (done) => {
      const originalSecret = process.env['JWT_SECRET'];
      delete process.env['JWT_SECRET'];

      const token = jwt.sign({ email: 'test@example.com' }, JWT_SECRET);
      const ws = new WebSocket(`${serverUrl}/ws?token=${token}`);

      ws.on('close', (code, reason) => {
        expect(code).toBe(1011);
        expect(reason.toString()).toBe('Server configuration error');
        
        // Restore the secret
        process.env['JWT_SECRET'] = originalSecret;
        done();
      });

      ws.on('error', () => {
        // Expected to error due to immediate close
      });
    });
  });
}); 