// Base messaging adapter for pub/sub operations
export interface PubSubMessage {
  data: string;
  attributes?: { [key: string]: string };
  messageId?: string;
  publishTime?: Date;
}

export interface MessageHandler {
  (message: PubSubMessage): Promise<void> | void;
}

export interface MessagingAdapter {
  // Publisher operations
  publish(topicName: string, data: string, attributes?: { [key: string]: string }): Promise<string>;
  publishJson(topicName: string, data: object, attributes?: { [key: string]: string }): Promise<string>;
  
  // Subscriber operations
  subscribe(subscriptionName: string, handler: MessageHandler): Promise<void>;
  unsubscribe(subscriptionName: string): Promise<void>;
  
  // Topic and subscription management
  createTopic(topicName: string): Promise<void>;
  createSubscription(topicName: string, subscriptionName: string, options?: SubscriptionOptions): Promise<void>;
  deleteTopic(topicName: string): Promise<void>;
  deleteSubscription(subscriptionName: string): Promise<void>;
  
  // Health and status
  isConnected(): boolean;
  checkHealth(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }>;
  close(): Promise<void>;
}

export interface SubscriptionOptions {
  ackDeadlineSeconds?: number;
  maxMessages?: number;
  allowExcessMessages?: boolean;
  enableMessageOrdering?: boolean;
  filter?: string;
  deadLetterPolicy?: {
    deadLetterTopic: string;
    maxDeliveryAttempts: number;
  };
} 