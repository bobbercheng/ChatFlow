import { PrismaClient, Message, MessageType } from '@prisma/client';
import { HttpError } from '../middleware/error';
import { conversationService } from './conversation.service';
import { notificationService } from './notification.service';

const prisma = new PrismaClient();

export interface CreateMessageData {
  conversationId: string;
  senderId: string;
  content: string;
  messageType?: MessageType;
}

export interface MessageWithSender extends Message {
  sender: {
    email: string;
    displayName: string;
  };
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class MessageService {
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

    // Create message in transaction to update conversation timestamp
    const message = await prisma.$transaction(async (tx) => {
      // Create the message
      const newMessage = await tx.message.create({
        data: {
          conversationId,
          senderId,
          content: content.trim(),
          messageType,
        },
        include: {
          sender: {
            select: {
              email: true,
              displayName: true,
            },
          },
        },
      });

      // Update conversation's updatedAt timestamp
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return newMessage;
    });

    // Notify recipients after transaction commit (fire-and-forget)
    notificationService.handleNewMessage(message).catch(console.error);

    return message;
  }

  async getMessages(
    conversationId: string,
    userEmail: string,
    options: PaginationOptions
  ): Promise<PaginationResult<MessageWithSender>> {
    const { page, limit } = options;

    // Validate user has access to conversation
    await conversationService.getConversationById(conversationId, userEmail);

    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.message.count({
      where: {
        conversationId,
      },
    });

    // Get messages with sender info, ordered by creation time (newest first)
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
      },
      include: {
        sender: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: messages,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getMessageById(messageId: string, userEmail: string): Promise<MessageWithSender> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
    });

    if (!message) {
      throw new HttpError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    }

    // Validate user has access to the conversation
    await conversationService.getConversationById(message.conversationId, userEmail);

    // If the requester is not the sender, mark as read
    if (message.senderId !== userEmail) {
      notificationService.markAsRead(messageId, userEmail).catch(() => {/* ignore */});
    }

    return message;
  }

  async deleteMessage(messageId: string, userEmail: string): Promise<void> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new HttpError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    }

    // Only allow sender to delete their own messages
    if (message.senderId !== userEmail) {
      throw new HttpError(403, 'You can only delete your own messages', 'ACCESS_DENIED');
    }

    // Validate user has access to the conversation
    await conversationService.getConversationById(message.conversationId, userEmail);

    await prisma.message.delete({
      where: { id: messageId },
    });
  }

  async updateMessage(
    messageId: string,
    userEmail: string,
    content: string
  ): Promise<MessageWithSender> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new HttpError(404, 'Message not found', 'MESSAGE_NOT_FOUND');
    }

    // Only allow sender to edit their own messages
    if (message.senderId !== userEmail) {
      throw new HttpError(403, 'You can only edit your own messages', 'ACCESS_DENIED');
    }

    // Validate user has access to the conversation
    await conversationService.getConversationById(message.conversationId, userEmail);

    // Validate content
    if (!content || content.trim().length === 0) {
      throw new HttpError(400, 'Message content cannot be empty', 'EMPTY_CONTENT');
    }

    if (content.length > 10000) {
      throw new HttpError(400, 'Message content too long (max 10000 characters)', 'CONTENT_TOO_LONG');
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        updatedAt: new Date(),
      },
      include: {
        sender: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
    });

    return updatedMessage;
  }
}

export const messageService = new MessageService(); 