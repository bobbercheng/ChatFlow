import { PrismaClient, Message, MessageDeliveryStatus } from '@prisma/client';
// @ts-ignore - redis has builtin types when installed, but editor may not find them before installation
import { createClient, RedisClientType } from 'redis';
import { WebSocket } from 'ws';

// Minimal duplicate of AuthenticatedWebSocket from websocket.ts to avoid import cycles
interface AuthenticatedWebSocket extends WebSocket {
  userEmail?: string;
}

interface PubSubEvent {
  type: 'message:new' | 'message:status';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  recipients: string[]; // list of user emails that should receive the event
}

export class NotificationService {
  private readonly prisma = new PrismaClient();

  // email -> set of live sockets on this pod
  private readonly connections: Map<string, Set<AuthenticatedWebSocket>> = new Map();

  private readonly redisPub: RedisClientType;
  private readonly redisSub: RedisClientType;

  private static readonly PUBSUB_CHANNEL = 'chatflow-events';

  constructor() {
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6380';
    this.redisPub = createClient({ url: redisUrl });
    this.redisSub = this.redisPub.duplicate();

    this.redisPub.connect().catch((err: unknown) => console.error('Redis pub connect error', err));
    this.redisSub.connect().catch((err: unknown) => console.error('Redis sub connect error', err));

    // Subscribe to shared channel for cross-pod fan-out
    this.redisSub.subscribe(NotificationService.PUBSUB_CHANNEL, (msg: string) => {
      this.handlePubSubMessage(msg);
    }).catch((err: unknown) => console.error('Redis subscribe error', err));
  }

  registerConnection(email: string, ws: AuthenticatedWebSocket): void {
    if (!this.connections.has(email)) {
      this.connections.set(email, new Set());
    }
    this.connections.get(email)!.add(ws);
  }

  unregisterConnection(email: string, ws: AuthenticatedWebSocket): void {
    const set = this.connections.get(email);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.connections.delete(email);
    }
  }

  async handleNewMessage(message: Message): Promise<void> {
    // Fetch all participants except sender
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    });

    const recipients = participants.map(p => p.userId).filter(e => e !== message.senderId);

    if (recipients.length === 0) return;

    // Insert SENT status rows (idempotent via skipDuplicates)
    // @ts-ignore - generated client will include messageStatus
    await this.prisma.messageStatus.createMany({
      data: recipients.map(userId => ({
        messageId: message.id,
        userId,
        status: MessageDeliveryStatus.SENT,
        sentAt: new Date(),
      })),
      skipDuplicates: true,
    });

    // Build event
    const event: PubSubEvent = {
      type: 'message:new',
      payload: { message },
      recipients,
    };

    // Only publish to Redis - let Redis distribute to all pods including this one
    await this.redisPub.publish(NotificationService.PUBSUB_CHANNEL, JSON.stringify(event));
  }

  async markAsRead(messageId: string, readerEmail: string): Promise<void> {
    // Update the row; if already READ, this will just keep read timestamp
    // @ts-ignore - generated client will include messageStatus
    await this.prisma.messageStatus.upsert({
      where: { messageId_userId: { messageId, userId: readerEmail } },
      update: {
        status: MessageDeliveryStatus.READ,
        readAt: new Date(),
      },
      create: {
        messageId,
        userId: readerEmail,
        status: MessageDeliveryStatus.READ,
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

    const event: PubSubEvent = {
      type: 'message:status',
      payload: {
        messageId,
        conversationId: message.conversationId,
        userId: readerEmail,
        status: MessageDeliveryStatus.READ,
        occurredAt: new Date().toISOString(),
      },
      recipients,
    };

    // Only publish to Redis - let Redis distribute to all pods including this one
    await this.redisPub.publish(NotificationService.PUBSUB_CHANNEL, JSON.stringify(event));
  }

  // ------------- Internal helpers -------------

  private async handlePubSubMessage(raw: string): Promise<void> {
    try {
      const event: PubSubEvent = JSON.parse(raw);
      await this.broadcastLocal(event);
    } catch (err) {
      console.error('Invalid pubsub payload', err);
    }
  }

  private async broadcastLocal(event: PubSubEvent): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    for (const email of event.recipients) {
      const sockets = this.connections.get(email);
      if (!sockets || sockets.size === 0) continue;

      console.log(`Broadcasting to all connections for online user ${email}`, event);
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

      // For message:new, flip status to DELIVERED once delivered locally (idempotent)
      if (event.type === 'message:new') {
        tasks.push(
          // @ts-ignore
          this.prisma.messageStatus.update({
            where: { messageId_userId: { messageId: event.payload.message.id, userId: email } },
            data: {
              status: MessageDeliveryStatus.DELIVERED,
              deliveredAt: new Date(),
            },
          }).catch(() => {/* ignore */})
        );
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }
}

export const notificationService = new NotificationService(); 