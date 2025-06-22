// Mock the auth middleware FIRST before any imports
jest.mock('../../../middleware/auth', () => ({
  authenticateToken: jest.fn((req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access token required',
          code: 'TOKEN_REQUIRED',
        },
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid token format',
          code: 'TOKEN_INVALID',
        },
      });
    }
    
    const token = authHeader.substring(7);
    
    // Check if it's our valid test token
    try {
      const jwt = require('jsonwebtoken');
      const secret = process.env['JWT_SECRET'] || 'test-secret';
      
      // Verify token with the test secret
      jwt.verify(token, secret);
      req.user = { email: 'test@example.com' };
      next();
    } catch (error) {
      // This will catch both invalid tokens and expired tokens
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid token',
          code: 'TOKEN_INVALID',
        },
      });
    }
  }),
}));

// Mock the search service
jest.mock('../../../services/search.service', () => ({
  searchService: {
    semanticSearch: jest.fn(),
    getSuggestions: jest.fn(),
    indexMessage: jest.fn(),
    indexAllMessages: jest.fn(),
    trackSuggestionClick: jest.fn(),
    trackSearchQuery: jest.fn(),
  },
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn()
      })),
      get: jest.fn()
    })),
    doc: jest.fn(() => ({
      get: jest.fn()
    }))
  }))
}));

import request from 'supertest';
import { Express } from 'express';
import { app } from '../../../app';
import jwt from 'jsonwebtoken';
import { searchService } from '../../../services/search.service';

// Clear the global JWT mock from test-setup and create our own
jest.clearAllMocks();
jest.restoreAllMocks();

// Override the global JWT mock with proper behavior for our test
jest.mock('jsonwebtoken', () => {
  const actualJWT = jest.requireActual('jsonwebtoken');
  return {
    ...actualJWT,
    sign: actualJWT.sign,
    verify: actualJWT.verify,
  };
});

const mockSearchService = searchService as jest.Mocked<typeof searchService>;

describe('Search Routes', () => {
  let server: Express;
  let validToken: string;
  let invalidToken: string;

  const mockUser = {
    email: 'test@example.com',
    displayName: 'Test User',
  };

  beforeAll(() => {
    server = app;
    
    // Set JWT_SECRET for test environment
    process.env['JWT_SECRET'] = 'test-secret';
    
    // Create valid JWT token
    validToken = jwt.sign(
      { email: mockUser.email, displayName: mockUser.displayName },
      'test-secret',
      { expiresIn: '1h' }
    );

    // Create invalid JWT token
    invalidToken = jwt.sign(
      { email: mockUser.email, displayName: mockUser.displayName },
      'wrong-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /v1/search/conversations', () => {
    const mockSearchResults = [
      {
        messageId: 'msg-1',
        conversationId: 'conv_1750455035529_abc123',
        senderId: 'user1@example.com',
        senderDisplayName: 'User One',
        content: 'Let\'s have lunch at the new restaurant',
        createdAt: new Date(),
        relevanceScore: 0.95,
        highlightedContent: 'Let\'s have **lunch** at the new **restaurant**',
        conversationContext: {
          participantEmails: ['user1@example.com', 'user2@example.com'],
          conversationType: 'DIRECT',
          summary: 'Lunch discussion',
        },
      },
      {
        messageId: 'msg-2',
        conversationId: 'conv_1750455035530_def456',
        senderId: 'user2@example.com',
        senderDisplayName: 'User Two',
        content: 'Great idea! What time works for lunch?',
        createdAt: new Date(),
        relevanceScore: 0.87,
        highlightedContent: 'Great idea! What time works for **lunch**?',
        conversationContext: {
          participantEmails: ['user1@example.com', 'user2@example.com'],
          conversationType: 'DIRECT',
          summary: 'Time coordination',
        },
      },
    ];

    it('should successfully search conversations with valid query', async () => {
      mockSearchService.semanticSearch.mockResolvedValue(mockSearchResults);

      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'lunch plans', limit: 20 })
        .expect(200);

      // Convert expected results to match serialized dates
      const expectedResults = mockSearchResults.map(result => ({
        ...result,
        createdAt: result.createdAt.toISOString(),
      }));

      expect(response.body).toEqual({
        success: true,
        data: {
          results: expectedResults,
          query: 'lunch plans',
          totalResults: 2,
          searchTime: expect.any(Number),
        },
      });

      expect(mockSearchService.semanticSearch).toHaveBeenCalledWith({
        query: 'lunch plans',
        userId: mockUser.email,
        limit: 20,
      });
    });

    it('should use default limit when not provided', async () => {
      mockSearchService.semanticSearch.mockResolvedValue([]);

      await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test query' })
        .expect(200);

      expect(mockSearchService.semanticSearch).toHaveBeenCalledWith({
        query: 'test query',
        userId: mockUser.email,
        limit: 20,
      });
    });

    it('should return validation error for missing query', async () => {
      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Query must be between 1 and 500 characters',
            }),
          ]),
        },
      });
    });

    it('should return validation error for empty query', async () => {
      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: '' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Query must be between 1 and 500 characters',
            }),
          ]),
        },
      });
    });

    it('should return validation error for query too long', async () => {
      const longQuery = 'a'.repeat(501);

      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: longQuery })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Query must be between 1 and 500 characters',
            }),
          ]),
        },
      });
    });

    it('should return validation error for invalid limit', async () => {
      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test', limit: 100 })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Limit must be between 1 and 50',
            }),
          ]),
        },
      });
    });

    it('should return 401 for missing token', async () => {
      const response = await request(server)
        .get('/v1/search/conversations')
        .query({ q: 'test query' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Access token required',
          code: 'TOKEN_REQUIRED',
        },
      });
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${invalidToken}`)
        .query({ q: 'test query' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Invalid token',
          code: 'TOKEN_INVALID',
        },
      });
    });

    it('should return 500 when search service throws error', async () => {
      mockSearchService.semanticSearch.mockRejectedValue(new Error('Search service error'));

      const response = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test query' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Search failed',
        },
      });
    });

    it('should handle natural language queries', async () => {
      mockSearchService.semanticSearch.mockResolvedValue(mockSearchResults);

      const naturalQueries = [
        'Find messages about lunch plans with Sarah',
        'Show me conversations from last week',
        'What did John say about the project?',
        'lunch restaurant meeting',
      ];

      for (const query of naturalQueries) {
        await request(server)
          .get('/v1/search/conversations')
          .set('Authorization', `Bearer ${validToken}`)
          .query({ q: query })
          .expect(200);
      }

      expect(mockSearchService.semanticSearch).toHaveBeenCalledTimes(naturalQueries.length);
    });
  });

  describe('GET /v1/search/suggestions', () => {
    it('should return search suggestions successfully', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([
        { text: 'lunch from last week', type: 'recent', frequency: 5 },
        { text: 'lunch discussions', type: 'topic', frequency: 3 },
        { text: 'recent lunch', type: 'recent', frequency: 2 },
      ]);

      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'lunch', limit: 5 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: [
          { suggestion: 'lunch from last week', type: 'recent', count: 5, category: undefined },
          { suggestion: 'lunch discussions', type: 'topic', count: 3, category: undefined },
          { suggestion: 'recent lunch', type: 'recent', count: 2, category: undefined },
        ],
      });
    });

    it('should use default limit when not provided', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([
        { text: 'test query', type: 'recent', frequency: 3 },
        { text: 'test data', type: 'topic', frequency: 2 },
        { text: 'test message', type: 'completion', frequency: 1 },
      ]);

      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.data).toHaveLength(3); // Default limit behavior
    });

    it('should respect custom limit', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([
        { text: 'test query', type: 'recent', frequency: 3 },
        { text: 'test data', type: 'topic', frequency: 2 },
      ]);

      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test', limit: 2 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should return default suggestions when no query provided', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([
        { text: 'recent messages', type: 'topic', frequency: 10 },
        { text: 'project updates', type: 'topic', frequency: 9 },
      ]);

      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.any(Array),
      });
      expect(response.body.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should return default suggestions when empty query provided', async () => {
      mockSearchService.getSuggestions.mockResolvedValue([
        { text: 'recent messages', type: 'topic', frequency: 10 },
        { text: 'project updates', type: 'topic', frequency: 9 },
      ]);

      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: '', limit: 5 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: expect.any(Array),
      });
      expect(response.body.data.length).toBeGreaterThanOrEqual(0);
    });

    it('should return validation error for query too long', async () => {
      const longQuery = 'a'.repeat(101);

      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: longQuery })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Query must be between 1 and 100 characters',
            }),
          ]),
        },
      });
    });

    it('should return validation error for invalid limit', async () => {
      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test', limit: 15 })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Limit must be between 1 and 10',
            }),
          ]),
        },
      });
    });

    it('should return 401 for missing token', async () => {
      const response = await request(server)
        .get('/v1/search/suggestions')
        .query({ q: 'test' })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Access token required',
          code: 'TOKEN_REQUIRED',
        },
      });
    });
  });

  describe('POST /v1/search/index', () => {
    // Mock message data is used in the beforeEach setup

    beforeEach(() => {
      // Mock Firebase Admin firestore
      const admin = require('firebase-admin');
      const mockDoc = {
        exists: true,
        id: 'msg-123',
        data: () => ({
          conversationId: 'conv_1750455035529_abc123',
          senderId: 'test@example.com',
          content: 'Test message content',
          messageType: 'TEXT',
          createdAt: new Date().toISOString(),
        }),
      };

      admin.firestore.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDoc),
        })),
      });
    });

    it('should successfully index a message', async () => {
      mockSearchService.indexMessage.mockResolvedValue(undefined);

      const response = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          conversationId: 'conv_1750455035529_abc123',
          messageId: 'msg-123',
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'Message indexed successfully',
          messageId: 'msg-123',
          conversationId: 'conv_1750455035529_abc123',
        },
      });

      expect(mockSearchService.indexMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'msg-123',
          conversationId: 'conv_1750455035529_abc123',
          senderId: 'test@example.com',
          content: 'Test message content',
        }),
        'conv_1750455035529_abc123'
      );
    });

    it('should return validation error for missing conversationId', async () => {
      const response = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          messageId: 'msg-123',
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Conversation ID is required',
            }),
          ]),
        },
      });
    });

    it('should return validation error for missing messageId', async () => {
      const response = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          conversationId: 'conv_1750455035529_abc123',
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              msg: 'Message ID is required',
            }),
          ]),
        },
      });
    });

    it('should return 404 when message not found', async () => {
      const admin = require('firebase-admin');
      admin.firestore.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue({ exists: false }),
        })),
      });

      const response = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          conversationId: 'conv_1750455035529_abc123',
          messageId: 'nonexistent-msg',
        })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Message not found',
        },
      });
    });

    it('should return 401 for missing token', async () => {
      const response = await request(server)
        .post('/v1/search/index')
        .send({
          conversationId: 'conv_1750455035529_abc123',
          messageId: 'msg-123',
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Access token required',
          code: 'TOKEN_REQUIRED',
        },
      });
    });

    it('should return 500 when indexing service throws error', async () => {
      mockSearchService.indexMessage.mockRejectedValue(new Error('Indexing error'));

      const response = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          conversationId: 'conv_1750455035529_abc123',
          messageId: 'msg-123',
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Failed to index message',
        },
      });
    });

    it('should return 500 when Firestore throws error', async () => {
      const admin = require('firebase-admin');
      admin.firestore.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockRejectedValue(new Error('Firestore error')),
        })),
      });

      const response = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          conversationId: 'conv_1750455035529_abc123',
          messageId: 'msg-123',
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          message: 'Failed to index message',
        },
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex search workflow', async () => {
      // Setup Firebase admin mock for indexing
      const admin = require('firebase-admin');
      const mockDoc = {
        exists: true,
        id: 'msg-1',
        data: () => ({
          conversationId: 'conv_1750455035529_abc123',
          senderId: 'user1@example.com',
          content: 'Planning lunch meeting',
          messageType: 'TEXT',
          createdAt: new Date().toISOString(),
        }),
      };

      admin.firestore.mockReturnValue({
        doc: jest.fn(() => ({
          get: jest.fn().mockResolvedValue(mockDoc),
        })),
      });

      // First, search for conversations
      mockSearchService.semanticSearch.mockResolvedValue([
        {
          messageId: 'msg-1',
          conversationId: 'conv_1750455035529_abc123',
          senderId: 'user1@example.com',
          senderDisplayName: 'User One',
          content: 'Planning lunch meeting',
          createdAt: new Date(),
          relevanceScore: 0.95,
          highlightedContent: 'Planning **lunch** **meeting**',
          conversationContext: {
            participantEmails: ['user1@example.com', 'user2@example.com'],
            conversationType: 'DIRECT',
          },
        },
      ]);

      const searchResponse = await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'lunch meeting' })
        .expect(200);

      expect(searchResponse.body.data.results).toHaveLength(1);

      // Then get suggestions for related queries
      mockSearchService.getSuggestions.mockResolvedValue([
        { text: 'lunch meeting', type: 'recent', frequency: 5 },
        { text: 'lunch plans', type: 'topic', frequency: 3 },
      ]);

      const suggestionsResponse = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'lunch' })
        .expect(200);

      expect(suggestionsResponse.body.data).toBeInstanceOf(Array);

      // Finally, manually index a message
      mockSearchService.indexMessage.mockResolvedValue(undefined);

      const indexResponse = await request(server)
        .post('/v1/search/index')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          conversationId: 'conv_1750455035529_abc123',
          messageId: 'msg-1',
        })
        .expect(200);

      expect(indexResponse.body.data.message).toBe('Message indexed successfully');
    });

    it('should handle edge cases gracefully', async () => {
      // Test with special characters in search query
      mockSearchService.semanticSearch.mockResolvedValue([]);

      await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'café & restaurant @noon!' })
        .expect(200);

      // Test with Unicode characters
      await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: '你好 世界 🌍' })
        .expect(200);

      // Test with very short query
      await request(server)
        .get('/v1/search/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'a' })
        .expect(200);
    });
  });
});

describe('Search Routes - Bulk Indexing', () => {
  let server: Express;
  let validToken: string;

  const mockUser = {
    email: 'test@example.com',
    displayName: 'Test User',
  };

  beforeAll(() => {
    server = app;
    
    // Set JWT_SECRET for test environment
    process.env['JWT_SECRET'] = 'test-secret';
    
    // Create valid JWT token for bulk indexing tests
    validToken = jwt.sign(
      { email: mockUser.email, displayName: mockUser.displayName },
      'test-secret',
      { expiresIn: '1h' }
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /v1/search/index-all', () => {
    it('should successfully bulk index messages for user', async () => {
      const mockResult = {
        totalConversations: 5,
        totalMessages: 50,
        indexedMessages: 48,
        errors: ['Failed to index message msg_1: timeout', 'Failed to index message msg_2: format error']
      };

      (searchService.indexAllMessages as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ userOnly: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalConversations).toBe(5);
      expect(response.body.data.totalMessages).toBe(50);
      expect(response.body.data.indexedMessages).toBe(48);
      expect(response.body.data.errors).toHaveLength(2);
      expect(response.body.data.duration).toBeGreaterThanOrEqual(0);
      expect(response.body.data.message).toContain('48/50 messages');

      expect(searchService.indexAllMessages).toHaveBeenCalledWith('test@example.com');
    });

    it('should bulk index all messages when userOnly is false', async () => {
      const mockResult = {
        totalConversations: 20,
        totalMessages: 500,
        indexedMessages: 500,
        errors: []
      };

      (searchService.indexAllMessages as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ userOnly: 'false' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalConversations).toBe(20);
      expect(response.body.data.totalMessages).toBe(500);
      expect(response.body.data.indexedMessages).toBe(500);
      expect(response.body.data.errors).toHaveLength(0);

      expect(searchService.indexAllMessages).toHaveBeenCalledWith(undefined);
    });

    it('should default userOnly to true when not specified', async () => {
      const mockResult = {
        totalConversations: 3,
        totalMessages: 15,
        indexedMessages: 15,
        errors: []
      };

      (searchService.indexAllMessages as jest.Mock).mockResolvedValue(mockResult);

      await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(searchService.indexAllMessages).toHaveBeenCalledWith('test@example.com');
    });

    it('should handle validation errors for invalid userOnly parameter', async () => {
      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ userOnly: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Validation failed');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'userOnly must be a boolean'
          })
        ])
      );
    });

    it('should handle service errors gracefully', async () => {
      const errorMessage = 'Database connection failed';
      (searchService.indexAllMessages as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Bulk indexing failed');
      expect(response.body.error.details).toBe(errorMessage);
    });

    it('should handle non-Error exceptions', async () => {
      (searchService.indexAllMessages as jest.Mock).mockRejectedValue('String error');

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Bulk indexing failed');
      expect(response.body.error.details).toBe('Unknown error');
    });

    it('should require authentication', async () => {
      // This test relies on the app's built-in authentication middleware
      // which will return 401 for requests without proper authorization
      await request(server)
        .post('/v1/search/index-all')
        .expect(401);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle large dataset bulk indexing', async () => {
      const mockResult = {
        totalConversations: 1000,
        totalMessages: 50000,
        indexedMessages: 49500,
        errors: new Array(500).fill('timeout error')
      };

      (searchService.indexAllMessages as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.data.totalMessages).toBe(50000);
      expect(response.body.data.indexedMessages).toBe(49500);
      expect(response.body.data.errors).toHaveLength(500);
    });

    it('should complete indexing within reasonable time', async () => {
      const mockResult = {
        totalConversations: 10,
        totalMessages: 100,
        indexedMessages: 100,
        errors: []
      };

      (searchService.indexAllMessages as jest.Mock).mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve(mockResult), 100); // Simulate 100ms processing
        });
      });

      const startTime = Date.now();
      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(response.body.data.duration).toBeGreaterThanOrEqual(100); // Should take at least 100ms
    });
  });

  describe('Error Recovery and Partial Success', () => {
    it('should report partial success when some messages fail to index', async () => {
      const mockResult = {
        totalConversations: 5,
        totalMessages: 100,
        indexedMessages: 85,
        errors: [
          'Message msg_1 in conv_1: Invalid format',
          'Message msg_2 in conv_1: Missing content',
          'Message msg_3 in conv_2: Timestamp error'
        ]
      };

      (searchService.indexAllMessages as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.indexedMessages).toBe(85);
      expect(response.body.data.totalMessages).toBe(100);
      expect(response.body.data.errors).toHaveLength(3);
      expect(response.body.data.message).toContain('85/100 messages');
    });

    it('should handle zero messages scenario', async () => {
      const mockResult = {
        totalConversations: 0,
        totalMessages: 0,
        indexedMessages: 0,
        errors: []
      };

      (searchService.indexAllMessages as jest.Mock).mockResolvedValue(mockResult);

      const response = await request(server)
        .post('/v1/search/index-all')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.data.totalConversations).toBe(0);
      expect(response.body.data.totalMessages).toBe(0);
      expect(response.body.data.indexedMessages).toBe(0);
      expect(response.body.data.message).toContain('0/0 messages');
    });
  });
}); 