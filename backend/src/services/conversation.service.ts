import { HttpError } from '../middleware/error';
import { databaseAdapter } from '../adapters';
import { PaginationOptions, PaginationResult } from '../database/adapters/base.adapter';
import { AUTHORIZATION } from '../config/constants';
import { 
  COLLECTIONS, 
  FirestoreConversation, 
  FirestoreConversationParticipant,
  FirestoreUser,
  ConversationType, 
  ConversationParticipantRole,
  ConversationWithParticipants,
  CreateConversationData
} from '../types/firestore';

export interface UpdateConversationData {
  participantEmails?: string[];
}

export class ConversationServiceFirestore {
  async createConversation(data: CreateConversationData): Promise<ConversationWithParticipants> {
    const { participantEmails, createdBy } = data;

    // Validate that creator is included in participants
    if (!participantEmails.includes(createdBy)) {
      participantEmails.push(createdBy);
    }

    // Remove duplicates
    const uniqueParticipants = [...new Set(participantEmails)];

    // Validate all participants exist
    const existingUsers = await Promise.all(
      uniqueParticipants.map(email => 
        databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email)
      )
    );

    const nonExistentUsers = uniqueParticipants.filter((_email, index) => !existingUsers[index]);

    if (nonExistentUsers.length > 0) {
      throw new HttpError(400, `Users not found: ${nonExistentUsers.join(', ')}`, 'USERS_NOT_FOUND');
    }

    // Determine conversation type
    const type: ConversationType = uniqueParticipants.length === 2 ? ConversationType.DIRECT : ConversationType.GROUP;

    // For direct conversations, check if one already exists between these two users
    if (type === ConversationType.DIRECT) {
      const existingConversations = await databaseAdapter.find<FirestoreConversation>(
        COLLECTIONS.CONVERSATIONS,
        {
          filters: [
            { field: 'type', operator: '==', value: ConversationType.DIRECT },
            { field: 'participantEmails', operator: 'array-contains', value: uniqueParticipants[0] }
          ]
        }
      );

      // Check if any existing conversation has exactly the same participants
      for (const conversation of existingConversations) {
        if (conversation.participantEmails.length === 2 && 
            uniqueParticipants[1] && conversation.participantEmails.includes(uniqueParticipants[1])) {
          
          // Get participants for the existing conversation
          const participants = await databaseAdapter.findInSubcollection<FirestoreConversationParticipant>(
            COLLECTIONS.CONVERSATIONS,
            conversation.id,
            COLLECTIONS.PARTICIPANTS
          );

          return {
            ...conversation,
            participants: participants.map(p => ({
              userId: p.userId,
              joinedAt: p.joinedAt,
              role: p.role,
            })),
          };
        }
      }
    }

    // Create new conversation using transaction
    return await databaseAdapter.runTransaction(async (transaction) => {
      // Create conversation document
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const conversationData: FirestoreConversation = {
        id: conversationId,
        createdBy,
        type,
        participantEmails: uniqueParticipants,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      transaction.create<FirestoreConversation>(COLLECTIONS.CONVERSATIONS, conversationId, conversationData);

      // Create participant documents
      for (const email of uniqueParticipants) {
        const participantData: FirestoreConversationParticipant = {
          userId: email,
          joinedAt: new Date(),
          role: email === createdBy ? ConversationParticipantRole.ADMIN : ConversationParticipantRole.MEMBER,
        };

        // Note: In actual Firestore implementation, this would use subcollection creation
        // For mock, we'll store in a nested collection path
        transaction.create<FirestoreConversationParticipant>(
          `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.PARTICIPANTS}`,
          email,
          participantData
        );
      }

      // Return the created conversation with participants
      const participants = uniqueParticipants.map(email => ({
        userId: email,
        joinedAt: new Date(),
        role: email === createdBy ? ConversationParticipantRole.ADMIN : ConversationParticipantRole.MEMBER,
      }));

      return {
        ...conversationData,
        id: conversationId,
        participants,
      };
    });
  }

  async getUserConversations(
    userEmail: string,
    options: PaginationOptions
  ): Promise<PaginationResult<ConversationWithParticipants>> {
    // Find conversations where user is a participant
    const conversations = await databaseAdapter.findWithPagination<FirestoreConversation>(
      COLLECTIONS.CONVERSATIONS,
      {
        ...options,
        filters: [
          { field: 'participantEmails', operator: 'array-contains', value: userEmail }
        ],
        orderBy: [{ field: 'updatedAt', direction: 'desc' }]
      }
    );

    // Get participants for each conversation
    const conversationsWithParticipants = await Promise.all(
      conversations.data.map(async (conversation) => {
        const participants = await databaseAdapter.findInSubcollection<FirestoreConversationParticipant>(
          COLLECTIONS.CONVERSATIONS,
          conversation.id,
          COLLECTIONS.PARTICIPANTS
        );

        return {
          ...conversation,
          participants: participants.map(p => ({
            userId: p.userId,
            joinedAt: p.joinedAt,
            role: p.role,
          })),
        };
      })
    );

    return {
      ...conversations,
      data: conversationsWithParticipants,
    };
  }

  async getConversationById(conversationId: string, userEmail: string): Promise<ConversationWithParticipants> {
    const conversation = await databaseAdapter.findById<FirestoreConversation>(
      COLLECTIONS.CONVERSATIONS, 
      conversationId
    );

    if (!conversation) {
      throw new HttpError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    // Check if user is a participant
    if (!conversation.participantEmails.includes(userEmail)) {
      throw new HttpError(403, 'Access denied', 'ACCESS_DENIED');
    }

    // Get participants
    const participants = await databaseAdapter.findInSubcollection<FirestoreConversationParticipant>(
      COLLECTIONS.CONVERSATIONS,
      conversationId,
      COLLECTIONS.PARTICIPANTS
    );

    return {
      ...conversation,
      participants: participants.map(p => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        role: p.role,
      })),
    };
  }

  async validateUserAccess(conversationId: string, userEmail: string): Promise<boolean> {
    const conversation = await databaseAdapter.findById<FirestoreConversation>(
      COLLECTIONS.CONVERSATIONS,
      conversationId
    );

    if (!conversation) {
      return false;
    }

    return conversation.participantEmails.includes(userEmail);
  }

  async updateConversation(
    conversationId: string, 
    userEmail: string, 
    data: UpdateConversationData
  ): Promise<ConversationWithParticipants> {
    const conversation = await databaseAdapter.findById<FirestoreConversation>(
      COLLECTIONS.CONVERSATIONS,
      conversationId
    );

    if (!conversation) {
      throw new HttpError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    // Only the creator can modify the conversation
    if (conversation.createdBy !== userEmail) {
      throw new HttpError(403, 'Only the conversation creator can modify this conversation', 'ACCESS_DENIED');
    }

    // If updating participants, validate all participants exist
    if (data.participantEmails) {
      // Ensure creator is always included
      if (!data.participantEmails.includes(conversation.createdBy)) {
        data.participantEmails.push(conversation.createdBy);
      }

      // Remove duplicates
      const uniqueParticipants = [...new Set(data.participantEmails)];

      // Validate all participants exist
      const existingUsers = await Promise.all(
        uniqueParticipants.map(email => 
          databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email)
        )
      );

      const nonExistentUsers = uniqueParticipants.filter((_email, index) => !existingUsers[index]);

      if (nonExistentUsers.length > 0) {
        throw new HttpError(400, `Users not found: ${nonExistentUsers.join(', ')}`, 'USERS_NOT_FOUND');
      }

      // Update conversation and participants in transaction
      return await databaseAdapter.runTransaction(async (transaction) => {
        // Update conversation
        const updatedConversation: Partial<FirestoreConversation> = {
          participantEmails: uniqueParticipants,
          updatedAt: new Date(),
        };

        transaction.update<FirestoreConversation>(COLLECTIONS.CONVERSATIONS, conversationId, updatedConversation);

        // Remove old participants
        const oldParticipants = await databaseAdapter.findInSubcollection<FirestoreConversationParticipant>(
          COLLECTIONS.CONVERSATIONS,
          conversationId,
          COLLECTIONS.PARTICIPANTS
        );

        for (const participant of oldParticipants) {
          transaction.delete(`${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.PARTICIPANTS}`, participant.userId);
        }

        // Add new participants
        for (const email of uniqueParticipants) {
          const participantData: FirestoreConversationParticipant = {
            userId: email,
            joinedAt: new Date(),
            role: email === conversation.createdBy ? ConversationParticipantRole.ADMIN : ConversationParticipantRole.MEMBER,
          };

          transaction.create<FirestoreConversationParticipant>(
            `${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.PARTICIPANTS}`,
            email,
            participantData
          );
        }

        // Return updated conversation with participants
        const participants = uniqueParticipants.map(email => ({
          userId: email,
          joinedAt: new Date(),
          role: email === conversation.createdBy ? ConversationParticipantRole.ADMIN : ConversationParticipantRole.MEMBER,
        }));

        return {
          ...conversation,
          ...updatedConversation,
          participants,
        };
      });
    }

    // If no participants update, just update the conversation
    const updatedData: Partial<FirestoreConversation> = {
      updatedAt: new Date(),
    };

    await databaseAdapter.update<FirestoreConversation>(COLLECTIONS.CONVERSATIONS, conversationId, updatedData);

    // Get updated conversation with participants
    return this.getConversationById(conversationId, userEmail);
  }

  async deleteConversation(conversationId: string, userEmail: string): Promise<void> {
    const conversation = await databaseAdapter.findById<FirestoreConversation>(
      COLLECTIONS.CONVERSATIONS,
      conversationId
    );

    if (!conversation) {
      throw new HttpError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    // Only admin can delete conversations
    if (userEmail !== AUTHORIZATION.ADMIN_EMAIL) {
      throw new HttpError(403, 'Only administrators can delete conversations', 'ACCESS_DENIED');
    }

    // Delete conversation and all related data in transaction
    await databaseAdapter.runTransaction(async (transaction) => {
      // Delete all participants
      const participants = await databaseAdapter.findInSubcollection<FirestoreConversationParticipant>(
        COLLECTIONS.CONVERSATIONS,
        conversationId,
        COLLECTIONS.PARTICIPANTS
      );

      for (const participant of participants) {
        transaction.delete(`${COLLECTIONS.CONVERSATIONS}/${conversationId}/${COLLECTIONS.PARTICIPANTS}`, participant.userId);
      }

      // Delete the conversation
      transaction.delete(COLLECTIONS.CONVERSATIONS, conversationId);
    });
  }
}

export const conversationService = new ConversationServiceFirestore(); 