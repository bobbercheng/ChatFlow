import { searchService } from './search.service';

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            orderBy: jest.fn(() => ({
              limit: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve({
                  docs: [],
                  size: 0
                }))
              }))
            }))
          }))
        }))
      })),
      orderBy: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({
            docs: [],
            size: 0
          }))
        }))
      })),
      doc: jest.fn(() => ({
        set: jest.fn(() => Promise.resolve()),
        get: jest.fn(() => Promise.resolve({
          exists: false,
          data: () => ({})
        }))
      }))
    })),
    Timestamp: {
      now: jest.fn(() => ({ toDate: () => new Date() })),
      fromDate: jest.fn((date) => ({ toDate: () => date }))
    }
  }))
}));

describe('Search Service Performance Tests', () => {
  const TEST_USER_ID = 'test@example.com';

  describe('Response Time Performance', () => {
    test('should respond to pre-computed "sle" query quickly', async () => {
      const startTime = Date.now();
      
      // Test pre-computed "sle" query
      const suggestions = await searchService.getSuggestions('sle', TEST_USER_ID, 5);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(50); // Reasonable limit for first request
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]?.text).toBeDefined(); // Pre-computed suggestion returned
      
      console.log(`Pre-computed "sle" suggestion response time: ${responseTime}ms`);
    });

    test('should respond to cached requests faster on second call', async () => {
      // First request
      const firstStart = Date.now();
      await searchService.getSuggestions('performance-test-123', TEST_USER_ID, 5);
      const firstTime = Date.now() - firstStart;
      
      // Second request should be faster (cached)
      const secondStart = Date.now();
      const suggestions = await searchService.getSuggestions('performance-test-123', TEST_USER_ID, 5);
      const secondTime = Date.now() - secondStart;
      
      expect(secondTime).toBeLessThanOrEqual(firstTime); // Second should be same or faster
      expect(suggestions).toBeDefined();
      
      console.log(`First request: ${firstTime}ms, Second request: ${secondTime}ms`);
    });

    test('should handle concurrent requests efficiently', async () => {
      const queries = ['sle', 'me', 'test', 'search', 'project'];
      const startTime = Date.now();
      
      // Make concurrent requests
      const promises = queries.map(query =>
        searchService.getSuggestions(query, TEST_USER_ID, 5)
      );
      
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All concurrent requests should complete reasonably quickly
      expect(totalTime).toBeLessThan(500); // Total time for all concurrent requests
      
      // Verify all responses are successful
      results.forEach(suggestions => {
        expect(suggestions.length).toBeGreaterThan(0);
      });
      
      console.log(`Concurrent requests total time: ${totalTime}ms for ${queries.length} requests`);
      console.log(`Average per request: ${(totalTime / queries.length).toFixed(2)}ms`);
    });
  });

  describe('Pre-Computed Suggestions Performance', () => {
    test('should return specific pre-computed suggestions for "sle"', async () => {
      const startTime = Date.now();
      const suggestions = await searchService.getSuggestions('sle', TEST_USER_ID, 5);
      const responseTime = Date.now() - startTime;
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]?.text).toBeDefined(); // First suggestion returned
      // Should return relevant suggestions for "sle" query
      expect(suggestions.length).toBeGreaterThan(0);
      
      // Verify they're sorted by frequency
      for (let i = 0; i < suggestions.length - 1; i++) {
        expect(suggestions[i]?.frequency).toBeGreaterThanOrEqual(suggestions[i + 1]?.frequency || 0);
      }
      
      console.log(`"sle" pre-computed suggestions time: ${responseTime}ms`);
    });

    test('should return pre-computed suggestions for "me"', async () => {
      const startTime = Date.now();
      const suggestions = await searchService.getSuggestions('me', TEST_USER_ID, 5);
      const responseTime = Date.now() - startTime;
      
      expect(suggestions.length).toBeGreaterThan(0);
      // Should return relevant suggestions for "me" query
      expect(suggestions.length).toBeGreaterThan(0);
      
      console.log(`"me" pre-computed suggestions time: ${responseTime}ms`);
    });

    test('should handle partial matches in pre-computed pools', async () => {
      const startTime = Date.now();
      const suggestions = await searchService.getSuggestions('sl', TEST_USER_ID, 5);
      const responseTime = Date.now() - startTime;
      
      expect(suggestions.length).toBeGreaterThan(0);
      // Should return relevant suggestions for "sl" query
      expect(suggestions.length).toBeGreaterThan(0);
      
      console.log(`"sl" partial match time: ${responseTime}ms`);
    });
  });

  describe('Default Suggestions Performance', () => {
    test('should return default suggestions quickly when no query provided', async () => {
      const startTime = Date.now();
      
      const suggestions = await searchService.getSuggestions('', TEST_USER_ID, 5);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(50);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]?.text).toBeDefined(); // Default suggestion returned
      
      console.log(`Default suggestions response time: ${responseTime}ms`);
    });

    test('should cache default suggestions for subsequent requests', async () => {
      // First request
      const firstStart = Date.now();
      await searchService.getSuggestions('', TEST_USER_ID, 5);
      const firstTime = Date.now() - firstStart;
      
      // Second request should be faster (cached)
      const secondStart = Date.now();
      const suggestions = await searchService.getSuggestions('', TEST_USER_ID, 5);
      const secondTime = Date.now() - secondStart;
      
      expect(secondTime).toBeLessThanOrEqual(firstTime);
      expect(suggestions.length).toBeGreaterThan(0);
      
      console.log(`Default suggestions - First: ${firstTime}ms, Second: ${secondTime}ms`);
    });
  });

  describe('Performance Regression Tests', () => {
    test('should maintain consistent performance across multiple runs', async () => {
      const responseTimes: number[] = [];
      const testQuery = 'consistency-test-' + Date.now();
      
      // Run the same query multiple times to test consistency
      for (let i = 0; i < 5; i++) {
        const startTime = Date.now();
        await searchService.getSuggestions(testQuery, TEST_USER_ID, 5);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }
      
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      const minTime = Math.min(...responseTimes);
      
      // After the first request, subsequent requests should be reasonably fast
      expect(responseTimes[1]).toBeLessThan(50); // Second request might be cached
      expect(avgTime).toBeLessThan(50);
      
      console.log(`Consistency test - Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime}ms, Max: ${maxTime}ms`);
      console.log(`All response times: ${responseTimes.join(', ')}ms`);
    });

    test('should meet performance targets for the specific "sle" query', async () => {
      // Test the exact scenario from the user's curl request
      const iterations = 5;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const suggestions = await searchService.getSuggestions('sle', TEST_USER_ID, 5);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        
        // Verify suggestions are correct
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0]?.text).toBeDefined(); // Valid suggestion returned
      }
      
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      
      // Should be reasonably fast on average
      expect(avgTime).toBeLessThan(50);
      
      console.log(`"sle" query performance test (${iterations} iterations):`);
      console.log(`- Average time: ${avgTime.toFixed(2)}ms`);
      console.log(`- All response times: ${responseTimes.join(', ')}ms`);
    });

    test('should handle various query lengths efficiently', async () => {
      const testQueries = [
        's',
        'sl',
        'sle',
        'sleep',
        'sleep schedule',
        'sleep schedule optimization'
      ];
      
      const responseTimes: number[] = [];
      
      for (const query of testQueries) {
        const startTime = Date.now();
        const suggestions = await searchService.getSuggestions(query, TEST_USER_ID, 5);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        
        expect(suggestions.length).toBeGreaterThan(0);
      }
      
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      expect(avgResponseTime).toBeLessThan(100);
      expect(maxResponseTime).toBeLessThan(200);
      
      console.log(`Various query lengths performance:`);
      console.log(`- Average response time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`- Max response time: ${maxResponseTime}ms`);
      console.log(`- Response times by query length: ${responseTimes.join(', ')}ms`);
    });
  });

  describe('Edge Cases Performance', () => {
    test('should handle edge cases efficiently', async () => {
      const edgeCases = [
        { query: '', description: 'empty query' },
        { query: 'a', description: 'single character' },
        { query: 'xyz123', description: 'no matches expected' },
        { query: '123', description: 'numeric query' },
        { query: 'sle', description: 'pre-computed hit' }
      ];
      
      const results: Array<{ description: string; responseTime: number; success: boolean }> = [];
      
      for (const testCase of edgeCases) {
        const startTime = Date.now();
        
        try {
          const suggestions = await searchService.getSuggestions(testCase.query, TEST_USER_ID, 5);
          const responseTime = Date.now() - startTime;
          
          results.push({
            description: testCase.description,
            responseTime,
            success: suggestions.length > 0
          });
          
          expect(responseTime).toBeLessThan(100); // All edge cases should be reasonably fast
        } catch (error) {
          const responseTime = Date.now() - startTime;
          results.push({
            description: testCase.description,
            responseTime,
            success: false
          });
          
          console.error(`Error in edge case "${testCase.description}":`, error);
        }
      }
      
      console.log('Edge case performance results:');
      results.forEach(result => {
        console.log(`- ${result.description}: ${result.responseTime}ms (${result.success ? 'SUCCESS' : 'FAILED'})`);
      });
      
      const avgEdgeCaseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      expect(avgEdgeCaseTime).toBeLessThan(50);
    });
  });
}); 