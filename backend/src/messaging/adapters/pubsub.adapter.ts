// Mock GCP Pub/Sub adapter for development - will be replaced with real implementation
import { MessagingAdapter, PubSubMessage, MessageHandler, SubscriptionOptions } from './base.adapter';

export class GcpPubSubAdapter implements MessagingAdapter {
  // Mock storage for messages and subscriptions
  private topics: Map<string, string[]> = new Map();
  private subscriptions: Map<string, { topic: string; handler: MessageHandler }> = new Map();
  private messageIdCounter = 1;
  private connected = true;

  constructor(projectId?: string) {
    console.log(`Mock GCP Pub/Sub adapter initialized for project: ${projectId || 'default'}`);
  }

  async publish(topicName: string, data: string, attributes?: { [key: string]: string }): Promise<string> {
    const messageId = `msg_${this.messageIdCounter++}`;
    
    // Store message for mock delivery to subscribers
    if (!this.topics.has(topicName)) {
      this.topics.set(topicName, []);
    }
    
    // Create mock message
    const message: PubSubMessage = {
      data,
      attributes: attributes || {},
      messageId,
      publishTime: new Date(),
    };

    // Deliver to all subscribers of this topic (simulate pub/sub)
    for (const [subscriptionName, subscription] of this.subscriptions.entries()) {
      if (subscription.topic === topicName) {
        // Simulate async delivery
        setTimeout(() => {
          try {
            subscription.handler(message);
          } catch (error) {
            console.error(`Error in subscription ${subscriptionName}:`, error);
          }
        }, 10);
      }
    }

    console.log(`Published message ${messageId} to topic ${topicName}`);
    return messageId;
  }

  async publishJson(topicName: string, data: object, attributes?: { [key: string]: string }): Promise<string> {
    return this.publish(topicName, JSON.stringify(data), attributes);
  }

  async subscribe(subscriptionName: string, handler: MessageHandler): Promise<void> {
    // For mock, we'll assume subscription exists and is tied to a topic
    // In real implementation, this would need to be pre-configured
    const topicName = this.getTopicForSubscription(subscriptionName);
    
    this.subscriptions.set(subscriptionName, {
      topic: topicName,
      handler,
    });

    console.log(`Subscribed to ${subscriptionName} (topic: ${topicName})`);
  }

  async unsubscribe(subscriptionName: string): Promise<void> {
    this.subscriptions.delete(subscriptionName);
    console.log(`Unsubscribed from ${subscriptionName}`);
  }

  async createTopic(topicName: string): Promise<void> {
    if (!this.topics.has(topicName)) {
      this.topics.set(topicName, []);
      console.log(`Created topic ${topicName}`);
    } else {
      console.log(`Topic ${topicName} already exists`);
    }
  }

  async createSubscription(
    topicName: string, 
    subscriptionName: string, 
    options: SubscriptionOptions = {}
  ): Promise<void> {
    // Ensure topic exists
    await this.createTopic(topicName);
    
    // Store the topic-subscription mapping for mock delivery
    // In real implementation, this would create actual GCP subscription
    console.log(`Created subscription ${subscriptionName} for topic ${topicName}`, 
                options.ackDeadlineSeconds ? `with ack deadline: ${options.ackDeadlineSeconds}s` : '');
  }

  async deleteTopic(topicName: string): Promise<void> {
    this.topics.delete(topicName);
    console.log(`Deleted topic ${topicName}`);
  }

  async deleteSubscription(subscriptionName: string): Promise<void> {
    await this.unsubscribe(subscriptionName);
    console.log(`Deleted subscription ${subscriptionName}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    return this.connected 
      ? { status: 'healthy' }
      : { status: 'unhealthy', details: 'Adapter is disconnected' };
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
    this.topics.clear();
    this.connected = false;
    console.log('Mock GCP Pub/Sub adapter closed');
  }

  // Helper method to map subscription to topic (mock logic)
  private getTopicForSubscription(subscriptionName: string): string {
    // For chatflow, we'll use a naming convention
    if (subscriptionName.includes('chatflow-events')) {
      return 'chatflow-events';
    }
    // Default topic name based on subscription
    return subscriptionName.replace('-subscription', '');
  }



  // Development utility methods
  getTopics(): string[] {
    return Array.from(this.topics.keys());
  }

  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // Simulate message delivery for testing
  async simulateMessage(topicName: string, data: string, attributes?: { [key: string]: string }): Promise<void> {
    await this.publish(topicName, data, attributes);
  }
}

export const gcpPubSubAdapter = new GcpPubSubAdapter(); 