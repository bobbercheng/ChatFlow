import request from 'supertest';
import { Application } from 'express';

export interface LoginResult {
  token: string;
  response: request.Response;
}

/**
 * Helper function to login and get JWT token for testing protected endpoints
 * @param app Express application instance
 * @param email User email (defaults to 'user@example.com')
 * @param password User password (defaults to '123456')
 * @returns Promise with token and full response
 */
export async function loginAndGetToken(
  app: Application,
  email = 'user@example.com',
  password = '123456'
): Promise<LoginResult> {
  const loginResponse = await request(app)
    .post('/v1/auth/login')
    .send({
      email,
      password,
    });

  expect(loginResponse.status).toBe(200);
  expect(loginResponse.body.success).toBe(true);
  expect(loginResponse.body.data.token).toBeDefined();

  return {
    token: loginResponse.body.data.token,
    response: loginResponse,
  };
} 