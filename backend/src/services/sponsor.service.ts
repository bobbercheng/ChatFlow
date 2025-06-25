import { HttpError } from '../middleware/error';
import { databaseAdapter } from '../adapters';
import { PaginationOptions, PaginationResult, QueryFilter } from '../database/adapters/base.adapter';
import { conversationService } from './conversation.service';
import { messageService } from './message.service';
import { AUTHORIZATION } from '../config/constants';
import { 
  COLLECTIONS, 
  FirestoreSponsor,
  FirestoreUser,
  CreateSponsorData,
  SponsorTargetFilter,
  MessageType,
  ConversationType
} from '../types/firestore';

export class SponsorError extends HttpError {
  constructor(statusCode: number, message: string, code: string, details?: any) {
    super(statusCode, message, code);
    this.details = details;
  }
}

const SPONSOR_ERRORS = {
  SPONSOR_NOT_FOUND: 'SPONSOR_NOT_FOUND',
  SPONSOR_USER_NOT_FOUND: 'SPONSOR_USER_NOT_FOUND',
  SPONSOR_ALREADY_ACTIVE: 'SPONSOR_ALREADY_ACTIVE',
  SPONSOR_ALREADY_INACTIVE: 'SPONSOR_ALREADY_INACTIVE',
  MESSAGE_DELIVERY_FAILED: 'MESSAGE_DELIVERY_FAILED',
  INVALID_TARGET_FILTER: 'INVALID_TARGET_FILTER',
  ADMIN_CANNOT_BE_SPONSOR: 'ADMIN_CANNOT_BE_SPONSOR'
} as const;

export class SponsorServiceFirestore {
  async createSponsor(data: CreateSponsorData): Promise<FirestoreSponsor> {
    const { sponsorUserEmail, message, targetFilter, createdBy } = data;

    // Validate sponsor user exists
    const sponsorUser = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, sponsorUserEmail);
    if (!sponsorUser) {
      throw new SponsorError(404, 'Sponsor user not found', SPONSOR_ERRORS.SPONSOR_USER_NOT_FOUND);
    }

    // Prevent admin users from being sponsors
    if (sponsorUserEmail === AUTHORIZATION.ADMIN_EMAIL) {
      throw new SponsorError(400, 'Admin users cannot be sponsors', SPONSOR_ERRORS.ADMIN_CANNOT_BE_SPONSOR);
    }

    // Check for existing sponsor (active or inactive)
    const existingSponsor = await this.findExistingSponsor(sponsorUserEmail);

    if (existingSponsor) {
      if (existingSponsor.isActive) {
        throw new SponsorError(409, 'Sponsor already exists and is active', SPONSOR_ERRORS.SPONSOR_ALREADY_ACTIVE);
      }

      // Reactivate existing inactive sponsor with new settings
      const reactivatedSponsor = await this.reactivateSponsor(existingSponsor.id, data);
      
      // If targetFilter is 'everyone', trigger message delivery to all users
      if (targetFilter === SponsorTargetFilter.EVERYONE) {
        // Fire and forget - don't wait for completion
        this.sendEveryoneMessages(reactivatedSponsor.id).catch(error => {
          console.error('Failed to send everyone messages for reactivated sponsor:', error);
        });
      }

      // Log reactivation
      console.log('Sponsor reactivated', {
        sponsorId: reactivatedSponsor.id,
        sponsorUserEmail,
        newTargetFilter: targetFilter,
        newMessage: message,
        reactivatedBy: createdBy,
        timestamp: new Date().toISOString()
      });

      return reactivatedSponsor;
    }

    // Create new sponsor
    const sponsorId = `sponsor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const sponsorData: FirestoreSponsor = {
      id: sponsorId,
      sponsorUserEmail,
      message,
      targetFilter,
      isActive: true,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newSponsor = await databaseAdapter.create<FirestoreSponsor>(COLLECTIONS.SPONSORS, sponsorId, sponsorData);

    // If targetFilter is 'everyone', trigger message delivery to all users
    if (targetFilter === SponsorTargetFilter.EVERYONE) {
      // Fire and forget - don't wait for completion
      this.sendEveryoneMessages(sponsorId).catch(error => {
        console.error('Failed to send everyone messages for new sponsor:', error);
      });
    }

    // Log creation
    console.log('Sponsor created', {
      sponsorId,
      sponsorUserEmail,
      targetFilter,
      createdBy,
      isReactivation: false,
      timestamp: new Date().toISOString()
    });

    return newSponsor;
  }

  async deactivateSponsor(sponsorId: string, adminEmail: string): Promise<void> {
    const sponsor = await databaseAdapter.findById<FirestoreSponsor>(COLLECTIONS.SPONSORS, sponsorId);

    if (!sponsor) {
      throw new SponsorError(404, 'Sponsor not found', SPONSOR_ERRORS.SPONSOR_NOT_FOUND);
    }

    if (!sponsor.isActive) {
      throw new SponsorError(409, 'Sponsor is already inactive', SPONSOR_ERRORS.SPONSOR_ALREADY_INACTIVE);
    }

    // Soft delete by setting isActive to false
    await databaseAdapter.update<FirestoreSponsor>(COLLECTIONS.SPONSORS, sponsorId, {
      isActive: false,
      updatedAt: new Date(),
    });

    // Log deactivation
    console.log('Sponsor deactivated', {
      sponsorId,
      sponsorUserEmail: sponsor.sponsorUserEmail,
      deactivatedBy: adminEmail,
      timestamp: new Date().toISOString()
    });
  }

  async getSponsors(options: PaginationOptions & { includeInactive?: boolean }): Promise<PaginationResult<FirestoreSponsor>> {
    const { includeInactive = false, ...paginationOptions } = options;

    const filters: QueryFilter[] = includeInactive ? [] : [{ field: 'isActive', operator: '==', value: true }];

    return await databaseAdapter.findWithPagination<FirestoreSponsor>(
      COLLECTIONS.SPONSORS,
      {
        ...paginationOptions,
        filters,
        orderBy: [{ field: 'createdAt', direction: 'desc' }]
      }
    );
  }

  async getSponsorById(sponsorId: string): Promise<FirestoreSponsor | null> {
    return await databaseAdapter.findById<FirestoreSponsor>(COLLECTIONS.SPONSORS, sponsorId);
  }

  async processSponsorMessages(userEmail: string, isNewUser: boolean): Promise<void> {
    try {
      // Get active sponsors that match the user type
      const filters: QueryFilter[] = [
        { field: 'isActive', operator: '==', value: true }
      ];
      
      if (isNewUser) {
        // New users get messages from both NEW_USER and EVERYONE sponsors
        filters.push({ 
          field: 'targetFilter', 
          operator: 'in', 
          value: [SponsorTargetFilter.NEW_USER, SponsorTargetFilter.EVERYONE] 
        });
      } else {
        // Existing users only get messages from EVERYONE sponsors (shouldn't normally happen)
        filters.push({ 
          field: 'targetFilter', 
          operator: '==', 
          value: SponsorTargetFilter.EVERYONE 
        });
      }

      const sponsors = await databaseAdapter.find<FirestoreSponsor>(COLLECTIONS.SPONSORS, { filters });

      // Process each sponsor
      for (const sponsor of sponsors) {
        try {
          await this.sendSponsorMessageToUser(sponsor, userEmail);
        } catch (error) {
          // Log error but don't fail the entire process
          console.error('Failed to send sponsor message', {
            sponsorId: sponsor.id,
            targetUserEmail: userEmail,
            error: error instanceof Error ? error.message : error,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      // Log error but don't fail user registration
      console.error('Failed to process sponsor messages for new user:', error);
    }
  }

  async sendEveryoneMessages(sponsorId: string): Promise<void> {
    const sponsor = await this.getSponsorById(sponsorId);
    if (!sponsor || !sponsor.isActive) {
      throw new SponsorError(404, 'Active sponsor not found', SPONSOR_ERRORS.SPONSOR_NOT_FOUND);
    }

    // Process users in batches to prevent memory issues
    const BATCH_SIZE = 100;
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const users = await databaseAdapter.findWithPagination<FirestoreUser>(
          COLLECTIONS.USERS,
          { page: currentPage, limit: BATCH_SIZE }
        );

        // Process batch in parallel with error handling
        const results = await Promise.allSettled(
          users.data.map(user => this.sendSponsorMessageToUser(sponsor, user.email))
        );

        // Log any failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error('Failed to send sponsor message in batch', {
              sponsorId,
              targetUserEmail: users.data[index]?.email,
              error: result.reason,
              timestamp: new Date().toISOString()
            });
          }
        });

        currentPage++;
        hasMore = users.pagination.hasNext;
      } catch (error) {
        console.error('Failed to process user batch for sponsor messages:', error);
        break; // Stop processing on critical error
      }
    }
  }

  async validateSponsorUser(email: string): Promise<boolean> {
    const user = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email);
    return !!user && email !== AUTHORIZATION.ADMIN_EMAIL;
  }

  private async findExistingSponsor(sponsorUserEmail: string): Promise<FirestoreSponsor | null> {
    const sponsors = await databaseAdapter.find<FirestoreSponsor>(COLLECTIONS.SPONSORS, {
      filters: [{ field: 'sponsorUserEmail', operator: '==', value: sponsorUserEmail }]
    });

    return sponsors.length > 0 && sponsors[0] ? sponsors[0] : null;
  }

  private async reactivateSponsor(sponsorId: string, data: CreateSponsorData): Promise<FirestoreSponsor> {
    const updatedSponsor = await databaseAdapter.update<FirestoreSponsor>(COLLECTIONS.SPONSORS, sponsorId, {
      message: data.message,
      targetFilter: data.targetFilter,
      isActive: true,
      updatedAt: new Date(),
    });

    if (!updatedSponsor) {
      throw new SponsorError(500, 'Failed to reactivate sponsor', SPONSOR_ERRORS.SPONSOR_NOT_FOUND);
    }

    return updatedSponsor;
  }

  private async sendSponsorMessageToUser(sponsor: FirestoreSponsor, targetUserEmail: string): Promise<void> {
    // Skip sending to the sponsor user themselves
    if (sponsor.sponsorUserEmail === targetUserEmail) {
      return;
    }

    // Skip sending to admin
    if (targetUserEmail === AUTHORIZATION.ADMIN_EMAIL) {
      return;
    }

    try {
      // Check if direct conversation already exists between sponsor and target user
      const conversationId = await this.getOrCreateSponsorConversation(sponsor.sponsorUserEmail, targetUserEmail);
      
      // Send sponsor message
      await messageService.createMessage({
        conversationId,
        senderId: sponsor.sponsorUserEmail,
        content: sponsor.message,
        messageType: MessageType.TEXT
      });
    } catch (error) {
      throw new SponsorError(
        500, 
        'Failed to send sponsor message', 
        SPONSOR_ERRORS.MESSAGE_DELIVERY_FAILED, 
        { sponsorId: sponsor.id, targetUserEmail, originalError: error }
      );
    }
  }

  private async getOrCreateSponsorConversation(sponsorEmail: string, targetEmail: string): Promise<string> {
    // Check if direct conversation already exists
    const existingConversations = await databaseAdapter.find<any>(
      COLLECTIONS.CONVERSATIONS,
      {
        filters: [
          { field: 'type', operator: '==', value: ConversationType.DIRECT },
          { field: 'participantEmails', operator: 'array-contains', value: sponsorEmail }
        ]
      }
    );

    // Find conversation that includes both users
    const existingConversation = existingConversations.find(conv => 
      conv.participantEmails.length === 2 && 
      conv.participantEmails.includes(targetEmail)
    );

    if (existingConversation) {
      return existingConversation.id;
    }

    // Create new conversation
    const conversation = await conversationService.createConversation({
      participantEmails: [sponsorEmail, targetEmail],
      createdBy: sponsorEmail
    });

    return conversation.id;
  }
}

export const sponsorService = new SponsorServiceFirestore(); 