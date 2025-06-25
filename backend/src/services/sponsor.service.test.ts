import { sponsorService, SponsorError } from './sponsor.service';
import { databaseAdapter } from '../adapters';
import { messageService } from './message.service';
import { conversationService } from './conversation.service';
import { 
  COLLECTIONS,
  FirestoreSponsor,
  FirestoreUser,
  SponsorTargetFilter,
  ConversationType
} from '../types/firestore';

// Mock dependencies
jest.mock('../adapters');
jest.mock('./message.service');
jest.mock('./conversation.service');

const mockDatabaseAdapter = databaseAdapter as jest.Mocked<typeof databaseAdapter>;
const mockMessageService = messageService as jest.Mocked<typeof messageService>;
const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;

describe('SponsorService', () => {
  const adminEmail = 'admin@chatflow.app';
  const sponsorUserEmail = 'sponsor@example.com';
  const targetUserEmail = 'user@example.com';
  const sponsorMessage = 'Welcome to ChatFlow! I am here to help you.';

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up admin email for tests
    process.env['ADMIN_EMAIL'] = adminEmail;
  });

  describe('createSponsor', () => {
    const createSponsorData = {
      sponsorUserEmail,
      message: sponsorMessage,
      targetFilter: SponsorTargetFilter.NEW_USER,
      createdBy: adminEmail
    };

    const mockSponsorUser: FirestoreUser = {
      email: sponsorUserEmail,
      hashedPassword: 'hashed',
      displayName: 'Sponsor User',
      isOnline: false,
      lastSeen: new Date(),
      createdAt: new Date()
    };

    it('should create sponsor with valid data', async () => {
      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockSponsorUser);
      mockDatabaseAdapter.find.mockResolvedValueOnce([]); // No existing sponsors
      
      const mockCreatedSponsor: FirestoreSponsor = {
        id: 'sponsor_123',
        sponsorUserEmail,
        message: sponsorMessage,
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockDatabaseAdapter.create.mockResolvedValueOnce(mockCreatedSponsor);

      const result = await sponsorService.createSponsor(createSponsorData);

      expect(result).toEqual(mockCreatedSponsor);
      expect(mockDatabaseAdapter.findById).toHaveBeenCalledWith(COLLECTIONS.USERS, sponsorUserEmail);
      expect(mockDatabaseAdapter.create).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        expect.stringMatching(/^sponsor_\d+_[a-z0-9]+$/),
        expect.objectContaining({
          sponsorUserEmail,
          message: sponsorMessage,
          targetFilter: SponsorTargetFilter.NEW_USER,
          isActive: true,
          createdBy: adminEmail
        })
      );
    });

    it('should reject invalid sponsor user email', async () => {
      mockDatabaseAdapter.findById.mockResolvedValueOnce(null);

      await expect(sponsorService.createSponsor(createSponsorData))
        .rejects
        .toThrow(SponsorError);

      expect(mockDatabaseAdapter.findById).toHaveBeenCalledWith(COLLECTIONS.USERS, sponsorUserEmail);
    });

    it('should prevent admin users from being sponsors', async () => {
      const adminSponsorData = {
        ...createSponsorData,
        sponsorUserEmail: adminEmail
      };

      mockDatabaseAdapter.findById.mockResolvedValueOnce({
        ...mockSponsorUser,
        email: adminEmail
      });

      await expect(sponsorService.createSponsor(adminSponsorData))
        .rejects
        .toThrow(SponsorError);
    });

    it('should reactivate existing inactive sponsor', async () => {
      const inactiveSponsor: FirestoreSponsor = {
        id: 'sponsor_existing',
        sponsorUserEmail,
        message: 'Old message',
        targetFilter: SponsorTargetFilter.EVERYONE,
        isActive: false,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockSponsorUser);
      mockDatabaseAdapter.find.mockResolvedValueOnce([inactiveSponsor]);
      
      const reactivatedSponsor = {
        ...inactiveSponsor,
        message: sponsorMessage,
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: true,
        updatedAt: new Date()
      };
      
      mockDatabaseAdapter.update.mockResolvedValueOnce(reactivatedSponsor);

      const result = await sponsorService.createSponsor(createSponsorData);

      expect(result).toEqual(reactivatedSponsor);
      expect(mockDatabaseAdapter.update).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        'sponsor_existing',
        expect.objectContaining({
          message: sponsorMessage,
          targetFilter: SponsorTargetFilter.NEW_USER,
          isActive: true
        })
      );
    });

    it('should reject creation if sponsor already active', async () => {
      const activeSponsor: FirestoreSponsor = {
        id: 'sponsor_active',
        sponsorUserEmail,
        message: sponsorMessage,
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockSponsorUser);
      mockDatabaseAdapter.find.mockResolvedValueOnce([activeSponsor]);

      await expect(sponsorService.createSponsor(createSponsorData))
        .rejects
        .toThrow(SponsorError);
    });

    it('should trigger everyone messages when applicable', async () => {
      const everyoneData = {
        ...createSponsorData,
        targetFilter: SponsorTargetFilter.EVERYONE
      };

      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockSponsorUser);
      mockDatabaseAdapter.find.mockResolvedValueOnce([]); // No existing sponsors
      
      const mockCreatedSponsor: FirestoreSponsor = {
        id: 'sponsor_123',
        sponsorUserEmail,
        message: sponsorMessage,
        targetFilter: SponsorTargetFilter.EVERYONE,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      mockDatabaseAdapter.create.mockResolvedValueOnce(mockCreatedSponsor);

      // Mock sendEveryoneMessages dependencies
      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockCreatedSponsor);
      mockDatabaseAdapter.findWithPagination.mockResolvedValueOnce({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
      });

      const result = await sponsorService.createSponsor(everyoneData);

      expect(result).toEqual(mockCreatedSponsor);
      // Note: sendEveryoneMessages is called async, so we can't directly test it
      // but we verify the sponsor was created with correct filter
      expect(result.targetFilter).toBe(SponsorTargetFilter.EVERYONE);
    });

    it('should update message and filter when reactivating', async () => {
      const inactiveSponsor: FirestoreSponsor = {
        id: 'sponsor_existing',
        sponsorUserEmail,
        message: 'Old message',
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: false,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newData = {
        ...createSponsorData,
        message: 'New updated message',
        targetFilter: SponsorTargetFilter.EVERYONE
      };

      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockSponsorUser);
      mockDatabaseAdapter.find.mockResolvedValueOnce([inactiveSponsor]);
      
      const reactivatedSponsor = {
        ...inactiveSponsor,
        message: newData.message,
        targetFilter: newData.targetFilter,
        isActive: true,
        updatedAt: new Date()
      };
      
      mockDatabaseAdapter.update.mockResolvedValueOnce(reactivatedSponsor);

      const result = await sponsorService.createSponsor(newData);

      expect(result.message).toBe('New updated message');
      expect(result.targetFilter).toBe(SponsorTargetFilter.EVERYONE);
      expect(mockDatabaseAdapter.update).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        'sponsor_existing',
        expect.objectContaining({
          message: 'New updated message',
          targetFilter: SponsorTargetFilter.EVERYONE,
          isActive: true
        })
      );
    });
  });

  describe('deactivateSponsor', () => {
    const sponsorId = 'sponsor_123';
    const mockActiveSponsor: FirestoreSponsor = {
      id: sponsorId,
      sponsorUserEmail,
      message: sponsorMessage,
      targetFilter: SponsorTargetFilter.NEW_USER,
      isActive: true,
      createdBy: adminEmail,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should deactivate active sponsor (soft delete)', async () => {
      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockActiveSponsor);

      await sponsorService.deactivateSponsor(sponsorId, adminEmail);

      expect(mockDatabaseAdapter.update).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        sponsorId,
        expect.objectContaining({
          isActive: false
        })
      );
    });

    it('should reject deactivation of non-existent sponsor', async () => {
      mockDatabaseAdapter.findById.mockResolvedValueOnce(null);

      await expect(sponsorService.deactivateSponsor(sponsorId, adminEmail))
        .rejects
        .toThrow(SponsorError);
    });

    it('should reject deactivation of already inactive sponsor', async () => {
      const inactiveSponsor = { ...mockActiveSponsor, isActive: false };
      mockDatabaseAdapter.findById.mockResolvedValueOnce(inactiveSponsor);

      await expect(sponsorService.deactivateSponsor(sponsorId, adminEmail))
        .rejects
        .toThrow(SponsorError);
    });

    it('should preserve sponsor data for audit trail', async () => {
      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockActiveSponsor);

      await sponsorService.deactivateSponsor(sponsorId, adminEmail);

      // Verify that update was called (not delete)
      expect(mockDatabaseAdapter.update).toHaveBeenCalled();
      expect(mockDatabaseAdapter.delete).not.toHaveBeenCalled();
    });
  });

  describe('processSponsorMessages', () => {
    const mockActiveSponsors: FirestoreSponsor[] = [
      {
        id: 'sponsor_1',
        sponsorUserEmail: 'sponsor1@example.com',
        message: 'Welcome from Sponsor 1!',
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'sponsor_2',
        sponsorUserEmail: 'sponsor2@example.com',
        message: 'Welcome from Sponsor 2!',
        targetFilter: SponsorTargetFilter.EVERYONE,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    beforeEach(() => {
      // Mock conversation creation
      mockDatabaseAdapter.find.mockResolvedValue([]); // No existing conversations
      mockConversationService.createConversation.mockResolvedValue({
        id: 'conv_123',
        createdBy: 'sponsor1@example.com',
        type: ConversationType.DIRECT,
        participantEmails: ['sponsor1@example.com', targetUserEmail],
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: []
      });
      
      mockMessageService.createMessage.mockResolvedValue({
        id: 'msg_123',
        conversationId: 'conv_123',
        senderId: 'sponsor1@example.com',
        senderDisplayName: 'Sponsor 1',
        messageType: 'TEXT' as any,
        content: 'Welcome from Sponsor 1!',
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: { email: 'sponsor1@example.com', displayName: 'Sponsor 1' }
      });
    });

    it('should only process active sponsors', async () => {
      // Return empty array when querying for active sponsors
      mockDatabaseAdapter.find.mockResolvedValueOnce([]);

      await sponsorService.processSponsorMessages(targetUserEmail, true);

      expect(mockMessageService.createMessage).not.toHaveBeenCalled();
    });

    it('should send messages to new users from new_user sponsors', async () => {
      const newUserSponsors = mockActiveSponsors.filter(s => 
        s.targetFilter === SponsorTargetFilter.NEW_USER || s.targetFilter === SponsorTargetFilter.EVERYONE
      );
      
      mockDatabaseAdapter.find.mockResolvedValueOnce(newUserSponsors);

      await sponsorService.processSponsorMessages(targetUserEmail, true);

      expect(mockDatabaseAdapter.find).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        expect.objectContaining({
          filters: expect.arrayContaining([
            { field: 'isActive', operator: '==', value: true },
            { 
              field: 'targetFilter', 
              operator: 'in', 
              value: [SponsorTargetFilter.NEW_USER, SponsorTargetFilter.EVERYONE] 
            }
          ])
        })
      );
    });

    it('should send messages to all users from everyone sponsors', async () => {
      const everyoneSponsors = mockActiveSponsors.filter(s => 
        s.targetFilter === SponsorTargetFilter.EVERYONE
      );
      
      mockDatabaseAdapter.find.mockResolvedValueOnce(everyoneSponsors);

      await sponsorService.processSponsorMessages(targetUserEmail, false);

      expect(mockDatabaseAdapter.find).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        expect.objectContaining({
          filters: expect.arrayContaining([
            { field: 'isActive', operator: '==', value: true },
            { field: 'targetFilter', operator: '==', value: SponsorTargetFilter.EVERYONE }
          ])
        })
      );
    });

    it('should reuse existing conversations', async () => {
      const existingConversation = {
        id: 'existing_conv',
        participantEmails: ['sponsor1@example.com', targetUserEmail],
        type: ConversationType.DIRECT
      };
      
      mockDatabaseAdapter.find
        .mockResolvedValueOnce(mockActiveSponsors.slice(0, 1)) // Sponsors query
        .mockResolvedValueOnce([existingConversation]); // Conversation query

      await sponsorService.processSponsorMessages(targetUserEmail, true);

      expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      expect(mockMessageService.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'existing_conv'
        })
      );
    });

    it('should handle sponsor message delivery failures gracefully', async () => {
      mockDatabaseAdapter.find.mockResolvedValueOnce(mockActiveSponsors.slice(0, 1));
      mockMessageService.createMessage.mockRejectedValueOnce(new Error('Message failed'));

      // Should not throw error
      await expect(sponsorService.processSponsorMessages(targetUserEmail, true))
        .resolves
        .toBeUndefined();
    });
  });

  describe('getSponsors', () => {
    const mockSponsors: FirestoreSponsor[] = [
      {
        id: 'sponsor_1',
        sponsorUserEmail: 'sponsor1@example.com',
        message: 'Message 1',
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'sponsor_2',
        sponsorUserEmail: 'sponsor2@example.com',
        message: 'Message 2',
        targetFilter: SponsorTargetFilter.EVERYONE,
        isActive: false,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    it('should list sponsors with pagination (only active by default)', async () => {
      const mockResult = {
        data: [mockSponsors[0]], // Only active sponsor
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false }
      };
      
      mockDatabaseAdapter.findWithPagination.mockResolvedValueOnce(mockResult);

      const result = await sponsorService.getSponsors({ page: 1, limit: 20 });

      expect(result).toEqual(mockResult);
      expect(mockDatabaseAdapter.findWithPagination).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        expect.objectContaining({
          filters: [{ field: 'isActive', operator: '==', value: true }],
          orderBy: [{ field: 'createdAt', direction: 'desc' }]
        })
      );
    });

    it('should include inactive sponsors when explicitly requested', async () => {
      const mockResult = {
        data: mockSponsors, // All sponsors
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false }
      };
      
      mockDatabaseAdapter.findWithPagination.mockResolvedValueOnce(mockResult);

      const result = await sponsorService.getSponsors({ 
        page: 1, 
        limit: 20, 
        includeInactive: true 
      });

      expect(result).toEqual(mockResult);
      expect(mockDatabaseAdapter.findWithPagination).toHaveBeenCalledWith(
        COLLECTIONS.SPONSORS,
        expect.objectContaining({
          filters: [], // No filters when including inactive
          orderBy: [{ field: 'createdAt', direction: 'desc' }]
        })
      );
    });
  });

  describe('validateSponsorUser', () => {
    it('should return true for valid non-admin users', async () => {
      const mockUser = {
        email: sponsorUserEmail,
        hashedPassword: 'hashed',
        displayName: 'Test User',
        isOnline: false,
        lastSeen: new Date(),
        createdAt: new Date()
      };
      
      mockDatabaseAdapter.findById.mockResolvedValueOnce(mockUser);

      const result = await sponsorService.validateSponsorUser(sponsorUserEmail);

      expect(result).toBe(true);
    });

    it('should return false for non-existent users', async () => {
      mockDatabaseAdapter.findById.mockResolvedValueOnce(null);

      const result = await sponsorService.validateSponsorUser(sponsorUserEmail);

      expect(result).toBe(false);
    });

    it('should return false for admin users', async () => {
      const result = await sponsorService.validateSponsorUser(adminEmail);

      expect(result).toBe(false);
    });
  });
}); 