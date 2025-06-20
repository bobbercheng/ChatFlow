import request from 'supertest';
import { app } from '../../../app';
import { loginAndGetToken } from '../../../test-utils';

describe('User Routes', () => {
  describe('GET /v1/users/me', () => {
    test('should return user profile when authenticated', async () => {
      // First, login to get a token
      const { token } = await loginAndGetToken(app);

      // Then, use the token to get user profile
      const profileResponse = await request(app)
        .get('/v1/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(profileResponse.status).toBe(200);
      expect(profileResponse.body.success).toBe(true);
      expect(profileResponse.body.data).toBeDefined();
      expect(profileResponse.body.data.email).toBe('user@example.com');
      expect(profileResponse.body.data.displayName).toBeDefined();
      expect(profileResponse.body.data.hashedPassword).toBeUndefined(); // Should not return password
    });

    test('should return 401 when no token provided', async () => {
      const response = await request(app)
        .get('/v1/users/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_REQUIRED');
    });

    test('should return 401 when invalid token provided', async () => {
      const response = await request(app)
        .get('/v1/users/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });

    test('should return 401 when malformed authorization header', async () => {
      const response = await request(app)
        .get('/v1/users/me')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_INVALID');
    });
  });
}); 