import { PubSub } from '@google-cloud/pubsub';
import { MessagingAdapter, PubSubMessage, MessageHandler, SubscriptionOptions } from './base.adapter';

export class RealGcpPubSubAdapter implements MessagingAdapter {
  private pubsub: PubSub;
  private subscriptions: Map<string, { subscription: any; handler: MessageHandler }> = new Map();
  private connected = true;

  constructor() {
    const projectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'chatflow-dev';
    
    if (process.env['PUBSUB_EMULATOR_HOST']) {
      console.log(`Initializing Pub/Sub with emulator at ${process.env['PUBSUB_EMULATOR_HOST']}`);
      this.pubsub = new PubSub({ projectId });
    } else {
      console.log('Initializing Pub/Sub for production');
      this.pubsub = new PubSub({ projectId });
    }
  }

  async publish(topicName: string, data: string, attributes?: { [key: string]: string }): Promise<string> {
    try {
      const topic = this.pubsub.topic(topicName);
      
      // Ensure topic exists
      const [exists] = await topic.exists();
      if (!exists) {
        await this.createTopic(topicName);
      }
      
      const messageId = await topic.publishMessage({
        data: Buffer.from(data),
        attributes: attributes || {},
      });
      
      console.log(`Published message ${messageId} to topic ${topicName}`);
      return messageId;
    } catch (error) {
      console.error(`Failed to publish message to topic ${topicName}:`, error);
      throw error;
    }
  }

  async publishJson(topicName: string, data: object, attributes?: { [key: string]: string }): Promise<string> {
    return this.publish(topicName, JSON.stringify(data), attributes);
  }

  async subscribe(subscriptionName: string, handler: MessageHandler): Promise<void> {
    try {
      const subscription = this.pubsub.subscription(subscriptionName);
      
      // Ensure subscription exists
      const [exists] = await subscription.exists();
      if (!exists) {
        throw new Error(`Subscription ${subscriptionName} does not exist. Create it first using createSubscription().`);
      }
      
      // Set up message handler
      const messageHandler = (message: any) => {
        const pubsubMessage: PubSubMessage = {
          data: message.data.toString(),
          attributes: message.attributes || {},
          messageId: message.id,
          publishTime: new Date(message.publishTime),
        };
        
        try {
          handler(pubsubMessage);
          message.ack();
        } catch (error) {
          console.error(`Error processing message in subscription ${subscriptionName}:`, error);
          message.nack();
        }
      };
      
      subscription.on('message', messageHandler);
      subscription.on('error', (error: any) => {
        console.error(`Subscription ${subscriptionName} error:`, error);
      });
      
      this.subscriptions.set(subscriptionName, { subscription, handler });
      console.log(`Subscribed to ${subscriptionName}`);
    } catch (error) {
      console.error(`Failed to subscribe to ${subscriptionName}:`, error);
      throw error;
    }
  }

  async unsubscribe(subscriptionName: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionName);
    if (sub) {
      await sub.subscription.close();
      this.subscriptions.delete(subscriptionName);
      console.log(`Unsubscribed from ${subscriptionName}`);
    }
  }

  async createTopic(topicName: string): Promise<void> {
    try {
      const [, created] = await this.pubsub.createTopic(topicName);
      if (created) {
        console.log(`Created topic ${topicName}`);
      } else {
        console.log(`Topic ${topicName} already exists`);
      }
    } catch (error: any) {
      if (error.code === 6) { // ALREADY_EXISTS
        console.log(`Topic ${topicName} already exists`);
      } else {
        console.error(`Failed to create topic ${topicName}:`, error);
        throw error;
      }
    }
  }

  async createSubscription(
    topicName: string, 
    subscriptionName: string, 
    options: SubscriptionOptions = {}
  ): Promise<void> {
    try {
      // Ensure topic exists first
      await this.createTopic(topicName);
      
      const subscriptionOptions: any = {};
      if (options.ackDeadlineSeconds) {
        subscriptionOptions.ackDeadlineSeconds = options.ackDeadlineSeconds;
      }
      
      await this.pubsub
        .topic(topicName)
        .createSubscription(subscriptionName, subscriptionOptions);
        
      console.log(`Created subscription ${subscriptionName} for topic ${topicName}`,
                  options.ackDeadlineSeconds ? `with ack deadline: ${options.ackDeadlineSeconds}s` : '');
    } catch (error: any) {
      if (error.code === 6) { // ALREADY_EXISTS
        console.log(`Subscription ${subscriptionName} already exists`);
      } else {
        console.error(`Failed to create subscription ${subscriptionName}:`, error);
        throw error;
      }
    }
  }

  async deleteTopic(topicName: string): Promise<void> {
    try {
      await this.pubsub.topic(topicName).delete();
      console.log(`Deleted topic ${topicName}`);
    } catch (error) {
      console.error(`Failed to delete topic ${topicName}:`, error);
      throw error;
    }
  }

  async deleteSubscription(subscriptionName: string): Promise<void> {
    try {
      await this.unsubscribe(subscriptionName);
      await this.pubsub.subscription(subscriptionName).delete();
      console.log(`Deleted subscription ${subscriptionName}`);
    } catch (error) {
      console.error(`Failed to delete subscription ${subscriptionName}:`, error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    try {
      // Close all subscriptions
      const subscriptionNames = Array.from(this.subscriptions.keys());
      for (const subscriptionName of subscriptionNames) {
        await this.unsubscribe(subscriptionName);
      }
      
      await this.pubsub.close();
      this.connected = false;
      console.log('Real GCP Pub/Sub adapter closed');
    } catch (error) {
      console.error('Error closing Pub/Sub adapter:', error);
      throw error;
    }
  }

  // Health check method
  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    try {
      // Try to list topics as a health check
      await this.pubsub.getTopics();
      return { status: 'healthy' };
    } catch (error: any) {
      return { 
        status: 'unhealthy', 
        details: `Pub/Sub connection failed: ${error.message}` 
      };
    }
  }

  // Development utility methods
  async getTopics(): Promise<string[]> {
    try {
      const [topics] = await this.pubsub.getTopics();
      return topics.map(topic => topic.name.split('/').pop() || '');
    } catch (error) {
      console.error('Failed to get topics:', error);
      return [];
    }
  }

  async getSubscriptions(): Promise<string[]> {
    try {
      const [subscriptions] = await this.pubsub.getSubscriptions();
      return subscriptions.map(sub => sub.name.split('/').pop() || '');
    } catch (error) {
      console.error('Failed to get subscriptions:', error);
      return [];
    }
  }
} 