import request from 'supertest';
import { app } from '../../../app';

describe('Auth Routes', () => {
  describe('POST /v1/auth/register', () => {
    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          displayName: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should validate password length', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',
          displayName: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should register user successfully or return user exists error', async () => {
      const response = await request(app)
        .post('/v1/auth/register')
        .send({
          email: 'user@example.com',
          password: '123456',
          displayName: 'Bobber Cheng',
        });

      // Should either succeed (201) or fail with user already exists (409)
      if (response.status === 201) {
        // Successful registration
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.email).toBe('user@example.com');
        expect(response.body.data.displayName).toBe('Bobber Cheng');
        expect(response.body.data.hashedPassword).toBeUndefined(); // Should not return password
      } else if (response.status === 409) {
        // User already exists
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('USER_ALREADY_EXISTS');
        expect(response.body.error.message).toContain('User already exists');
      } else {
        // Unexpected status code
        fail(`Unexpected status code: ${response.status}. Response: ${JSON.stringify(response.body)}`);
      }
    });
  });

  describe('POST /v1/auth/login', () => {
    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
}); 