import YAML from 'yamljs';
import path from 'path';
import fs from 'fs';

describe('OpenAPI Specification', () => {
  let openApiSpec: any;

  beforeAll(() => {
    const openApiPath = path.join(__dirname, 'openapi.yaml');
    expect(fs.existsSync(openApiPath)).toBe(true);
    openApiSpec = YAML.load(openApiPath);
  });

  test('should have valid OpenAPI structure', () => {
    expect(openApiSpec).toBeDefined();
    expect(openApiSpec.openapi).toBe('3.0.3');
    expect(openApiSpec.info).toBeDefined();
    expect(openApiSpec.info.title).toBe('ChatFlow API');
    expect(openApiSpec.info.version).toBe('1.0.0');
  });

  test('should have all required paths', () => {
    const requiredPaths = [
      '/auth/register',
      '/auth/login',
      '/users/me',
      '/conversations',
      '/conversations/{conversationId}/messages',
    ];

    requiredPaths.forEach(path => {
      expect(openApiSpec.paths[path]).toBeDefined();
    });
  });

  test('should have authentication endpoints', () => {
    expect(openApiSpec.paths['/auth/register'].post).toBeDefined();
    expect(openApiSpec.paths['/auth/login'].post).toBeDefined();
  });

  test('should have user endpoints', () => {
    expect(openApiSpec.paths['/users/me'].get).toBeDefined();
    expect(openApiSpec.paths['/users/me'].get.security).toBeDefined();
  });

  test('should have conversation endpoints', () => {
    expect(openApiSpec.paths['/conversations'].get).toBeDefined();
    expect(openApiSpec.paths['/conversations'].post).toBeDefined();
    expect(openApiSpec.paths['/conversations'].get.security).toBeDefined();
    expect(openApiSpec.paths['/conversations'].post.security).toBeDefined();
  });

  test('should have message endpoints', () => {
    const messagePath = '/conversations/{conversationId}/messages';
    expect(openApiSpec.paths[messagePath].get).toBeDefined();
    expect(openApiSpec.paths[messagePath].post).toBeDefined();
    expect(openApiSpec.paths[messagePath].get.security).toBeDefined();
    expect(openApiSpec.paths[messagePath].post.security).toBeDefined();
  });

  test('should have required schemas', () => {
    const requiredSchemas = [
      'User',
      'Conversation',
      'Message',
      'ConversationParticipant',
      'PaginationResult',
      'ApiResponse',
      'AuthRequest',
      'RegisterRequest',
      'CreateConversationRequest',
      'CreateMessageRequest',
      'ErrorResponse',
    ];

    requiredSchemas.forEach(schema => {
      expect(openApiSpec.components.schemas[schema]).toBeDefined();
    });
  });

  test('should have JWT security scheme', () => {
    expect(openApiSpec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(openApiSpec.components.securitySchemes.bearerAuth.type).toBe('http');
    expect(openApiSpec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(openApiSpec.components.securitySchemes.bearerAuth.bearerFormat).toBe('JWT');
  });

  test('should have pagination parameters for list endpoints', () => {
    const conversationsGet = openApiSpec.paths['/conversations'].get;
    const messagesGet = openApiSpec.paths['/conversations/{conversationId}/messages'].get;

    [conversationsGet, messagesGet].forEach(endpoint => {
      const pageParam = endpoint.parameters.find((p: any) => p.name === 'page');
      const limitParam = endpoint.parameters.find((p: any) => p.name === 'limit');
      
      expect(pageParam).toBeDefined();
      expect(limitParam).toBeDefined();
      expect(pageParam.schema.minimum).toBe(1);
      expect(limitParam.schema.minimum).toBe(1);
      expect(limitParam.schema.maximum).toBe(100);
    });
  });
}); 