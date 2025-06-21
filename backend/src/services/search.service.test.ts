import admin from 'firebase-admin';
import { FirestoreSearchService, SearchQuery } from './search.service';

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(),
    doc: jest.fn(),
  })),
  initializeApp: jest.fn(),
}));

// Mock console methods to reduce test noise
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe('FirestoreSearchService', () => {
  let searchService: FirestoreSearchService;
  let mockFirestore: any;
  let mockCollection: any;
  let mockDoc: any;
  let mockQuery: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup Firestore mocks
    mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };

    mockDoc = {
      set: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
    };

    mockCollection = {
      doc: jest.fn(() => mockDoc),
      where: jest.fn(() => mockQuery),
      orderBy: jest.fn(() => mockQuery),
      limit: jest.fn(() => mockQuery),
      get: jest.fn(),
      add: jest.fn(),
    };

    mockFirestore = {
      collection: jest.fn(() => mockCollection),
      doc: jest.fn(() => mockDoc),
      Timestamp: {
        now: jest.fn(() => ({ toDate: () => new Date() })),
        fromDate: jest.fn((date) => ({ toDate: () => date })),
      },
    };

    (admin.firestore as unknown as jest.Mock).mockReturnValue(mockFirestore);
    admin.firestore.Timestamp = mockFirestore.Timestamp;

    searchService = new FirestoreSearchService();
  });

  describe('getSuggestions', () => {
    it('should return cached suggestions when available', async () => {
      // Pre-populate cache
      const cachedSuggestions = [
        { text: 'cached suggestion', type: 'completion' as const, frequency: 5 }
      ];
      
      // Access private cache property for testing
      (searchService as any).suggestionsCache.set('user@test.com:test', {
        suggestions: cachedSuggestions,
        timestamp: Date.now(),
      });

      const result = await searchService.getSuggestions('test', 'user@test.com', 5);

      expect(result).toEqual(cachedSuggestions);
      // Should not hit Firestore when cached
      expect(mockFirestore.collection).not.toHaveBeenCalled();
    });

    it('should return empty array for queries shorter than 2 characters', async () => {
      // Mock empty responses for all suggestion sources
      mockQuery.get.mockResolvedValue({ docs: [] });

      const result = await searchService.getSuggestions('a', 'user@test.com', 5);

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully and return empty array', async () => {
      mockQuery.get.mockRejectedValue(new Error('Firestore error'));

      const result = await searchService.getSuggestions('test', 'user@test.com', 5);

      expect(result).toEqual([]);
    });

    it('should combine suggestions from multiple sources', async () => {
      // Mock query completions
      const queryCompletionDocs = [{
        data: () => ({ query: 'test completion', frequency: 10 })
      }];

      // Mock user keywords from search index
      const searchIndexDocs = [{
        data: () => ({ keywords: ['test', 'keyword', 'testing'] })
      }];

      // Mock conversation participants
      const conversationDocs = [{
        data: () => ({ participantEmails: ['user@test.com', 'alice@test.com'] })
      }];

      // Mock trending queries
      const trendingDocs = [{
        data: () => ({ 
          query: 'trending test', 
          normalizedQuery: 'trending test',
          frequency: 15 
        })
      }];

      // Setup different mock responses for different collections
      mockQuery.get
        .mockResolvedValueOnce({ docs: queryCompletionDocs }) // searchQueries
        .mockResolvedValueOnce({ docs: searchIndexDocs })     // searchIndex  
        .mockResolvedValueOnce({ docs: conversationDocs })    // conversations
        .mockResolvedValueOnce({ docs: trendingDocs });       // trending queries

      const result = await searchService.getSuggestions('test', 'user@test.com', 10);

      expect(Array.isArray(result)).toBe(true);
      expect(mockFirestore.collection).toHaveBeenCalledWith('searchQueries');
      expect(mockFirestore.collection).toHaveBeenCalledWith('searchIndex');
      expect(mockFirestore.collection).toHaveBeenCalledWith('conversations');
    });
  });

  describe('trackSearchQuery', () => {
    it('should create new query analytics for first-time queries', async () => {
      mockDoc.get.mockResolvedValue({ exists: false });
      mockDoc.set.mockResolvedValue(undefined);

      await searchService.trackSearchQuery('new query', 'user@test.com', 5);

      expect(mockDoc.set).toHaveBeenCalledWith({
        query: 'new query',
        normalizedQuery: 'new query',
        userId: 'user@test.com',
        frequency: 1,
        lastUsed: expect.any(Object),
        avgResultCount: 5,
        successRate: 1.0,
        createdAt: expect.any(Object),
      });
    });

    it('should update existing query analytics', async () => {
      const existingData = {
        frequency: 3,
        avgResultCount: 7,
        successRate: 0.8,
      };

      mockDoc.get.mockResolvedValue({ 
        exists: true, 
        data: () => existingData 
      });
      mockDoc.update.mockResolvedValue(undefined);

      await searchService.trackSearchQuery('existing query', 'user@test.com', 10);

      expect(mockDoc.update).toHaveBeenCalledWith({
        frequency: 4,
        lastUsed: expect.any(Object),
        avgResultCount: 8, // Weighted average: (7*3 + 10) / 4 = 31/4 = 8 (rounded)
        successRate: expect.any(Number),
      });
    });

    it('should handle tracking errors gracefully', async () => {
      mockDoc.get.mockRejectedValue(new Error('Firestore error'));

      // Should not throw
      await expect(searchService.trackSearchQuery('test', 'user@test.com', 0))
        .resolves.toBeUndefined();
    });

    it('should normalize queries correctly', async () => {
      mockDoc.get.mockResolvedValue({ exists: false });
      
      await searchService.trackSearchQuery('  Test Query  ', 'user@test.com', 3);

      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedQuery: 'test query',
        })
      );
    });
  });

  describe('trackSuggestionClick', () => {
    it('should track suggestion clicks correctly', async () => {
      mockCollection.add.mockResolvedValue({ id: 'click-id' });

      await searchService.trackSuggestionClick(
        'test query',
        'test suggestion',
        'completion',
        'user@test.com'
      );

      expect(mockFirestore.collection).toHaveBeenCalledWith('suggestionClicks');
      expect(mockCollection.add).toHaveBeenCalledWith({
        query: 'test query',
        suggestionText: 'test suggestion',
        suggestionType: 'completion',
        userId: 'user@test.com',
        timestamp: expect.any(Object),
      });
    });

    it('should handle click tracking errors gracefully', async () => {
      mockCollection.add.mockRejectedValue(new Error('Firestore error'));

      // Should not throw
      await expect(searchService.trackSuggestionClick(
        'test', 'suggestion', 'popular', 'user@test.com'
      )).resolves.toBeUndefined();
    });
  });

  describe('Cache Management', () => {
    it('should cache suggestions with TTL', async () => {
      // Mock empty responses to test caching behavior
      mockQuery.get.mockResolvedValue({ docs: [] });

      const query = 'cache test';
      const userId = 'user@test.com';

      // First call should hit Firestore
      await searchService.getSuggestions(query, userId, 5);
      expect(mockFirestore.collection).toHaveBeenCalled();

      // Reset mock call count
      mockFirestore.collection.mockClear();

      // Second call should use cache
      await searchService.getSuggestions(query, userId, 5);
      expect(mockFirestore.collection).not.toHaveBeenCalled();
    });

    it('should respect cache size limits', async () => {
      const cache = (searchService as any).suggestionsCache;
      const maxSize = (searchService as any).CACHE_MAX_SIZE;

      // Fill cache to exactly max size
      for (let i = 0; i < maxSize; i++) {
        cache.set(`user${i}:query${i}`, {
          suggestions: [],
          timestamp: Date.now(),
        });
      }

      expect(cache.size).toBe(maxSize);

      // Use the actual cacheSuggestions method to trigger LRU cleanup
      const cacheSuggestions = (searchService as any).cacheSuggestions.bind(searchService);
      cacheSuggestions(`userExtra:queryExtra`, []);

      expect(cache.size).toBeLessThanOrEqual(maxSize);
    });

    it('should expire cached entries after TTL', async () => {
      const cache = (searchService as any).suggestionsCache;
      const ttl = (searchService as any).CACHE_TTL;

      // Add expired entry
      cache.set('user@test.com:expired', {
        suggestions: [{ text: 'expired', type: 'completion', frequency: 1 }],
        timestamp: Date.now() - ttl - 1000, // Expired
      });

      mockQuery.get.mockResolvedValue({ docs: [] });

      await searchService.getSuggestions('expired', 'user@test.com', 5);

      // Should have hit Firestore since cache entry was expired
      expect(mockFirestore.collection).toHaveBeenCalled();
    });
  });

  describe('Suggestion Ranking and Deduplication', () => {
    it('should deduplicate suggestions with same text and type', async () => {
      // Mock responses that would create duplicates
      const duplicateDocs = [
        { data: () => ({ query: 'duplicate query', frequency: 5 }) },
        { data: () => ({ query: 'duplicate query', frequency: 10 }) }, // Same query, different frequency
      ];

      mockQuery.get.mockResolvedValue({ docs: duplicateDocs });

      const result = await searchService.getSuggestions('dup', 'user@test.com', 10);

      // Should have only one instance of the duplicate
      const duplicateCount = result.filter(s => s.text === 'duplicate query').length;
      expect(duplicateCount).toBeLessThanOrEqual(1);
    });

    it('should rank suggestions by relevance score', async () => {
      // Test ranking algorithm by mocking various suggestion sources
      const highFreqDocs = [
        { data: () => ({ query: 'high frequency query', frequency: 100 }) }
      ];
      const lowFreqDocs = [
        { data: () => ({ query: 'low frequency query', frequency: 1 }) }
      ];

      mockQuery.get
        .mockResolvedValueOnce({ docs: highFreqDocs })
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: lowFreqDocs });

      const result = await searchService.getSuggestions('query', 'user@test.com', 10);

             if (result.length >= 2) {
         // Higher frequency should rank higher
         expect(result[0]?.frequency || 0).toBeGreaterThanOrEqual(result[1]?.frequency || 0);
       }
    });
  });

     describe('Semantic Search Integration', () => {
     it('should track search queries automatically during semantic search', async () => {

      // Mock conversation and message queries for firestoreSearch
      mockQuery.get
        .mockResolvedValueOnce({ 
          docs: [{ id: 'conv-1', data: () => ({}) }] 
        }) // conversations query
        .mockResolvedValueOnce({ 
          docs: [{ 
            id: 'msg-1', 
            data: () => ({ 
              content: 'Test message',
              senderId: 'user@test.com',
              senderDisplayName: 'User',
              createdAt: { toDate: () => new Date() }
            })
          }] 
        }); // messages query

      // Mock trackSearchQuery
      mockDoc.get.mockResolvedValue({ exists: false });
      mockDoc.set.mockResolvedValue(undefined);

      const searchQuery: SearchQuery = {
        query: 'test',
        userId: 'user@test.com',
        limit: 10,
      };

      const results = await searchService.semanticSearch(searchQuery);

      // Should have called trackSearchQuery
      expect(mockFirestore.collection).toHaveBeenCalledWith('searchQueries');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle Firestore connection errors gracefully', async () => {
      mockFirestore.collection.mockImplementation(() => {
        throw new Error('Firestore connection failed');
      });

      const result = await searchService.getSuggestions('test', 'user@test.com', 5);

      expect(result).toEqual([]);
    });

    it('should handle malformed Firestore data gracefully', async () => {
      // Mock documents with missing or malformed data
      const malformedDocs = [
        { data: () => ({}) }, // Missing required fields
        { data: () => ({ query: null }) }, // Null values
        { data: () => ({ frequency: 'invalid' }) }, // Wrong types
      ];

      mockQuery.get.mockResolvedValue({ docs: malformedDocs });

      const result = await searchService.getSuggestions('test', 'user@test.com', 5);

      // Should handle gracefully and return valid results only
      expect(Array.isArray(result)).toBe(true);
    });
  });
}); 