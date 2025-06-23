import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { notificationService } from '../services/notification.service';
import { messageService } from '../services/message.service';
import { webSocketMiddleware } from './websocket-middleware';
import { responseEncryptionService } from '../middleware/encryption';

interface AuthenticatedWebSocket extends WebSocket {
  userEmail?: string;
  tokenExpiry?: number; // Store token expiry timestamp
  lastTokenCheck?: number; // Last time we validated the token
  originalToken?: string; // Store original token for re-validation
  _socket?: any;
}

// Track active connections for administrative control
const activeConnections = new Map<string, Set<AuthenticatedWebSocket>>();

// Helper function to send encrypted WebSocket messages
async function sendEncryptedMessage(ws: AuthenticatedWebSocket, type: string, payload: any): Promise<void> {
  try {
    if (ws.userEmail) {
      const encryptedResponse = await responseEncryptionService.createEncryptedWebSocketResponse(
        type, 
        payload, 
        ws.userEmail
      );
      ws.send(encryptedResponse);
    } else {
      // Fallback to plain message if no user email
      ws.send(JSON.stringify({
        type,
        payload,
        timestamp: new Date().toISOString(),
      }));
    }
  } catch (error) {
    console.error('Failed to send encrypted WebSocket message:', error);
    // Send error message in plain text as fallback
    ws.send(JSON.stringify({
      type: 'error',
      payload: { 
        message: 'Message encryption failed',
        code: 'ENCRYPTION_ERROR'
      },
      timestamp: new Date().toISOString(),
    }));
  }
}

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  // Enhanced cleanup: check token expiry and cleanup inactive connections
  const cleanupInterval = setInterval(() => {
    performSecurityCleanup();
    webSocketMiddleware.cleanupInactiveConnections();
  }, 5 * 60 * 1000); // Every 5 minutes

  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    console.log('New WebSocket connection attempt');

    // Extract token from query parameters or Authorization header (consistent with REST)
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const tokenFromQuery = url.searchParams.get('token');
    const authHeader = req.headers.authorization;
    
    let token: string | null = null;
    
    // Prefer Authorization header (consistent with REST API)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (tokenFromQuery) {
      token = tokenFromQuery;
    }

    if (!token) {
      ws.close(1008, 'Authentication required');
      return;
    }

    const jwtSecret = process.env['JWT_SECRET'];
    if (!jwtSecret) {
      ws.close(1011, 'Server configuration error');
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      
      // Enhanced authentication setup
      ws.userEmail = decoded.email;
      ws.tokenExpiry = decoded.exp ? decoded.exp * 1000 : Date.now() + (7 * 24 * 60 * 60 * 1000); // Default 7 days
      ws.lastTokenCheck = Date.now();
      ws.originalToken = token;
      
      console.log(`WebSocket authenticated for user: ${decoded.email}, token expires: ${new Date(ws.tokenExpiry)}`);

      // Track active connection for session management
      if (!activeConnections.has(decoded.email)) {
        activeConnections.set(decoded.email, new Set());
      }
      activeConnections.get(decoded.email)!.add(ws);

      // Register connection with middleware
      webSocketMiddleware.registerConnection(decoded.email, ws);

      // Set user status to online
      await authService.updateOnlineStatus(decoded.email, true);

      // Register this socket for notifications
      notificationService.registerConnection(decoded.email, ws);

      // Send welcome message with security info (encrypted)
      await sendEncryptedMessage(ws, 'connection', { 
        message: 'Connected successfully',
        activeConnections: webSocketMiddleware.getActiveConnections(),
        tokenExpiry: ws.tokenExpiry,
        securityNotice: 'Token will be validated periodically'
      });

    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      if (error instanceof jwt.TokenExpiredError) {
        ws.close(1008, 'Token expired');
      } else {
        ws.close(1008, 'Invalid token');
      }
      return;
    }

    // Handle incoming messages with enhanced authentication
    ws.on('message', async (data) => {
      try {
        // Validate token expiry on each message (security enhancement)
        const tokenValidation = await validateWebSocketToken(ws);
        if (!tokenValidation.valid) {
          ws.close(1008, tokenValidation.reason);
          return;
        }

        const message = JSON.parse(data.toString());
        console.log(`Received message from ${ws.userEmail}:`, message.type);

        // Apply middleware pipeline (rate limiting, encryption, validation)
        const middlewareResult = await webSocketMiddleware.runMiddlewarePipeline(ws, message);
        
        if (!middlewareResult) {
          // Middleware rejected the message (already sent error response)
          return;
        }

        // Handle specific message types after middleware approval
        await handleWebSocketMessage(ws, message);

      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        await sendEncryptedMessage(ws, 'error', { 
          message: 'Invalid message format',
          code: 'INVALID_FORMAT'
        });
      }
    });

    // Handle connection close with enhanced cleanup
    ws.on('close', async (code, reason) => {
      console.log(`WebSocket connection closed for ${ws.userEmail}: ${code} ${reason}`);
      
      await cleanupWebSocketConnection(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${ws.userEmail}:`, error);
    });
  });

  // Cleanup on server shutdown
  process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
    webSocketMiddleware.clearCaches();
    activeConnections.clear();
  });

  console.log('WebSocket server initialized on /ws with unified middleware pipeline');
}

// Enhanced token validation for active connections
async function validateWebSocketToken(ws: AuthenticatedWebSocket): Promise<{valid: boolean, reason?: string}> {
  if (!ws.userEmail || !ws.originalToken || !ws.tokenExpiry) {
    return { valid: false, reason: 'Missing authentication data' };
  }

  // Check token expiry
  if (Date.now() > ws.tokenExpiry) {
    console.log(`Token expired for user: ${ws.userEmail}`);
    return { valid: false, reason: 'Token expired' };
  }

  // Periodic token re-validation (every 10 minutes)
  const timeSinceLastCheck = Date.now() - (ws.lastTokenCheck || 0);
  if (timeSinceLastCheck > 10 * 60 * 1000) {
    try {
      const jwtSecret = process.env['JWT_SECRET'];
      if (!jwtSecret) {
        return { valid: false, reason: 'Server configuration error' };
      }

      // Re-verify the token
      jwt.verify(ws.originalToken, jwtSecret);
      ws.lastTokenCheck = Date.now();
      console.log(`Token re-validated for user: ${ws.userEmail}`);
    } catch (error) {
      console.log(`Token re-validation failed for user: ${ws.userEmail}`, error);
      return { valid: false, reason: 'Token validation failed' };
    }
  }

  return { valid: true };
}

// Security cleanup function
function performSecurityCleanup(): void {
  console.log('Performing security cleanup of WebSocket connections...');
  
  for (const [userEmail, connections] of activeConnections.entries()) {
    for (const ws of connections) {
      // Check if token is expired
      if (ws.tokenExpiry && Date.now() > ws.tokenExpiry) {
        console.log(`Closing expired connection for user: ${userEmail}`);
        ws.close(1008, 'Token expired');
        connections.delete(ws);
      }
    }
    
    // Remove empty connection sets
    if (connections.size === 0) {
      activeConnections.delete(userEmail);
    }
  }
}

// Enhanced connection cleanup
async function cleanupWebSocketConnection(ws: AuthenticatedWebSocket): Promise<void> {
  if (ws.userEmail) {
    // Remove from active connections tracking
    const userConnections = activeConnections.get(ws.userEmail);
    if (userConnections) {
      userConnections.delete(ws);
      if (userConnections.size === 0) {
        activeConnections.delete(ws.userEmail);
      }
    }

    // Unregister from middleware
    webSocketMiddleware.unregisterConnection(ws.userEmail);
    
    try {
      // Only set offline if no other connections exist for this user
      const hasOtherConnections = activeConnections.has(ws.userEmail) && 
                                 activeConnections.get(ws.userEmail)!.size > 0;
      
      if (!hasOtherConnections) {
        await authService.updateOnlineStatus(ws.userEmail, false);
      }
      
      notificationService.unregisterConnection(ws.userEmail, ws);
    } catch (error) {
      console.error(`Error updating offline status for ${ws.userEmail}:`, error);
    }
  }
}

// Administrative functions for session management
export function getActiveUserConnections(): Map<string, number> {
  const result = new Map<string, number>();
  for (const [userEmail, connections] of activeConnections.entries()) {
    result.set(userEmail, connections.size);
  }
  return result;
}

export function forceDisconnectUser(userEmail: string, reason: string = 'Administrative disconnect'): number {
  const connections = activeConnections.get(userEmail);
  if (!connections) return 0;
  
  let disconnectedCount = 0;
  for (const ws of connections) {
    ws.close(1008, reason);
    disconnectedCount++;
  }
  
  activeConnections.delete(userEmail);
  console.log(`Force disconnected ${disconnectedCount} connections for user: ${userEmail}`);
  return disconnectedCount;
}

export function forceDisconnectAllUsers(reason: string = 'Server maintenance'): number {
  let totalDisconnected = 0;
  
  for (const [_userEmail, connections] of activeConnections.entries()) {
    for (const ws of connections) {
      ws.close(1008, reason);
      totalDisconnected++;
    }
  }
  
  activeConnections.clear();
  console.log(`Force disconnected ${totalDisconnected} total connections`);
  return totalDisconnected;
}

// Handle WebSocket messages after middleware approval
async function handleWebSocketMessage(ws: AuthenticatedWebSocket, message: any): Promise<void> {
  const { type, payload } = message;

  switch (type) {
    case 'message:read':
      await handleMessageRead(ws, payload);
      break;
      
    case 'message:create':
      await handleMessageCreate(ws, payload);
      break;
      
    case 'typing:start':
      await handleTypingStart(ws, payload);
      break;
      
    case 'typing:stop':
      await handleTypingStop(ws, payload);
      break;
      
    case 'ping':
      // Respond to ping with pong (including token status) - encrypted
      await sendEncryptedMessage(ws, 'pong', { 
        timestamp: Date.now(),
        tokenExpiry: ws.tokenExpiry,
        timeUntilExpiry: ws.tokenExpiry ? ws.tokenExpiry - Date.now() : null
      });
      break;
      
    case 'auth:refresh':
      // Handle token refresh requests
      await handleTokenRefresh(ws, payload);
      break;
      
    default:
      // Echo back unknown message types for debugging (encrypted)
      await sendEncryptedMessage(ws, 'echo', { originalType: type, originalPayload: payload });
  }
}

// Message handlers
async function handleMessageRead(ws: AuthenticatedWebSocket, payload: any): Promise<void> {
  const { messageId, conversationId } = payload || {};
  
  if (!messageId) {
    await sendEncryptedMessage(ws, 'error', { 
      message: 'messageId is required for message:read',
      code: 'MISSING_MESSAGE_ID'
    });
    return;
  }

  // Note: In a full implementation, you'd mark the message as read in the database
  console.log(`Mark as read requested for message: ${messageId} by user: ${ws.userEmail}`);
  
  await sendEncryptedMessage(ws, 'message:read:success', { messageId, conversationId });
}

async function handleMessageCreate(ws: AuthenticatedWebSocket, payload: any): Promise<void> {
  // Note: Middleware has already validated the payload structure and decrypted content
  const { conversationId, content, messageType } = payload;

  try {
    // Create message using message service
    const createdMessage = await messageService.createMessage({
      conversationId,
      senderId: ws.userEmail!,
      content,
      messageType: messageType || 'TEXT'
    });

    // Send success response back to sender (encrypted)
    await sendEncryptedMessage(ws, 'message:created', createdMessage);

    // Broadcast to other participants via notification service
    // (notification service will handle the distribution)

  } catch (serviceError: any) {
    console.error('Message creation error:', serviceError);
    await sendEncryptedMessage(ws, 'error', { 
      message: serviceError.message || 'Failed to create message',
      code: serviceError.code || 'MESSAGE_CREATION_FAILED'
    });
  }
}

async function handleTypingStart(ws: AuthenticatedWebSocket, payload: any): Promise<void> {
  const { conversationId } = payload || {};
  
  if (!conversationId) {
    await sendEncryptedMessage(ws, 'error', { 
      message: 'conversationId is required for typing events',
      code: 'MISSING_CONVERSATION_ID'
    });
    return;
  }

  // Broadcast typing indicator to conversation participants
  // (This would typically go through the notification service)
  console.log(`User ${ws.userEmail} started typing in ${conversationId}`);
}

async function handleTypingStop(ws: AuthenticatedWebSocket, payload: any): Promise<void> {
  const { conversationId } = payload || {};
  
  if (!conversationId) {
    return; // Silently ignore missing conversationId for stop events
  }

  // Broadcast typing stop to conversation participants
  console.log(`User ${ws.userEmail} stopped typing in ${conversationId}`);
}

// New: Handle token refresh requests
async function handleTokenRefresh(ws: AuthenticatedWebSocket, payload: any): Promise<void> {
  const { newToken } = payload || {};
  
  if (!newToken) {
    await sendEncryptedMessage(ws, 'error', { 
      message: 'newToken is required for auth:refresh',
      code: 'MISSING_TOKEN'
    });
    return;
  }

  try {
    const jwtSecret = process.env['JWT_SECRET'];
    if (!jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    const decoded = jwt.verify(newToken, jwtSecret) as JwtPayload;
    
    // Verify the new token is for the same user
    if (decoded.email !== ws.userEmail) {
      throw new Error('Token user mismatch');
    }

    // Update token information
    ws.originalToken = newToken;
    ws.tokenExpiry = decoded.exp ? decoded.exp * 1000 : Date.now() + (7 * 24 * 60 * 60 * 1000);
    ws.lastTokenCheck = Date.now();

    await sendEncryptedMessage(ws, 'auth:refresh:success', { 
      message: 'Token refreshed successfully',
      tokenExpiry: ws.tokenExpiry
    });

    console.log(`Token refreshed for user: ${ws.userEmail}, new expiry: ${new Date(ws.tokenExpiry)}`);

  } catch (error: any) {
    console.error('Token refresh failed:', error);
    await sendEncryptedMessage(ws, 'error', { 
      message: 'Token refresh failed',
      code: 'TOKEN_REFRESH_FAILED'
    });
  }
} 