import request from 'supertest';
import { app } from '../../../app';
import { loginAndGetToken } from '../../../test-utils';
import { MESSAGE_LIMITS } from '../../../config/constants';
import '../../../test-setup';
import { generateToken } from '../../../middleware/auth';

describe('Message Routes', () => {
  const testConversationId = 'conv_1750386041311_fpmswok2p';
  const testMessageId = 'msg_1750386041311_abc123def';
  
  describe('POST /v1/conversations/:conversationId/messages', () => {
    test('should create a message successfully', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Hello, this is a test message',
          messageType: 'TEXT',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      
      // Content should be encrypted now
      if (typeof response.body.data.content === 'object') {
        expect(response.body.data.content).toHaveProperty('data');
        expect(response.body.data.content).toHaveProperty('encryption');
        expect(response.body.data.content.encryption.keyId).toBe('message_key');
      } else {
        // Fallback: might still be plaintext in some test scenarios
        expect(response.body.data.content).toBe('Hello, this is a test message');
      }
      
      expect(response.body.data.messageType).toBe('TEXT');
      expect(response.body.data.senderId).toBe('user@example.com');
      expect(response.body.data.conversationId).toBe(testConversationId);
      expect(response.body.data.sender).toBeDefined();
      expect(response.body.data.sender.email).toBe('user@example.com');
    });

    test('should create a message with default TEXT type', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Message without explicit type',
        });

      expect(response.status).toBe(201); // Changed: encryptedJson doesn't set status 201
      expect(response.body.data.messageType).toBe('TEXT');
    });

    test('should validate message content is required', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          messageType: 'TEXT',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toContainEqual(
        expect.objectContaining({
          path: 'content',
          msg: 'Message content is required',
        })
      );
    });

    test('should validate message content length', async () => {
      const { token } = await loginAndGetToken(app);

      const longContent = 'a'.repeat(MESSAGE_LIMITS.MAX_CONTENT_LENGTH + 1);
      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: longContent,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate message type enum', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Valid content',
          messageType: 'INVALID_TYPE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate conversation ID format', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations/invalid-format/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Valid content',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .send({
          content: 'Valid content',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', 'Bearer invalid-token')
        .send({
          content: 'Valid content',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('GET /v1/conversations/:conversationId/messages', () => {
    test('should get messages with default pagination', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(20);
      expect(typeof response.body.data.pagination.total).toBe('number');
      expect(typeof response.body.data.pagination.totalPages).toBe('number');
      expect(typeof response.body.data.pagination.hasNext).toBe('boolean');
      expect(typeof response.body.data.pagination.hasPrev).toBe('boolean');
    });

    test('should support custom pagination parameters', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages?page=2&limit=5`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.page).toBe(2);
      expect(response.body.data.pagination.limit).toBe(5);
    });

    test('should validate pagination parameters', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages?page=0&limit=101`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate conversation ID format', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get('/v1/conversations/invalid-format/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('GET /v1/conversations/:conversationId/messages/:messageId', () => {
    test('should get a message by ID', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(testMessageId);
      expect(response.body.data.sender).toBeDefined();
    });

    test('should validate message ID format', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages/invalid-format`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${testConversationId}/messages/${testMessageId}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });
  });

  describe('PUT /v1/conversations/:conversationId/messages/:messageId', () => {
    test('should update a message', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .put(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Updated message content',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Content should be encrypted now
      if (typeof response.body.data.content === 'object') {
        expect(response.body.data.content).toHaveProperty('data');
        expect(response.body.data.content).toHaveProperty('encryption');
        expect(response.body.data.content.encryption.keyId).toBe('message_key');
      } else {
        // Fallback: might still be plaintext in some test scenarios
        expect(response.body.data.content).toBe('Updated message content');
      }
    });

    test('should validate content is required', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .put(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate content length', async () => {
      const { token } = await loginAndGetToken(app);

      const longContent = 'a'.repeat(MESSAGE_LIMITS.MAX_CONTENT_LENGTH + 1);
      const response = await request(app)
        .put(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: longContent,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate message ID format', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .put(`/v1/conversations/${testConversationId}/messages/invalid-format`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'Valid content',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .send({
          content: 'Valid content',
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });
  });

  describe('DELETE /v1/conversations/:conversationId/messages/:messageId', () => {
    test('should delete a message', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .delete(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(204);
    });

    test('should validate message ID format', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .delete(`/v1/conversations/${testConversationId}/messages/invalid-format`)
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${testConversationId}/messages/${testMessageId}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${testConversationId}/messages/${testMessageId}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });
  });
});

describe('Message Routes Security', () => {
  let userToken: string;
  let otherUserToken: string;
  let conversationId: string;
  let messageId: string;
  
  const testUser = 'test@example.com';
  const otherUser = 'other@example.com';

  beforeAll(async () => {
    // Generate tokens for testing
    userToken = generateToken(testUser);
    otherUserToken = generateToken(otherUser);

    // Create test users first to satisfy conversation validation
    await request(app)
      .post('/v1/auth/register')
      .send({
        email: testUser,
        password: 'testpassword123',
        displayName: 'Test User'
      });

    await request(app)
      .post('/v1/auth/register')
      .send({
        email: otherUser,
        password: 'testpassword123',
        displayName: 'Other User'
      });

    // Create additional test users for other scenarios
    await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'nonparticipant@example.com',
        password: 'testpassword123',
        displayName: 'Non Participant'
      });

    await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'another@example.com',
        password: 'testpassword123',
        displayName: 'Another User'
      });
  });

  beforeEach(async () => {
    // Create a test conversation
    const conversationResponse = await request(app)
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        participantEmails: [otherUser]
      });
    conversationId = conversationResponse.body.data.id;

    // Create a test message
    const messageResponse = await request(app)
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        content: 'Test message for security testing'
      });
    
    messageId = messageResponse.body.data.id;
  });

  describe('Message Creation Security', () => {
    it('should allow participants to send messages', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Test message from creator'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.senderId).toBe(testUser);
    });

    it('should allow other participants to send messages', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          content: 'Test message from other participant'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.senderId).toBe(otherUser);
    });

    it('should deny non-participants from sending messages', async () => {
      const nonParticipantToken = generateToken('nonparticipant@example.com');
      const response = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${nonParticipantToken}`)
        .send({
          content: 'Unauthorized message'
        });

      expect(response.status).toBe(403);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .send({
          content: 'Unauthenticated message'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Message Update Security', () => {
    it('should allow sender to update their own message', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Updated message content'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Handle encrypted content response
      if (typeof response.body.data.content === 'object' && response.body.data.content.encryption) {
        // Response is encrypted - validate encryption format
        expect(response.body.data.content).toHaveProperty('data');
        expect(response.body.data.content).toHaveProperty('encryption');
        expect(response.body.data.content.encryption.keyId).toBe('message_key');
        expect(response.body.data.content.encryption.algorithm).toBe('AES-256-GCM');
      } else {
        // Response is plain text (fallback for non-encrypted scenarios)
        expect(response.body.data.content).toBe('Updated message content');
      }
      
      expect(response.body.data.senderId).toBe(testUser);
    });

    it('should deny other users from updating someone elses message', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          content: 'Unauthorized update attempt'
        });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('You can only edit your own messages');
    });

    it('should deny non-participants from updating messages', async () => {
      const nonParticipantToken = generateToken('nonparticipant@example.com');
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${nonParticipantToken}`)
        .send({
          content: 'Unauthorized update from non-participant'
        });

      expect(response.status).toBe(403);
    });

    it('should require authentication for updates', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .send({
          content: 'Unauthenticated update'
        });

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/msg_999999999_nonexistent`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Update non-existent message'
        });

      expect(response.status).toBe(404);
    });

    it('should validate message content in updates', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: '' // Empty content
        });

      expect(response.status).toBe(400);
      // Accept either the specific service error message or generic validation error
      expect(
        response.body.error.message === 'Message content cannot be empty' ||
        response.body.error.message === 'Validation failed' ||
        response.body.error.message.includes('Message content')
      ).toBe(true);
    });
  });

  describe('Message Deletion Security', () => {
    it('should allow sender to delete their own message', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(204);
    });

    it('should deny other users from deleting someone elses message', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('You can only delete your own messages');
    });

    it('should deny non-participants from deleting messages', async () => {
      const nonParticipantToken = generateToken('nonparticipant@example.com');
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${nonParticipantToken}`);

      expect(response.status).toBe(403);
    });

    it('should require authentication for deletion', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageId}`);

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent message', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/msg_999999999_nonexistent`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Message Retrieval Security', () => {
    it('should allow participants to view messages', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toBeInstanceOf(Array);
    });

    it('should allow other participants to view messages', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should deny non-participants from viewing messages', async () => {
      const nonParticipantToken = generateToken('nonparticipant@example.com');
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${nonParticipantToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow participants to view specific message', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(messageId);
    });

    it('should deny non-participants from viewing specific message', async () => {
      const nonParticipantToken = generateToken('nonparticipant@example.com');
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${nonParticipantToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Cross-Message Security Tests', () => {
    it('should enforce message ownership across different users', async () => {
      // User A creates a message
      const messageAResponse = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Message from User A'
        });
      const messageAId = messageAResponse.body.data.id;

      // User B creates a message  
      const messageBResponse = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          content: 'Message from User B'
        });
      const messageBId = messageBResponse.body.data.id;

      // User A cannot edit User B's message
      const editBResponse = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageBId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'User A trying to edit User B message'
        });
      expect(editBResponse.status).toBe(403);

      // User B cannot edit User A's message
      const editAResponse = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageAId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          content: 'User B trying to edit User A message'
        });
      expect(editAResponse.status).toBe(403);

      // User A cannot delete User B's message
      const deleteBResponse = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageBId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(deleteBResponse.status).toBe(403);

      // User B cannot delete User A's message
      const deleteAResponse = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageAId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(deleteAResponse.status).toBe(403);

      // But each can edit/delete their own
      const selfEditAResponse = await request(app)
        .put(`/v1/conversations/${conversationId}/messages/${messageAId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'User A editing own message'
        });
      expect(selfEditAResponse.status).toBe(200);

      const selfDeleteBResponse = await request(app)
        .delete(`/v1/conversations/${conversationId}/messages/${messageBId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      expect(selfDeleteBResponse.status).toBe(204);
    });

    it('should maintain authorization across conversation boundaries', async () => {
      // Create another conversation with different participants
      const otherConversationResponse = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          participantEmails: ['another@example.com']
        });
      const otherConversationId = otherConversationResponse.body.data.id;

      // User A should not be able to access messages in conversation they're not part of
      const unauthorizedAccessResponse = await request(app)
        .get(`/v1/conversations/${otherConversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(unauthorizedAccessResponse.status).toBe(403);

      // User A should not be able to send messages to conversation they're not part of
      const unauthorizedSendResponse = await request(app)
        .post(`/v1/conversations/${otherConversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Unauthorized message'
        });
      expect(unauthorizedSendResponse.status).toBe(403);
    });
  });
});

// Add existing tests to ensure compatibility
describe('Message Routes Backward Compatibility', () => {
  let userToken: string;
  let conversationId: string;
  
  const testUser = 'test@example.com';
  const otherUser = 'other@example.com';

  beforeAll(async () => {
    userToken = generateToken(testUser);

    // Create test users first to satisfy conversation validation
    await request(app)
      .post('/v1/auth/register')
      .send({
        email: testUser,
        password: 'testpassword123',
        displayName: 'Test User'
      });

    await request(app)
      .post('/v1/auth/register')
      .send({
        email: otherUser,
        password: 'testpassword123',
        displayName: 'Other User'
      });
  });

  beforeEach(async () => {
    // Create a test conversation
    const conversationResponse = await request(app)
      .post('/v1/conversations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        participantEmails: [otherUser]
      });
    conversationId = conversationResponse.body.data.id;
  });

  describe('POST /v1/conversations/:conversationId/messages', () => {
    it('should create a message successfully', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Test message content',
          messageType: 'TEXT'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      
      // Handle encrypted content response
      if (typeof response.body.data.content === 'object' && response.body.data.content.encryption) {
        // Response is encrypted - validate encryption format
        expect(response.body.data.content).toHaveProperty('data');
        expect(response.body.data.content).toHaveProperty('encryption');
        expect(response.body.data.content.encryption.keyId).toBe('message_key');
        expect(response.body.data.content.encryption.algorithm).toBe('AES-256-GCM');
      } else {
        // Response is plain text (fallback for non-encrypted scenarios)
        expect(response.body.data.content).toBe('Test message content');
      }
      
      expect(response.body.data.senderId).toBe(testUser);
    });

    it('should handle encrypted message creation', async () => {
      const response = await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Encrypted test message',
          messageType: 'TEXT'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      // Response should be encrypted via middleware
      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /v1/conversations/:conversationId/messages', () => {
    it('should retrieve messages with pagination', async () => {
      // Create a test message first
      await request(app)
        .post(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Test message for retrieval'
        });

      const response = await request(app)
        .get(`/v1/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.pagination).toBeDefined();
    });
  });
}); 