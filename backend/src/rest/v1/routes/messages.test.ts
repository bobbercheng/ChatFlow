import request from 'supertest';
import { app } from '../../../app';
import { loginAndGetToken } from '../../../test-utils';
import '../../../test-setup';

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
      expect(response.body.data.content).toBe('Hello, this is a test message');
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

      expect(response.status).toBe(201);
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

      const longContent = 'a'.repeat(10001);
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
      expect(response.body.data.content).toBe('Updated message content');
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

      const longContent = 'a'.repeat(10001);
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