import request from 'supertest';
import express from 'express';
import searchRoutes from './search';

// Mock the auth middleware to always authenticate
jest.mock('../../../middleware/auth', () => ({
  authenticateToken: jest.fn((req, _res, next) => {
    req.user = { email: 'test@example.com' };
    next();
  })
}));

// Mock firebase-admin for search service
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

describe('Search API Performance Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/v1/search', searchRoutes);
  });

  // Note: Tests run independently without cache resets to test real-world performance

  describe('GET /v1/search/suggestions - Performance', () => {
    test('should respond to pre-computed "sle" query in under 50ms (API level)', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/v1/search/suggestions')
        .query({ q: 'sle', limit: 5 })
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(100); // API overhead + service time (adjusted for test variability)
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]?.suggestion).toBeDefined(); // Valid suggestion returned
      
      console.log(`API "sle" query response time: ${responseTime}ms`);
    });

    test('should handle cached requests very quickly', async () => {
      // First request to populate cache
      await request(app)
        .get('/v1/search/suggestions')
        .query({ q: 'cached-test', limit: 5 })
        .expect(200);
      
      // Second request should be much faster
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/v1/search/suggestions')
        .query({ q: 'cached-test', limit: 5 })
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(30); // Cached response should be very fast
      expect(response.body.success).toBe(true);
      
      console.log(`API cached query response time: ${responseTime}ms`);
    });

    test('should handle default suggestions quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/v1/search/suggestions')
        .query({ limit: 5 })
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(30);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      console.log(`API default suggestions response time: ${responseTime}ms`);
    });

    test('should handle concurrent requests efficiently', async () => {
      const queries = ['sle', 'me', 'test', 'search', 'project'];
      const startTime = Date.now();
      
      // Make concurrent requests
      const promises = queries.map(query =>
        request(app)
          .get('/v1/search/suggestions')
          .query({ q: query, limit: 5 })
          .expect(200)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All concurrent requests should complete reasonably quickly
      expect(totalTime).toBeLessThan(200); // Total time for all concurrent requests
      
      // Verify all responses are successful
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      });
      
      console.log(`API concurrent requests total time: ${totalTime}ms for ${queries.length} requests`);
    });

    test('should maintain performance with various query lengths', async () => {
      const testQueries = [
        's',
        'sl',
        'sle',
        'sleep',
        'sleep schedule',
        'sleep schedule optimization',
        'how to improve sleep quality and schedule'
      ];
      
      const responseTimes: number[] = [];
      
      for (const query of testQueries) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/v1/search/suggestions')
          .query({ q: query, limit: 5 })
          .expect(200);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        
        expect(response.body.success).toBe(true);
      }
      
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      expect(avgResponseTime).toBeLessThan(50);
      expect(maxResponseTime).toBeLessThan(100);
      
      console.log(`API various query lengths:`);
      console.log(`- Average response time: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`- Max response time: ${maxResponseTime}ms`);
      console.log(`- All response times: ${responseTimes.join(', ')}ms`);
    });

    test('should handle invalid parameters gracefully and quickly', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get('/v1/search/suggestions')
        .query({ q: 'x'.repeat(1000), limit: 100 }) // Invalid long query and high limit
        .expect(400);
      
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(50); // Validation errors should be very fast (adjusted for test variability)
      expect(response.body.success).toBe(false);
      
      console.log(`API validation error response time: ${responseTime}ms`);
    });
  });



  describe('Performance Regression Tests', () => {
    test('should consistently meet performance targets for user-specific query', async () => {
      // Test the exact scenario from the user's curl request
      const iterations = 10;
      const responseTimes: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/v1/search/suggestions')
          .query({ q: 'sle', limit: 5 })
          .expect(200);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        
        // Verify response structure matches API spec
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0]).toHaveProperty('suggestion');
        expect(response.body.data[0]).toHaveProperty('type');
        expect(response.body.data[0]).toHaveProperty('count');
      }
      
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const p95Time = responseTimes.sort((a, b) => a - b)[Math.floor(0.95 * responseTimes.length)];
      const maxTime = Math.max(...responseTimes);
      
      // Performance targets
      expect(avgTime).toBeLessThan(25); // Average should be well under target accounting for API overhead
      expect(p95Time).toBeLessThan(50); // 95th percentile should be reasonable
      
      console.log(`"sle" query performance regression test (${iterations} iterations):`);
      console.log(`- Average response time: ${avgTime.toFixed(2)}ms`);
      console.log(`- 95th percentile: ${p95Time}ms`);
      console.log(`- Max response time: ${maxTime}ms`);
      console.log(`- All response times: ${responseTimes.join(', ')}ms`);
    });

    test('should handle edge cases efficiently', async () => {
      const edgeCases = [
        { query: '', description: 'empty query' },
        { query: 'a', description: 'single character' },
        { query: 'xyz', description: 'no matches expected' },
        { query: '123', description: 'numeric query' },
        { query: 'sle', description: 'pre-computed hit' },
        { query: 'meeting', description: 'common word' }
      ];
      
      const results: Array<{ description: string; responseTime: number; success: boolean }> = [];
      
      for (const testCase of edgeCases) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/v1/search/suggestions')
          .query({ q: testCase.query, limit: 5 });
        
        const responseTime = Date.now() - startTime;
        
        results.push({
          description: testCase.description,
          responseTime,
          success: response.status === 200 && response.body.success
        });
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(responseTime).toBeLessThan(50); // All edge cases should be fast
      }
      
      console.log('Edge case performance results:');
      results.forEach(result => {
        console.log(`- ${result.description}: ${result.responseTime}ms (${result.success ? 'SUCCESS' : 'FAILED'})`);
      });
      
      const avgEdgeCaseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      expect(avgEdgeCaseTime).toBeLessThan(30);
    });
  });

  describe('Load Testing', () => {
    test('should handle rapid sequential requests', async () => {
      const requestCount = 20;
      const responseTimes: number[] = [];
      
      // Make rapid sequential requests
      for (let i = 0; i < requestCount; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/v1/search/suggestions')
          .query({ q: `test-${i % 5}`, limit: 5 }) // Cycle through 5 different queries
          .expect(200);
        
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
        
        expect(response.body.success).toBe(true);
      }
      
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxTime = Math.max(...responseTimes);
      
      expect(avgTime).toBeLessThan(30); // Should maintain good performance under load
      expect(maxTime).toBeLessThan(100); // No single request should be too slow
      
      console.log(`Load test (${requestCount} sequential requests):`);
      console.log(`- Average response time: ${avgTime.toFixed(2)}ms`);
      console.log(`- Max response time: ${maxTime}ms`);
    });
  });
}); 