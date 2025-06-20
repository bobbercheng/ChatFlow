// Temporary type - will be replaced with proper Firestore Timestamp after dependency installation
export type FirestoreTimestamp = Date;

// Enums
export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP'
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE'
}

export enum ConversationParticipantRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER'
}

export enum MessageDeliveryStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED', 
  READ = 'READ',
  FAILED = 'FAILED'
}

// Core document interfaces
export interface FirestoreUser {
  email: string; // Used as document ID
  hashedPassword: string;
  displayName: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
}

export interface FirestoreConversation {
  id: string; // Auto-generated document ID
  createdBy: string; // User email
  type: ConversationType;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
  // Denormalized for efficient queries
  participantEmails: string[];
}

export interface FirestoreConversationParticipant {
  // Document ID: userEmail
  userId: string; // User email
  joinedAt: FirestoreTimestamp;
  role: ConversationParticipantRole;
}

export interface FirestoreMessage {
  id: string; // Auto-generated document ID
  conversationId: string; // Parent conversation ID
  senderId: string; // User email
  senderDisplayName: string; // Denormalized sender display name
  messageType: MessageType;
  content: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface FirestoreMessageStatus {
  // Document ID: userEmail
  userId: string; // User email
  status: MessageDeliveryStatus;
  sentAt: FirestoreTimestamp;
  deliveredAt?: FirestoreTimestamp;
  readAt?: FirestoreTimestamp;
}

// Extended interfaces with computed/joined data
export interface ConversationWithParticipants extends FirestoreConversation {
  participants: Array<{
    userId: string;
    joinedAt: FirestoreTimestamp;
    role: ConversationParticipantRole;
  }>;
}

export interface MessageWithSender extends FirestoreMessage {
  sender: {
    email: string;
    displayName: string;
  };
}

// Request/Response interfaces
export interface CreateConversationData {
  participantEmails: string[];
  createdBy: string;
}

export interface CreateMessageData {
  conversationId: string;
  senderId: string;
  content: string;
  messageType?: MessageType;
}

// Collection and subcollection paths
export const COLLECTIONS = {
  USERS: 'users',
  CONVERSATIONS: 'conversations',
  PARTICIPANTS: 'participants', // subcollection of conversations
  MESSAGES: 'messages', // subcollection of conversations  
  MESSAGE_STATUS: 'status' // subcollection of messages
} as const;

// Helper functions for document paths
export const getConversationParticipantPath = (conversationId: string, userEmail: string) => 
  `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.PARTICIPANTS}/${userEmail}`;

export const getMessagePath = (conversationId: string, messageId: string) =>
  `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}/${messageId}`;

export const getMessageStatusPath = (conversationId: string, messageId: string, userEmail: string) =>
  `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}/${messageId}/${COLLECTIONS.MESSAGE_STATUS}/${userEmail}`; 