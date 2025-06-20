import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { notificationService } from '../services/notification.service';
import { messageService } from '../services/message.service';

interface AuthenticatedWebSocket extends WebSocket {
  userEmail?: string;
}

export function initializeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
    console.log('New WebSocket connection attempt');

    // Extract token from query parameters or headers
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token') || req.headers.authorization?.split(' ')[1];

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
      ws.userEmail = decoded.email;
      console.log(`WebSocket authenticated for user: ${decoded.email}`);

      // Set user status to online
      await authService.updateOnlineStatus(decoded.email, true);

      // Register this socket for notifications
      notificationService.registerConnection(decoded.email, ws);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        payload: { message: 'Connected successfully' },
        timestamp: new Date().toISOString(),
      }));

    } catch (error) {
      console.error('WebSocket authentication failed:', error);
      ws.close(1008, 'Invalid token');
      return;
    }

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`Received message from ${ws.userEmail}:`, message);

        // Handle client-initiated events
        if (message.type === 'message:read' && message.payload?.messageId) {
          // Note: In Firestore implementation, we'd need conversationId for markAsRead
          // For now, we'll skip this functionality until we have conversation context
          console.log('Mark as read requested for message:', message.payload.messageId, 'by user:', ws.userEmail!);
        } else if (message.type === 'message:create') {
          // Validate message creation payload
          const { conversationId, content, messageType } = message.payload || {};
          
          if (!conversationId || !content) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { 
                message: 'Invalid message creation payload. Required: conversationId, content',
                code: 'INVALID_PAYLOAD'
              },
              timestamp: new Date().toISOString(),
            }));
            return;
          }

          try {
            // Create message using message service
            const createdMessage = await messageService.createMessage({
              conversationId,
              senderId: ws.userEmail!,
              content,
              messageType: messageType || 'TEXT'
            });

            // Send success response back to sender
            ws.send(JSON.stringify({
              type: 'message:created',
              payload: createdMessage,
              timestamp: new Date().toISOString(),
            }));

          } catch (serviceError: any) {
            // Send error response for message creation failure
            ws.send(JSON.stringify({
              type: 'error',
              payload: { 
                message: serviceError.message || 'Failed to create message',
                code: serviceError.code || 'MESSAGE_CREATION_FAILED'
              },
              timestamp: new Date().toISOString(),
            }));
          }
        } else {
          // Echo back for unknown types (debug)
          ws.send(JSON.stringify({
            type: 'echo',
            payload: message,
            timestamp: new Date().toISOString(),
          }));
        }

      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: new Date().toISOString(),
        }));
      }
    });

    // Handle connection close
    ws.on('close', async (code, reason) => {
      console.log(`WebSocket connection closed for ${ws.userEmail}: ${code} ${reason}`);
      
      // Set user status to offline when connection closes
      if (ws.userEmail) {
        try {
          await authService.updateOnlineStatus(ws.userEmail, false);
          notificationService.unregisterConnection(ws.userEmail, ws);
        } catch (error) {
          console.error(`Error updating offline status for ${ws.userEmail}:`, error);
        }
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for ${ws.userEmail}:`, error);
    });
  });

  console.log('WebSocket server initialized on /ws');
} 