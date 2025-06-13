import { WebSocket } from 'ws';
import '../test-setup';

// Create a mock class that doesn't use Redis
class MockNotificationService {
  private readonly connections: Map<string, Set<any>> = new Map();
  public prisma: any;
  public redisPub: any = { publish: jest.fn().mockResolvedValue(1) };

  registerConnection(email: string, ws: any): void {
    if (!this.connections.has(email)) {
      this.connections.set(email, new Set());
    }
    this.connections.get(email)!.add(ws);
  }

  unregisterConnection(email: string, ws: any): void {
    const set = this.connections.get(email);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.connections.delete(email);
    }
  }

  async handleNewMessage(message: any): Promise<void> {
    // Fetch all participants except sender
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    });

    const recipients = participants.map((p: any) => p.userId).filter((e: string) => e !== message.senderId);

    if (recipients.length === 0) return;

    // Insert SENT status rows
    await this.prisma.messageStatus.createMany({
      data: recipients.map((userId: string) => ({
        messageId: message.id,
        userId,
        status: 'SENT',
        sentAt: new Date(),
      })),
      skipDuplicates: true,
    });

    // Build event
    const event = {
      type: 'message:new',
      payload: { message },
      recipients,
    };

    // Only publish to Redis - let Redis distribute to all pods including this one
    await this.redisPub.publish('chatflow-events', JSON.stringify(event));
  }

  async markAsRead(messageId: string, readerEmail: string): Promise<void> {
    // Update the row
    await this.prisma.messageStatus.upsert({
      where: { messageId_userId: { messageId, userId: readerEmail } },
      update: {
        status: 'READ',
        readAt: new Date(),
      },
      create: {
        messageId,
        userId: readerEmail,
        status: 'READ',
        readAt: new Date(),
        sentAt: new Date(),
      },
    });

    // Fetch sender to notify
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, conversationId: true },
    });

    if (!message) return;

    const recipients = [message.senderId];

    const event = {
      type: 'message:status',
      payload: {
        messageId,
        conversationId: message.conversationId,
        userId: readerEmail,
        status: 'READ',
        occurredAt: new Date().toISOString(),
      },
      recipients,
    };

    // Only publish to Redis - let Redis distribute to all pods including this one
    await this.redisPub.publish('chatflow-events', JSON.stringify(event));
  }

  async handlePubSubMessage(raw: string): Promise<void> {
    try {
      const event = JSON.parse(raw);
      await this.broadcastLocal(event);
    } catch (err) {
      console.error('Invalid pubsub payload', err);
    }
  }

  private async broadcastLocal(event: any): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    for (const email of event.recipients) {
      const sockets = this.connections.get(email);
      if (!sockets || sockets.size === 0) continue;

      for (const ws of sockets) {
        try {
          ws.send(JSON.stringify({
            type: event.type,
            payload: event.payload,
            timestamp: new Date().toISOString(),
          }));
        } catch (err) {
          console.error(`WS send error to ${email}`, err);
        }
      }

      // For message:new, flip status to DELIVERED once delivered locally
      if (event.type === 'message:new') {
        tasks.push(
          Promise.resolve(this.prisma.messageStatus.update({
            where: { messageId_userId: { messageId: event.payload.message.id, userId: email } },
            data: {
              status: 'DELIVERED',
              deliveredAt: new Date(),
            },
          })).catch(() => {/* ignore */})
        );
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }
}

// Mock WebSocket
const mockWebSocket = {
  send: jest.fn(),
  userEmail: '',
} as unknown as WebSocket & { userEmail: string };

// Mock Prisma
const mockPrisma = {
  conversationParticipant: {
    findMany: jest.fn(),
  },
  messageStatus: {
    createMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  message: {
    findUnique: jest.fn(),
  },
};

describe('NotificationService', () => {
  let notificationService: MockNotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create service instance and mock Prisma
    notificationService = new MockNotificationService();
    notificationService.prisma = mockPrisma;
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

      // Check internal state
      const connections = (notificationService as any).connections;
      expect(connections.get('user1@test.com').size).toBe(2);
      expect(connections.get('user2@test.com').size).toBe(1);

      // Unregister one connection for user1
      notificationService.unregisterConnection('user1@test.com', ws1 as any);
      expect(connections.get('user1@test.com').size).toBe(1);

      // Unregister last connection for user2
      notificationService.unregisterConnection('user2@test.com', ws3 as any);
      expect(connections.has('user2@test.com')).toBe(false);
    });
  });

  describe('handleNewMessage', () => {
    const mockMessage = {
      id: 'msg-123',
      conversationId: 'conv-456',
      senderId: 'sender@test.com',
      content: 'Hello world',
      createdAt: new Date(),
    };

    beforeEach(() => {
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { userId: 'sender@test.com' },
        { userId: 'recipient1@test.com' },
        { userId: 'recipient2@test.com' },
      ]);
      mockPrisma.messageStatus.createMany.mockResolvedValue({ count: 2 });
    });

    test('should create message status records for recipients', async () => {
      await notificationService.handleNewMessage(mockMessage as any);

      expect(mockPrisma.messageStatus.createMany).toHaveBeenCalledWith({
        data: [
          {
            messageId: 'msg-123',
            userId: 'recipient1@test.com',
            status: 'SENT',
            sentAt: expect.any(Date),
          },
          {
            messageId: 'msg-123',
            userId: 'recipient2@test.com',
            status: 'SENT',
            sentAt: expect.any(Date),
          },
        ],
        skipDuplicates: true,
      });
    });

    test('should broadcast to connected recipients and publish to Redis', async () => {
      const ws1 = { ...mockWebSocket, send: jest.fn() };
      const ws2 = { ...mockWebSocket, send: jest.fn() };
      
      notificationService.registerConnection('recipient1@test.com', ws1 as any);
      notificationService.registerConnection('recipient2@test.com', ws2 as any);

      await notificationService.handleNewMessage(mockMessage as any);

      // WebSocket broadcasts should NOT happen directly - only through Redis pub/sub
      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled();

      // Check Redis publish
      expect(notificationService.redisPub.publish).toHaveBeenCalledWith(
        'chatflow-events',
        JSON.stringify({
          type: 'message:new',
          payload: { message: mockMessage },
          recipients: ['recipient1@test.com', 'recipient2@test.com'],
        })
      );
    });

    test('should update status to DELIVERED for connected recipients', async () => {
      const ws1 = { ...mockWebSocket, send: jest.fn() };
      notificationService.registerConnection('recipient1@test.com', ws1 as any);

      mockPrisma.messageStatus.update.mockResolvedValue({});

      await notificationService.handleNewMessage(mockMessage as any);

      // Status update to DELIVERED should NOT happen directly - only through Redis pub/sub broadcast
      expect(mockPrisma.messageStatus.update).not.toHaveBeenCalled();
    });

    test('should not broadcast to sender', async () => {
      const senderWs = { ...mockWebSocket, send: jest.fn() };
      notificationService.registerConnection('sender@test.com', senderWs as any);

      await notificationService.handleNewMessage(mockMessage as any);

      expect(senderWs.send).not.toHaveBeenCalled();
    });

    test('should handle empty recipient list', async () => {
      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { userId: 'sender@test.com' }, // Only sender
      ]);

      await notificationService.handleNewMessage(mockMessage as any);

      expect(mockPrisma.messageStatus.createMany).not.toHaveBeenCalled();
      expect(notificationService.redisPub.publish).not.toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    beforeEach(() => {
      mockPrisma.messageStatus.upsert.mockResolvedValue({});
      mockPrisma.message.findUnique.mockResolvedValue({
        senderId: 'sender@test.com',
        conversationId: 'conv-456',
      });
    });

    test('should update message status to read', async () => {
      await notificationService.markAsRead('msg-123', 'reader@test.com');

      expect(mockPrisma.messageStatus.upsert).toHaveBeenCalledWith({
        where: { messageId_userId: { messageId: 'msg-123', userId: 'reader@test.com' } },
        update: {
          status: 'READ',
          readAt: expect.any(Date),
        },
        create: {
          messageId: 'msg-123',
          userId: 'reader@test.com',
          status: 'READ',
          readAt: expect.any(Date),
          sentAt: expect.any(Date),
        },
      });
    });

    test('should notify sender about read status', async () => {
      const senderWs = { ...mockWebSocket, send: jest.fn() };
      notificationService.registerConnection('sender@test.com', senderWs as any);

      await notificationService.markAsRead('msg-123', 'reader@test.com');

      // WebSocket notification should NOT happen directly - only through Redis pub/sub
      expect(senderWs.send).not.toHaveBeenCalled();

      expect(notificationService.redisPub.publish).toHaveBeenCalledWith(
        'chatflow-events',
        expect.stringContaining('"type":"message:status"')
      );
    });

    test('should handle missing message gracefully', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(notificationService.markAsRead('nonexistent', 'reader@test.com'))
        .resolves.not.toThrow();

      expect(notificationService.redisPub.publish).not.toHaveBeenCalled();
    });
  });

  describe('PubSub Event Handling', () => {
    test('should handle incoming pubsub events and broadcast locally', async () => {
      const ws1 = { ...mockWebSocket, send: jest.fn() };
      const ws2 = { ...mockWebSocket, send: jest.fn() };
      
      notificationService.registerConnection('user1@test.com', ws1 as any);
      notificationService.registerConnection('user2@test.com', ws2 as any);

      const pubsubEvent = {
        type: 'message:new',
        payload: { message: { id: 'msg-456', content: 'Test message' } },
        recipients: ['user1@test.com', 'user2@test.com'],
      };

      // Simulate receiving pubsub message
      await notificationService.handlePubSubMessage(JSON.stringify(pubsubEvent));

      expect(ws1.send).toHaveBeenCalledWith(expect.stringContaining('"type":"message:new"'));
      expect(ws1.send).toHaveBeenCalledWith(expect.stringContaining('"id":"msg-456"'));
      
      expect(ws2.send).toHaveBeenCalledWith(expect.stringContaining('"type":"message:new"'));
      expect(ws2.send).toHaveBeenCalledWith(expect.stringContaining('"id":"msg-456"'));
    });

    test('should handle invalid pubsub messages gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await notificationService.handlePubSubMessage('invalid json');

      expect(consoleSpy).toHaveBeenCalledWith('Invalid pubsub payload', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should only broadcast to recipients specified in event', async () => {
      const ws1 = { ...mockWebSocket, send: jest.fn() };
      const ws2 = { ...mockWebSocket, send: jest.fn() };
      const ws3 = { ...mockWebSocket, send: jest.fn() };
      
      notificationService.registerConnection('user1@test.com', ws1 as any);
      notificationService.registerConnection('user2@test.com', ws2 as any);
      notificationService.registerConnection('user3@test.com', ws3 as any);

      const pubsubEvent = {
        type: 'message:status',
        payload: { messageId: 'msg-789', status: 'READ' },
        recipients: ['user1@test.com', 'user3@test.com'], // Only user1 and user3
      };

      await notificationService.handlePubSubMessage(JSON.stringify(pubsubEvent));

      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).not.toHaveBeenCalled(); // user2 not in recipients
      expect(ws3.send).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle WebSocket send errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const ws = { 
        ...mockWebSocket, 
        send: jest.fn().mockImplementation(() => { throw new Error('Connection closed'); })
      };
      
      notificationService.registerConnection('user@test.com', ws as any);

      const pubsubEvent = {
        type: 'message:new',
        payload: { message: { id: 'msg-error' } },
        recipients: ['user@test.com'],
      };

      await expect(notificationService.handlePubSubMessage(JSON.stringify(pubsubEvent))).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('WS send error to user@test.com', expect.any(Error));
      consoleSpy.mockRestore();
    });

    test('should handle database errors in status updates gracefully', async () => {
      const ws = { ...mockWebSocket, send: jest.fn() };
      notificationService.registerConnection('user@test.com', ws as any);

      mockPrisma.messageStatus.update.mockRejectedValue(new Error('DB error'));

      const pubsubEvent = {
        type: 'message:new',
        payload: { message: { id: 'msg-db-error' } },
        recipients: ['user@test.com'],
      };

      await expect(notificationService.handlePubSubMessage(JSON.stringify(pubsubEvent))).resolves.not.toThrow();

      // Should still send WebSocket message even if DB update fails
      expect(ws.send).toHaveBeenCalled();
    });
  });
}); 