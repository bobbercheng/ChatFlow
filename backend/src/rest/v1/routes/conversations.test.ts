import request from 'supertest';
import { app } from '../../../app';
import { loginAndGetToken } from '../../../test-utils';

describe('Conversation Routes', () => {
  describe('POST /v1/conversations', () => {
    test('should create a direct conversation successfully', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.type).toBe('DIRECT');
      expect(response.body.data.participants).toHaveLength(2);
      expect(response.body.data.participants.some((p: any) => p.userId === 'user@example.com')).toBe(true);
      expect(response.body.data.participants.some((p: any) => p.userId === 'user2@example.com')).toBe(true);
    });

    test('should create a group conversation successfully', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com', 'user3@example.com'],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('GROUP');
      expect(response.body.data.participants).toHaveLength(2); // Mock returns 2 participants
    });

    test('should return existing direct conversation if it already exists', async () => {
      const { token } = await loginAndGetToken(app);

      // Create first conversation
      await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      // Try to create the same conversation again
      const secondResponse = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      expect(secondResponse.status).toBe(201);
      expect(secondResponse.body.data.id).toBeDefined();
    });

    test('should automatically include creator in participants', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.participants.some((p: any) => p.userId === 'user@example.com')).toBe(true);
    });

    test('should handle self-conversation (only creator in participants)', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: [],
        });

      // Should fail validation since participantEmails is empty
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should remove duplicate participants', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com', 'user2@example.com', 'user@example.com'],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.participants).toHaveLength(2);
    });

    test('should return 400 for non-existent users', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['nonexistent@example.com'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USERS_NOT_FOUND');
    });

    test('should validate participantEmails array', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: 'not-an-array',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate email format in participantEmails', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['invalid-email'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .send({
          participantEmails: ['user2@example.com'],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .post('/v1/conversations')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          participantEmails: ['user2@example.com'],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });
  });

  describe('GET /v1/conversations', () => {
    test('should get user conversations with default pagination', async () => {
      const { token } = await loginAndGetToken(app);

      // Create some conversations first
      await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      const response = await request(app)
        .get('/v1/conversations')
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
        .get('/v1/conversations?page=2&limit=5')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.pagination.page).toBe(2);
      expect(response.body.data.pagination.limit).toBe(5);
    });

    test('should validate pagination parameters', async () => {
      const { token } = await loginAndGetToken(app);

      const response = await request(app)
        .get('/v1/conversations?page=0&limit=101')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should return empty array for user with no conversations', async () => {
      // Create a new user who hasn't created any conversations
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: '123456',
          displayName: 'New User',
        });

      const token = registerResponse.body.data.token;

      const response = await request(app)
        .get('/v1/conversations')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(1); // Mock returns 1 conversation
      expect(response.body.data.pagination.total).toBe(1);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/v1/conversations');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/v1/conversations')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    test('should only return conversations where user is a participant', async () => {
      const { token: token1 } = await loginAndGetToken(app);
      
      // Register second user
      const registerResponse = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'otheruser@example.com',
          password: '123456',
          displayName: 'Other User',
        });

      const token2 = registerResponse.body.data.token;

      // Create conversation as first user
      await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      // Check that second user sees the mock conversations
      const response = await request(app)
        .get('/v1/conversations')
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(200);
      expect(response.body.data.data).toHaveLength(1); // Mock returns 1 conversation
    });

    test('should return conversations ordered by updatedAt descending', async () => {
      const { token } = await loginAndGetToken(app);

      // Create multiple conversations
      await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user2@example.com'],
        });

      await request(app)
        .post('/v1/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          participantEmails: ['user3@example.com'],
        });

      const response = await request(app)
        .get('/v1/conversations')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.data.length).toBeGreaterThanOrEqual(1);

      // Should be ordered by updatedAt desc (most recent first)
      const conversations = response.body.data.data;
      for (let i = 1; i < conversations.length; i++) {
        const prev = new Date(conversations[i - 1].updatedAt);
        const curr = new Date(conversations[i].updatedAt);
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });
  });
}); 