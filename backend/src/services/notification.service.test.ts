import { WebSocket } from 'ws';
import '../test-setup';
import { NotificationServicePubSub } from './notification.service';
import { databaseAdapter } from '../adapters';
import { messagingAdapter } from '../adapters';
import { MessageType } from '../types/firestore';

// Mock the adapters
jest.mock('../database/adapters/firestore.adapter');
jest.mock('../messaging/adapters/pubsub.adapter');

const mockFirestoreAdapter = databaseAdapter as jest.Mocked<typeof databaseAdapter>;
const mockPubSubAdapter = messagingAdapter as jest.Mocked<typeof messagingAdapter>;

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  userEmail: '',
} as unknown as WebSocket & { userEmail: string };

describe('NotificationServicePubSub', () => {
  let notificationService: NotificationServicePubSub;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks
    mockFirestoreAdapter.findInSubcollection.mockResolvedValue([]);
    mockFirestoreAdapter.batchWrite.mockResolvedValue();
    mockFirestoreAdapter.update.mockResolvedValue({} as any);
    mockFirestoreAdapter.create.mockResolvedValue({} as any);
    mockFirestoreAdapter.findById.mockResolvedValue(null);

    mockPubSubAdapter.publishJson.mockResolvedValue('msg-123');
    mockPubSubAdapter.checkHealth.mockResolvedValue({ status: 'healthy' });
    mockPubSubAdapter.createTopic.mockResolvedValue();
    mockPubSubAdapter.createSubscription.mockResolvedValue();
    mockPubSubAdapter.subscribe.mockResolvedValue();

    // Create service instance
    notificationService = new NotificationServicePubSub();
  });

  describe('Connection Management', () => {
    test('should register and unregister WebSocket connections', () => {
      const ws1 = { ...mockWebSocket, userEmail: 'user1@test.com' };
      const ws2 = { ...mockWebSocket, userEmail: 'user1@test.com' };
      const ws3 = { ...mockWebSocket, userEmail: 'user2@test.com' };

      // Register connections
      notificationService.registerConnection('user1@test.com', ws1 as any);
      notificationService.registerConnection('user1@test.com', ws2 as any);
      notificationService.registerConnection('user2@test.com', ws3 as any);

      // Check connection stats
      const stats = notificationService.getConnectionStats();
      expect(stats.totalConnections).toBe(3);
      expect(stats.connectedUsers).toContain('user1@test.com');
      expect(stats.connectedUsers).toContain('user2@test.com');

      // Unregister one connection for user1
      notificationService.unregisterConnection('user1@test.com', ws1 as any);
      const updatedStats = notificationService.getConnectionStats();
      expect(updatedStats.totalConnections).toBe(2);

      // Unregister last connection for user2
      notificationService.unregisterConnection('user2@test.com', ws3 as any);
      const finalStats = notificationService.getConnectionStats();
      expect(finalStats.totalConnections).toBe(1);
      expect(finalStats.connectedUsers).not.toContain('user2@test.com');
    });
  });

  describe('handleNewMessage', () => {
          const mockMessage = {
        id: 'msg-123',
        senderId: 'sender@test.com',
        content: 'Hello world',
        messageType: MessageType.TEXT,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

    const conversationId = 'conv-456';

    beforeEach(() => {
      mockFirestoreAdapter.findInSubcollection.mockResolvedValue([
        { userId: 'sender@test.com' },
        { userId: 'recipient1@test.com' },
        { userId: 'recipient2@test.com' },
      ]);
    });

    test('should create message status records for recipients using batch write', async () => {
      await notificationService.handleNewMessage(mockMessage, conversationId);

      expect(mockFirestoreAdapter.batchWrite).toHaveBeenCalledWith([
        {
          type: 'create',
          collection: `conversations/${conversationId}/messages/${mockMessage.id}/status`,
          id: 'recipient1@test.com',
          data: {
            userId: 'recipient1@test.com',
            status: 'SENT',
            sentAt: expect.any(Date),
          },
        },
        {
          type: 'create',
          collection: `conversations/${conversationId}/messages/${mockMessage.id}/status`,
          id: 'recipient2@test.com',
          data: {
            userId: 'recipient2@test.com',
            status: 'SENT',
            sentAt: expect.any(Date),
          },
        },
      ]);
    });

    test('should publish event to GCP Pub/Sub topic', async () => {
      await notificationService.handleNewMessage(mockMessage, conversationId);

      expect(mockPubSubAdapter.publishJson).toHaveBeenCalledWith(
        'chatflow-events',
        {
          type: 'message:new',
          payload: { message: mockMessage, conversationId },
          recipients: ['recipient1@test.com', 'recipient2@test.com'],
          timestamp: expect.any(String),
        },
        {
          eventType: 'message:new',
          conversationId,
          senderId: mockMessage.senderId,
        }
      );
    });

    test('should not include sender in recipients', async () => {
      await notificationService.handleNewMessage(mockMessage, conversationId);

             const publishCall = mockPubSubAdapter.publishJson.mock.calls[0];
       const event = publishCall?.[1] as any;
       expect(event.recipients).not.toContain('sender@test.com');
       expect(event.recipients).toEqual(['recipient1@test.com', 'recipient2@test.com']);
    });

    test('should handle empty recipient list', async () => {
      mockFirestoreAdapter.findInSubcollection.mockResolvedValue([
        { userId: 'sender@test.com' }, // Only sender
      ]);

      await notificationService.handleNewMessage(mockMessage, conversationId);

      expect(mockFirestoreAdapter.batchWrite).not.toHaveBeenCalled();
      expect(mockPubSubAdapter.publishJson).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    const messageId = 'msg-123';
    const conversationId = 'conv-456';
    const readerEmail = 'reader@test.com';

    beforeEach(() => {
      mockFirestoreAdapter.findById.mockResolvedValue({
        senderId: 'sender@test.com',
      });
    });

    test('should update message status using Firestore adapter', async () => {
      await notificationService.markAsRead(messageId, conversationId, readerEmail);

      expect(mockFirestoreAdapter.update).toHaveBeenCalledWith(
        `conversations/${conversationId}/messages/${messageId}/status`,
        readerEmail,
        {
          status: 'READ',
          readAt: expect.any(Date),
        }
      );
    });

    test('should create status if update fails', async () => {
      mockFirestoreAdapter.update.mockRejectedValueOnce(new Error('Document not found'));

      await notificationService.markAsRead(messageId, conversationId, readerEmail);

      expect(mockFirestoreAdapter.create).toHaveBeenCalledWith(
        `conversations/${conversationId}/messages/${messageId}/status`,
        readerEmail,
        {
          userId: readerEmail,
          status: 'READ',
          sentAt: expect.any(Date),
          readAt: expect.any(Date),
        }
      );
    });

    test('should publish read status event to Pub/Sub', async () => {
      await notificationService.markAsRead(messageId, conversationId, readerEmail);

      expect(mockPubSubAdapter.publishJson).toHaveBeenCalledWith(
        'chatflow-events',
        {
          type: 'message:status',
          payload: {
            messageId,
            conversationId,
            userId: readerEmail,
            status: 'READ',
            occurredAt: expect.any(String),
          },
          recipients: ['sender@test.com'],
          timestamp: expect.any(String),
        },
        {
          eventType: 'message:status',
          conversationId,
          messageId,
          userId: readerEmail,
        }
      );
    });

    test('should handle missing message gracefully', async () => {
      mockFirestoreAdapter.findById.mockResolvedValue(null);

      await expect(notificationService.markAsRead(messageId, conversationId, readerEmail))
        .resolves.not.toThrow();

      expect(mockPubSubAdapter.publishJson).not.toHaveBeenCalled();
    });
  });

  describe('Health Check', () => {
    test('should return healthy status when all services are working', async () => {
      mockPubSubAdapter.checkHealth.mockResolvedValue({ status: 'healthy' });

      const health = await notificationService.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.pubSub?.status).toBe('healthy');
      expect(health.connections?.total).toBe(0);
      expect(health.connections?.users).toBe(0);
    });

    test('should return unhealthy status when Pub/Sub is down', async () => {
      mockPubSubAdapter.checkHealth.mockResolvedValue({ status: 'unhealthy', details: 'Connection failed' });

      const health = await notificationService.checkHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.pubSub?.status).toBe('unhealthy');
      expect(health.pubSub?.details).toBe('Connection failed');
    });

    test('should report connection statistics', async () => {
      const ws1 = { ...mockWebSocket, send: jest.fn() };
      const ws2 = { ...mockWebSocket, send: jest.fn() };
      
      notificationService.registerConnection('user1@test.com', ws1 as any);
      notificationService.registerConnection('user2@test.com', ws2 as any);

      const health = await notificationService.checkHealth();

      expect(health.connections?.total).toBe(2);
      expect(health.connections?.users).toBe(2);
    });
  });

  describe('Graceful Shutdown', () => {
    test('should unsubscribe from Pub/Sub and close adapter', async () => {
      await notificationService.shutdown();

      expect(mockPubSubAdapter.unsubscribe).toHaveBeenCalledWith('chatflow-events-subscription');
      expect(mockPubSubAdapter.close).toHaveBeenCalled();
    });

    test('should clear all connections', async () => {
      const ws1 = { ...mockWebSocket, send: jest.fn() };
      notificationService.registerConnection('user@test.com', ws1 as any);

      const statsBefore = notificationService.getConnectionStats();
      expect(statsBefore.totalConnections).toBe(1);

      await notificationService.shutdown();

      const statsAfter = notificationService.getConnectionStats();
      expect(statsAfter.totalConnections).toBe(0);
    });
  });

  describe('Event Simulation (Development)', () => {
    test('should publish simulated events to Pub/Sub', async () => {
      const testEvent = {
        type: 'message:new' as const,
        payload: { message: { id: 'test-msg' } },
        recipients: ['test@example.com'],
        timestamp: new Date().toISOString(),
      };

      await notificationService.simulateEvent(testEvent);

      expect(mockPubSubAdapter.publishJson).toHaveBeenCalledWith(
        'chatflow-events',
        testEvent,
        { eventType: 'message:new' }
      );
    });
  });

  describe('Error Handling', () => {
         test('should handle Firestore adapter errors gracefully', async () => {
       const mockMessage = {
         id: 'msg-error',
         senderId: 'sender@test.com',
         content: 'Test',
         messageType: MessageType.TEXT,
         createdAt: new Date(),
         updatedAt: new Date(),
       };

      mockFirestoreAdapter.findInSubcollection.mockRejectedValue(new Error('Firestore error'));

      await expect(notificationService.handleNewMessage(mockMessage, 'conv-123'))
        .rejects.toThrow('Firestore error');
    });

         test('should handle Pub/Sub adapter errors gracefully', async () => {
       const mockMessage = {
         id: 'msg-error',
         senderId: 'sender@test.com',
         content: 'Test',
         messageType: MessageType.TEXT,
         createdAt: new Date(),
         updatedAt: new Date(),
       };

      mockFirestoreAdapter.findInSubcollection.mockResolvedValue([
        { userId: 'recipient@test.com' },
      ]);
      mockPubSubAdapter.publishJson.mockRejectedValue(new Error('Pub/Sub error'));

      await expect(notificationService.handleNewMessage(mockMessage, 'conv-123'))
        .rejects.toThrow('Pub/Sub error');
    });

    test('should handle invalid JSON in Pub/Sub messages', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Call the private method directly for testing
      await (notificationService as any).handlePubSubMessage('invalid json');

      expect(consoleSpy).toHaveBeenCalledWith('Invalid pubsub payload:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
}); 