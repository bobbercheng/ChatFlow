import { databaseAdapter, messagingAdapter } from '../adapters';
import { PubSubMessage } from '../messaging/adapters/base.adapter';
import { COLLECTIONS, FirestoreMessage, MessageDeliveryStatus } from '../types/firestore';
import { WebSocket } from 'ws';

// Minimal duplicate of AuthenticatedWebSocket from websocket.ts to avoid import cycles
interface AuthenticatedWebSocket extends WebSocket {
  userEmail?: string;
}

interface PubSubEvent {
  type: 'message:new' | 'message:status';
  payload: any;
  recipients: string[]; // list of user emails that should receive the event
  timestamp: string;
}

export class NotificationServicePubSub {
  // email -> set of live sockets on this pod
  private readonly connections: Map<string, Set<AuthenticatedWebSocket>> = new Map();

  private static readonly TOPIC_NAME = 'chatflow-events';
  private static readonly SUBSCRIPTION_NAME = 'chatflow-events-subscription';

  constructor() {
    this.initializePubSub().catch((err: unknown) => 
      console.error('Failed to initialize Pub/Sub:', err)
    );
  }

  private async initializePubSub(): Promise<void> {
    try {
      // Create topic and subscription
      await messagingAdapter.createTopic(NotificationServicePubSub.TOPIC_NAME);
      await messagingAdapter.createSubscription(
        NotificationServicePubSub.TOPIC_NAME,
        NotificationServicePubSub.SUBSCRIPTION_NAME,
        {
          ackDeadlineSeconds: 60,
          maxMessages: 100,
          enableMessageOrdering: false,
        }
      );

      // Subscribe to messages
      await messagingAdapter.subscribe(
        NotificationServicePubSub.SUBSCRIPTION_NAME,
        this.handlePubSubMessage.bind(this)
      );

      console.log('GCP Pub/Sub notification service initialized');
    } catch (error) {
      console.error('Error initializing Pub/Sub:', error);
      throw error;
    }
  }

  registerConnection(email: string, ws: AuthenticatedWebSocket): void {
    if (!this.connections.has(email)) {
      this.connections.set(email, new Set());
    }
    this.connections.get(email)!.add(ws);
    console.log(`Registered WebSocket connection for user: ${email}`);
  }

  unregisterConnection(email: string, ws: AuthenticatedWebSocket): void {
    const set = this.connections.get(email);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.connections.delete(email);
    }
    console.log(`Unregistered WebSocket connection for user: ${email}`);
  }

  async handleNewMessage(message: FirestoreMessage, conversationId: string): Promise<void> {
    // Get all participants except sender
    const participants = await databaseAdapter.findInSubcollection(
      COLLECTIONS.CONVERSATIONS,
      conversationId,
      COLLECTIONS.PARTICIPANTS
    );

    const recipients = participants
      .map((p: any) => p.userId)
      .filter((email: string) => email !== message.senderId);

    if (recipients.length === 0) return;

    // Insert SENT status records using batch write
    const statusOperations = recipients.map((userId: string) => ({
      type: 'create' as const,
      collection: `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}/${message.id}/${COLLECTIONS.MESSAGE_STATUS}`,
      id: userId,
      data: {
        userId,
        status: MessageDeliveryStatus.SENT,
        sentAt: new Date(),
      },
    }));

    await databaseAdapter.batchWrite(statusOperations);

    // Build event
    const event: PubSubEvent = {
      type: 'message:new',
      payload: { message, conversationId },
      recipients,
      timestamp: new Date().toISOString(),
    };

    // Publish to Pub/Sub topic
    await messagingAdapter.publishJson(
      NotificationServicePubSub.TOPIC_NAME,
      event,
      {
        eventType: 'message:new',
        conversationId,
        senderId: message.senderId,
      }
    );
  }

  async markAsRead(messageId: string, conversationId: string, readerEmail: string): Promise<void> {
    // Update the message status using Firestore adapter
    try {
      await databaseAdapter.update(
        `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}/${messageId}/${COLLECTIONS.MESSAGE_STATUS}`,
        readerEmail,
        {
          status: MessageDeliveryStatus.READ,
          readAt: new Date(),
        }
      );
    } catch (error) {
      // If status doesn't exist, create it
      await databaseAdapter.create(
        `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}/${messageId}/${COLLECTIONS.MESSAGE_STATUS}`,
        readerEmail,
        {
          userId: readerEmail,
          status: MessageDeliveryStatus.READ,
          sentAt: new Date(),
          readAt: new Date(),
        }
      );
    }

    // Get message to find sender
    const message = await databaseAdapter.findById<{ senderId: string }>(
      `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
      messageId
    );

    if (!message) return;

    const recipients = [message.senderId];

    const event: PubSubEvent = {
      type: 'message:status',
      payload: {
        messageId,
        conversationId,
        userId: readerEmail,
        status: MessageDeliveryStatus.READ,
        occurredAt: new Date().toISOString(),
      },
      recipients,
      timestamp: new Date().toISOString(),
    };

    // Publish to Pub/Sub topic
    await messagingAdapter.publishJson(
      NotificationServicePubSub.TOPIC_NAME,
      event,
      {
        eventType: 'message:status',
        conversationId,
        messageId,
        userId: readerEmail,
      }
    );
  }

  // Handle incoming Pub/Sub messages
  private async handlePubSubMessage(message: PubSubMessage): Promise<void> {
    try {
      const event: PubSubEvent = JSON.parse(message.data);
      await this.broadcastLocal(event);
    } catch (error) {
      console.error('Invalid pubsub payload:', error);
    }
  }

  // Broadcast event to local WebSocket connections
  private async broadcastLocal(event: PubSubEvent): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    for (const email of event.recipients) {
      const sockets = this.connections.get(email);
      if (!sockets || sockets.size === 0) continue;

      console.log(`Broadcasting to all connections for online user ${email}`, {
        type: event.type,
        recipientCount: event.recipients.length,
      });

      for (const ws of sockets) {
        try {
          ws.send(JSON.stringify({
            type: event.type,
            payload: event.payload,
            timestamp: event.timestamp,
          }));
        } catch (error) {
          console.error(`WebSocket send error to ${email}:`, error);
        }
      }

      // For message:new events, update status to DELIVERED once delivered locally
      if (event.type === 'message:new') {
        const { message, conversationId } = event.payload;
        tasks.push(
          databaseAdapter.update(
            `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}/${message.id}/${COLLECTIONS.MESSAGE_STATUS}`,
            email,
            {
              status: MessageDeliveryStatus.DELIVERED,
              deliveredAt: new Date(),
            }
          ).catch(() => {/* ignore delivery status update errors */})
        );
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  // Health check method
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    pubSub?: { status: 'healthy' | 'unhealthy'; details?: string };
    connections?: { total: number; users: number };
  }> {
    const pubSubHealth = await messagingAdapter.checkHealth();
    
    let totalConnections = 0;
    for (const socketSet of this.connections.values()) {
      totalConnections += socketSet.size;
    }

    return {
      status: pubSubHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      pubSub: pubSubHealth,
      connections: {
        total: totalConnections,
        users: this.connections.size,
      },
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    console.log('Shutting down Notification Service...');
    
    // Unsubscribe from Pub/Sub
    await messagingAdapter.unsubscribe(NotificationServicePubSub.SUBSCRIPTION_NAME);
    
    // Close Pub/Sub adapter
    await messagingAdapter.close();
    
    // Clear connections
    this.connections.clear();
    
    console.log('Notification Service shutdown complete');
  }

  // Development utility methods
  getConnectionStats(): { totalConnections: number; connectedUsers: string[] } {
    let totalConnections = 0;
    const connectedUsers: string[] = [];
    
    for (const [email, socketSet] of this.connections.entries()) {
      totalConnections += socketSet.size;
      connectedUsers.push(email);
    }
    
    return { totalConnections, connectedUsers };
  }

  // Test method to simulate events
  async simulateEvent(event: PubSubEvent): Promise<void> {
    await messagingAdapter.publishJson(
      NotificationServicePubSub.TOPIC_NAME,
      event,
      { eventType: event.type }
    );
  }
}

export const notificationService = new NotificationServicePubSub(); 