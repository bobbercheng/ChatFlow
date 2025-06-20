import { HttpError } from '../middleware/error';
import { databaseAdapter } from '../adapters';
import { PaginationOptions, PaginationResult } from '../database/adapters/base.adapter';
import { conversationService } from './conversation.service';
import { notificationService } from './notification.service';
import { 
  COLLECTIONS, 
  FirestoreMessage, 
  FirestoreUser,
  MessageType,
  MessageWithSender,
  CreateMessageData
} from '../types/firestore';

export class MessageServiceFirestore {
  async createMessage(data: CreateMessageData): Promise<MessageWithSender> {
    const { conversationId, senderId, content, messageType = MessageType.TEXT } = data;

    // Validate conversation exists and user has access
    await conversationService.getConversationById(conversationId, senderId);

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new HttpError(400, 'Message content cannot be empty', 'EMPTY_CONTENT');
    }

    if (content.length > 10000) {
      throw new HttpError(400, 'Message content too long (max 10000 characters)', 'CONTENT_TOO_LONG');
    }

    // Get sender info for denormalization
    const sender = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, senderId);
    if (!sender) {
      throw new HttpError(404, 'Sender not found', 'SENDER_NOT_FOUND');
    }

    // Create message and update conversation timestamp using transaction
    return await databaseAdapter.runTransaction(async (transaction) => {
      // Generate message ID
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create message in subcollection
      const messageData: FirestoreMessage = {
        id: messageId,
        conversationId,
        senderId,
        senderDisplayName: sender.displayName,
        messageType,
        content: content.trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Note: In actual Firestore, this would use createInSubcollection
      transaction.create<FirestoreMessage>(
        `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
        messageId,
        messageData
      );

      // Update conversation's updatedAt timestamp
      transaction.update(COLLECTIONS.CONVERSATIONS, conversationId, {
        updatedAt: new Date(),
      });

      // Create response with sender info
      const messageWithSender = {
        ...messageData,
        sender: {
          email: sender.email,
          displayName: sender.displayName,
        },
      };

      // Notify recipients after transaction commit (fire-and-forget)
      notificationService.handleNewMessage(messageData, conversationId).catch(console.error);

      return messageWithSender;
    });
  }

  async getMessages(
    conversationId: string,
    userEmail: string,
    options: PaginationOptions
  ): Promise<PaginationResult<MessageWithSender>> {
    // Validate user has access to conversation
    await conversationService.getConversationById(conversationId, userEmail);

    // Get messages from subcollection
    const messages = await databaseAdapter.findWithPagination<FirestoreMessage>(
      `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
      {
        ...options,
        orderBy: [{ field: 'createdAt', direction: 'desc' }]
      }
    );

    // Transform messages to include sender info (using denormalized data)
    const messagesWithSender = messages.data.map((message) => {
      return {
        ...message,
        conversationId, // Ensure conversationId is included
        sender: {
          email: message.senderId,
          displayName: message.senderDisplayName,
        },
      };
    });

    return {
      ...messages,
      data: messagesWithSender,
    };
  }

  async getMessageById(_messageId: string, _userEmail: string): Promise<MessageWithSender> {
    // First, we need to find which conversation this message belongs to
    // In a real Firestore implementation, we'd need to restructure this query
    // For now, we'll throw an error indicating this needs conversation context
    throw new HttpError(400, 'Message lookup requires conversation context in Firestore implementation', 'REQUIRES_CONVERSATION_CONTEXT');
  }

  async deleteMessage(messageId: string, userEmail: string, conversationId: string): Promise<void> {
    // Get the message first
    const message = await databaseAdapter.findById<FirestoreMessage>(
      `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
      messageId
    );

    if (!message) {
      throw new HttpError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    }

    // Only allow sender to delete their own messages
    if (message.senderId !== userEmail) {
      throw new HttpError(403, 'You can only delete your own messages', 'ACCESS_DENIED');
    }

    // Validate user has access to the conversation
    await conversationService.getConversationById(conversationId, userEmail);

    // Delete message
    await databaseAdapter.delete(
      `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
      messageId
    );
  }

  async updateMessage(
    messageId: string,
    userEmail: string,
    conversationId: string,
    content: string
  ): Promise<MessageWithSender> {
    // Get the message first
    const message = await databaseAdapter.findById<FirestoreMessage>(
      `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
      messageId
    );

    if (!message) {
      throw new HttpError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    }

    // Only allow sender to edit their own messages
    if (message.senderId !== userEmail) {
      throw new HttpError(403, 'You can only edit your own messages', 'ACCESS_DENIED');
    }

    // Validate user has access to the conversation
    await conversationService.getConversationById(conversationId, userEmail);

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new HttpError(400, 'Message content cannot be empty', 'EMPTY_CONTENT');
    }

    if (content.length > 10000) {
      throw new HttpError(400, 'Message content too long (max 10000 characters)', 'CONTENT_TOO_LONG');
    }

    // Update message
    const updatedMessage = await databaseAdapter.update<FirestoreMessage>(
      `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.MESSAGES}`,
      messageId,
      {
        content: content.trim(),
        updatedAt: new Date(),
      }
    );

    // Return updated message with sender info (using denormalized data)
    return {
      ...updatedMessage,
      conversationId, // Ensure conversationId is included
      sender: {
        email: updatedMessage.senderId,
        displayName: updatedMessage.senderDisplayName,
      },
    };
  }

  // Helper method for message status operations (simplified for this migration)
  async markMessageAsRead(conversationId: string, messageId: string, userEmail: string): Promise<void> {
    // Delegate to notification service which handles both status update and event broadcasting
    await notificationService.markAsRead(messageId, conversationId, userEmail);
  }
}

export const messageService = new MessageServiceFirestore(); 