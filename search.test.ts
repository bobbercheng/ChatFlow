import request from 'supertest';
import { Express } from 'express';
import app from '../../../app';
import { searchService } from '../../../services/search.service';
import jwt from 'jsonwebtoken';

// Mock the search service
jest.mock('../../../services/search.service', () => ({
  searchService: {
    semanticSearch: jest.fn(),
    indexMessage: jest.fn(),
  },
}));

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(),
    })),
  })),
}));

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
    
    // Create valid JWT token
    validToken = jwt.sign(
      { email: mockUser.email, displayName: mockUser.displayName },
      process.env.JWT_SECRET || 'test-secret',
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
        id: 'msg-1',
        conversationId: 'conv_1750455035529_abc123',
        senderId: 'user1@example.com',
        content: 'Let\'s have lunch at the new restaurant',
        messageType: 'TEXT',
        createdAt: new Date().toISOString(),
        relevanceScore: 0.95,
        highlights: ['lunch', 'restaurant'],
        conversationContext: {
          participants: ['user1@example.com', 'user2@example.com'],
          createdAt: new Date().toISOString(),
        },
      },
      {
        id: 'msg-2',
        conversationId: 'conv_1750455035530_def456',
        senderId: 'user2@example.com',
        content: 'Great idea! What time works for lunch?',
        messageType: 'TEXT',
        createdAt: new Date().toISOString(),
        relevanceScore: 0.87,
        highlights: ['lunch', 'time'],
        conversationContext: {
          participants: ['user1@example.com', 'user2@example.com'],
          createdAt: new Date().toISOString(),
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

      expect(response.body).toEqual({
        success: true,
        data: {
          results: mockSearchResults,
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
      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'lunch', limit: 5 })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: [
          { suggestion: 'lunch from last week', type: 'recent', count: 5 },
          { suggestion: 'lunch discussions', type: 'topic', count: 3 },
          { suggestion: 'recent lunch', type: 'recent', count: 2 },
        ],
      });
    });

    it('should use default limit when not provided', async () => {
      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test' })
        .expect(200);

      expect(response.body.data).toHaveLength(3); // Default limit behavior
    });

    it('should respect custom limit', async () => {
      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
        .query({ q: 'test', limit: 2 })
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should return validation error for missing query', async () => {
      const response = await request(server)
        .get('/v1/search/suggestions')
        .set('Authorization', `Bearer ${validToken}`)
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
    const mockMessageData = {
      id: 'msg-123',
      conversationId: 'conv_1750455035529_abc123',
      senderId: 'test@example.com',
      content: 'Test message content',
      messageType: 'TEXT',
      createdAt: new Date().toISOString(),
    };

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
      // First, search for conversations
      mockSearchService.semanticSearch.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv_1750455035529_abc123',
          senderId: 'user1@example.com',
          content: 'Planning lunch meeting',
          messageType: 'TEXT',
          createdAt: new Date().toISOString(),
          relevanceScore: 0.95,
          highlights: ['lunch', 'meeting'],
          conversationContext: {
            participants: ['user1@example.com', 'user2@example.com'],
            createdAt: new Date().toISOString(),
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
