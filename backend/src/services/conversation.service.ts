import { PrismaClient, Conversation, ConversationType, ConversationParticipantRole } from '@prisma/client';
import { HttpError } from '../middleware/error';

const prisma = new PrismaClient();

export interface CreateConversationData {
  participantEmails: string[];
  createdBy: string;
}

export interface ConversationWithParticipants extends Conversation {
  participants: Array<{
    userId: string;
    joinedAt: Date;
    role: ConversationParticipantRole;
  }>;
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

export class ConversationService {
  async createConversation(data: CreateConversationData): Promise<ConversationWithParticipants> {
    const { participantEmails, createdBy } = data;

    // Validate that creator is included in participants
    if (!participantEmails.includes(createdBy)) {
      participantEmails.push(createdBy);
    }

    // Remove duplicates
    const uniqueParticipants = [...new Set(participantEmails)];

    // Validate all participants exist
    const existingUsers = await prisma.user.findMany({
      where: {
        email: {
          in: uniqueParticipants,
        },
      },
      select: { email: true },
    });

    const existingEmails = existingUsers.map(user => user.email);
    const nonExistentUsers = uniqueParticipants.filter(email => !existingEmails.includes(email));

    if (nonExistentUsers.length > 0) {
      throw new HttpError(400, `Users not found: ${nonExistentUsers.join(', ')}`, 'USERS_NOT_FOUND');
    }

    // Determine conversation type
    const type: ConversationType = uniqueParticipants.length === 2 ? ConversationType.DIRECT : ConversationType.GROUP;

    // For direct conversations, check if one already exists between these two users
    if (type === ConversationType.DIRECT) {
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          participants: {
            every: {
              userId: {
                in: uniqueParticipants,
              },
            },
          },
        },
        include: {
          participants: true,
        },
      });

      if (existingConversation && existingConversation.participants.length === 2) {
        // Return existing direct conversation
        return {
          ...existingConversation,
          participants: (existingConversation.participants || []).map(p => ({
            userId: p.userId,
            joinedAt: p.joinedAt,
            role: p.role,
          })),
        };
      }
    }

    // Create new conversation with participants in a transaction
    const conversation = await prisma.$transaction(async (tx) => {
      const newConversation = await tx.conversation.create({
        data: {
          createdBy,
          type,
        },
      });

      // Add participants
      await tx.conversationParticipant.createMany({
        data: uniqueParticipants.map(email => ({
          conversationId: newConversation.id,
          userId: email,
          role: email === createdBy ? ConversationParticipantRole.ADMIN : ConversationParticipantRole.MEMBER,
        })),
      });

      // Fetch the complete conversation with participants
      const completeConversation = await tx.conversation.findUnique({
        where: { id: newConversation.id },
        include: {
          participants: true,
        },
      });

      return completeConversation!;
    });

    return {
      ...conversation,
      participants: (conversation.participants || []).map(p => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        role: p.role,
      })),
    };
  }

  async getUserConversations(
    userEmail: string,
    options: PaginationOptions
  ): Promise<PaginationResult<ConversationWithParticipants>> {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.conversation.count({
      where: {
        participants: {
          some: {
            userId: userEmail,
          },
        },
      },
    });

    // Get conversations with participants
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: userEmail,
          },
        },
      },
      include: {
        participants: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: conversations.map(conv => ({
        ...conv,
        participants: (conv.participants || []).map(p => ({
          userId: p.userId,
          joinedAt: p.joinedAt,
          role: p.role,
        })),
      })),
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

  async getConversationById(conversationId: string, userEmail: string): Promise<ConversationWithParticipants> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true,
      },
    });

    if (!conversation) {
      throw new HttpError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    // Check if user is a participant
    const isParticipant = (conversation.participants || []).some(p => p.userId === userEmail);
    if (!isParticipant) {
      throw new HttpError(403, 'Access denied', 'ACCESS_DENIED');
    }

    return {
      ...conversation,
      participants: (conversation.participants || []).map(p => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        role: p.role,
      })),
    };
  }

  async validateUserAccess(conversationId: string, userEmail: string): Promise<boolean> {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: userEmail,
        },
      },
    });

    return !!participant;
  }
}

export const conversationService = new ConversationService(); 