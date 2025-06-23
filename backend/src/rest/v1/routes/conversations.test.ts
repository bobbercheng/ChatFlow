import request from 'supertest';
import { app } from '../../../app';
import { generateToken } from '../../../middleware/auth';
import { AUTHORIZATION } from '../../../config/constants';

describe('Conversation Routes Security', () => {
  let userToken: string;
  let otherUserToken: string;
  let adminToken: string;
  
  const testUser = 'test@example.com';
  const otherUser = 'other@example.com';
  const adminUser = AUTHORIZATION.ADMIN_EMAIL;

  beforeAll(async () => {    
    // Generate tokens for testing
    userToken = generateToken(testUser);
    otherUserToken = generateToken(otherUser);
    adminToken = generateToken(adminUser);

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

    await request(app)
      .post('/v1/auth/register')
      .send({
        email: adminUser,
        password: 'adminpassword123',
        displayName: 'Admin User'
      });

    // Create additional test users for other scenarios
    await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'newuser@example.com',
        password: 'testpassword123',
        displayName: 'New User'
      });

    await request(app)
      .post('/v1/auth/register')
      .send({
        email: 'another@example.com',
        password: 'testpassword123',
        displayName: 'Another User'
      });
  });

  describe('POST /v1/conversations', () => {
    it('should create conversation and auto-add creator to participants', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser]
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.createdBy).toBe(testUser);
      expect(response.body.data.participantEmails).toContain(testUser);
      expect(response.body.data.participantEmails).toContain(otherUser);
    });

    it('should not duplicate creator in participant list', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [testUser, otherUser] // Creator included
        });

      expect(response.status).toBe(201);
      expect(response.body.data.participantEmails.filter((email: string) => email === testUser)).toHaveLength(1);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .send({
          participantEmails: [otherUser]
        });

      expect(response.status).toBe(401);
    });

    it('should validate participant emails', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: ['invalid-email']
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /v1/conversations/:conversationId', () => {
    let conversationId: string;

    beforeEach(async () => {
      // Create a test conversation
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser]
        });
      conversationId = response.body.data.id;
    });

    it('should allow participants to view conversation', async () => {
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(conversationId);
    });

    it('should deny access to non-participants', async () => {
      const nonParticipantToken = generateToken('nonparticipant@example.com');
      const response = await request(app)
        .get(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${nonParticipantToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/v1/conversations/conv_999999999_nonexistent')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /v1/conversations/:conversationId', () => {
    let conversationId: string;

    beforeEach(async () => {
      // Create a test conversation
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser]
        });
      conversationId = response.body.data.id;
    });

    it('should allow creator to update conversation', async () => {
      const newParticipant = 'newuser@example.com';
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser, newParticipant]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.participantEmails).toContain(newParticipant);
      expect(response.body.data.participantEmails).toContain(testUser); // Creator always included
    });

    it('should deny non-creator from updating conversation', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          participantEmails: [testUser, 'newuser@example.com']
        });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('Only the conversation creator can modify');
    });

    it('should ensure creator is always included in updated participants', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: ['newuser@example.com'] // Creator not included
        });

      expect(response.status).toBe(200);
      expect(response.body.data.participantEmails).toContain(testUser); // Creator auto-added
    });

    it('should validate participant emails in update', async () => {
      const response = await request(app)
        .put(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: ['invalid-email']
        });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .put('/v1/conversations/conv_999999999_nonexistent')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser]
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /v1/conversations/:conversationId', () => {
    let conversationId: string;

    beforeEach(async () => {
      // Create a test conversation
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser]
        });
      conversationId = response.body.data.id;
    });

    it('should allow admin to delete conversation', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(204);
    });

    it('should deny non-admin from deleting conversation', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('Only administrators can delete');
    });

    it('should deny conversation creator from deleting conversation (only admin)', async () => {
      const response = await request(app)
        .delete(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('Only administrators can delete');
    });

    it('should return 404 for non-existent conversation', async () => {
      const response = await request(app)
        .delete('/v1/conversations/conv_999999999_nonexistent')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('Security Integration Tests', () => {
    it('should enforce complete conversation lifecycle security', async () => {
      // Create conversation as user1
      const createResponse = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: [otherUser]
        });
      
      expect(createResponse.status).toBe(201);
      const conversationId = createResponse.body.data.id;

      // Other participant can view but not modify
      const viewResponse = await request(app)
        .get(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);
      
      expect(viewResponse.status).toBe(200);

      const updateResponse = await request(app)
        .put(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          participantEmails: [testUser, 'newuser@example.com']
        });
      
      expect(updateResponse.status).toBe(403);

      // Only admin can delete
      const deleteResponse = await request(app)
        .delete(`/v1/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(deleteResponse.status).toBe(204);
    });

    it('should handle non-existent users in participant list', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          participantEmails: ['nonexistent@example.com']
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Users not found');
    });
  });
}); 