import request from 'supertest';
import express from 'express';
import { 
  createEncryptionMiddleware, 
  validateEncryptedFields,
  EncryptionService,
  EncryptedField 
} from './encryption';
import { 
  ClientEncryption, 
  EncryptionTestUtils,
  encryptMessage,
  encryptSearchQuery,
  decryptField
} from '../utils/encryption-client';

describe('Encryption System', () => {
  let app: express.Application;
  let clientEncryption: ClientEncryption;
  let testUtils: EncryptionTestUtils;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    clientEncryption = new ClientEncryption('test_key');
    testUtils = new EncryptionTestUtils();
  });

  describe('ClientEncryption', () => {
    test('should encrypt and decrypt field correctly', () => {
      const testData = 'Hello, this is a secret message!';
      const userEmail = 'test@example.com';
      
      const encrypted = clientEncryption.encryptField(testData, { userEmail });
      
      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('encryption');
      expect(encrypted.encryption.algorithm).toBe('AES-256-GCM');
      expect(encrypted.encryption.keyId).toBe('test_key');
      expect(encrypted.encryption.timestamp).toBeGreaterThan(Date.now() - 1000);
      
      const decrypted = clientEncryption.decryptField(encrypted, { userEmail });
      expect(decrypted).toBe(testData);
    });

    test('should encrypt message content with specific key', () => {
      const content = 'Private message content';
      const encrypted = clientEncryption.encryptMessageContent(content);
      
      expect(encrypted.encryption.keyId).toBe('message_key');
      
      const decrypted = clientEncryption.decryptField(encrypted);
      expect(decrypted).toBe(content);
    });

    test('should encrypt search query with specific key', () => {
      const query = 'search for private documents';
      const encrypted = clientEncryption.encryptSearchQuery(query);
      
      expect(encrypted.encryption.keyId).toBe('search_key');
      
      const decrypted = clientEncryption.decryptField(encrypted);
      expect(decrypted).toBe(query);
    });

    test('should fail decryption with wrong user email', () => {
      const testData = 'Sensitive data';
      const encrypted = clientEncryption.encryptField(testData, { userEmail: 'user1@example.com' });
      
      expect(() => {
        clientEncryption.decryptField(encrypted, { userEmail: 'user2@example.com' });
      }).toThrow(); // Any error is fine, just needs to fail
    });

    test('should validate timestamp and reject old data', () => {
      const testData = 'Time sensitive data';
      const encrypted = clientEncryption.encryptField(testData);
      
      // Simulate old timestamp
      encrypted.encryption.timestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      
      expect(() => {
        clientEncryption.decryptField(encrypted, { maxAge: 5 * 60 * 1000 }); // 5 minutes max age
      }).toThrow('Encrypted data too old');
    });
  });

  describe('EncryptionTestUtils', () => {
    test('should generate test message request', () => {
      const content = 'Test message content';
      const request = testUtils.generateTestMessageRequest(content, 'test@example.com');
      
      expect(request).toHaveProperty('content');
      expect(request).toHaveProperty('messageType');
      expect(request.messageType).toBe('TEXT');
      expect(request.content).toHaveProperty('data');
      expect(request.content).toHaveProperty('encryption');
    });

    test('should generate test search request', () => {
      const query = 'test search query';
      const request = testUtils.generateTestSearchRequest(query, 'test@example.com');
      
      expect(request).toHaveProperty('q');
      expect(request).toHaveProperty('limit');
      expect(request.limit).toBe(20);
      expect(request.q).toHaveProperty('data');
      expect(request.q).toHaveProperty('encryption');
    });

    test('should generate test click tracking request', () => {
      const query = 'search query';
      const suggestion = 'suggestion text';
      const request = testUtils.generateTestClickRequest(query, suggestion, 'completion', 'test@example.com');
      
      expect(request).toHaveProperty('query');
      expect(request).toHaveProperty('suggestionText');
      expect(request).toHaveProperty('suggestionType');
      expect(request.suggestionType).toBe('completion');
      expect(request.query).toHaveProperty('data');
      expect(request.suggestionText).toHaveProperty('data');
    });

    test('should validate encrypted fields', () => {
      const testData = 'Valid encrypted data';
      const encrypted = clientEncryption.encryptField(testData, { userEmail: 'test@example.com' });
      
      const isValid = testUtils.validateEncryptedField(encrypted, 'test@example.com');
      expect(isValid).toBe(true);
      
      // Test with corrupted data
      const corrupted = { ...encrypted, data: 'corrupted_data' };
      const isInvalid = testUtils.validateEncryptedField(corrupted, 'test@example.com');
      expect(isInvalid).toBe(false);
    });

    test('should generate swagger examples', () => {
      const examples = testUtils.generateSwaggerExamples();
      
      expect(examples).toHaveProperty('encryptedMessage');
      expect(examples).toHaveProperty('encryptedSearch');
      expect(examples).toHaveProperty('encryptedClick');
      expect(examples).toHaveProperty('rawEncryptedField');
      
      // Validate structure
      expect(examples['encryptedMessage'].content).toHaveProperty('data');
      expect(examples['encryptedSearch'].q).toHaveProperty('encryption');
      expect(examples['rawEncryptedField']).toHaveProperty('encryption');
    });
  });

  describe('Helper Functions', () => {
    test('should encrypt message with helper function', () => {
      const content = 'Helper function test';
      const encrypted = encryptMessage(content, 'helper@example.com');
      
      expect(encrypted).toHaveProperty('data');
      expect(encrypted).toHaveProperty('encryption');
      expect(encrypted.encryption.keyId).toBe('message_key');
      
      const decrypted = decryptField(encrypted, 'helper@example.com');
      expect(decrypted).toBe(content);
    });

    test('should encrypt search query with helper function', () => {
      const query = 'helper search query';
      const encrypted = encryptSearchQuery(query, 'helper@example.com');
      
      expect(encrypted.encryption.keyId).toBe('search_key');
      
      const decrypted = decryptField(encrypted, 'helper@example.com');
      expect(decrypted).toBe(query);
    });
  });

  describe('Encryption Middleware', () => {
    beforeEach(() => {
      // Mock user in request (typically set by auth middleware)
      app.use((req: any, _res, next) => {
        req.user = { email: 'middleware@example.com' };
        next();
      });

      // Apply encryption middleware
      app.use(createEncryptionMiddleware());
      app.use(validateEncryptedFields());
    });

    test('should decrypt encrypted message content', async () => {
      const originalContent = 'Secret message content';
      const encryptedRequest = testUtils.generateTestMessageRequest(originalContent, 'middleware@example.com');
      
      app.post('/test-message', (req, res) => {
        // Content should be decrypted by middleware
        expect(typeof req.body.content).toBe('string');
        expect(req.body.content).toBe(originalContent);
        res.json({ success: true, content: req.body.content });
      });

      const response = await request(app)
        .post('/test-message')
        .send(encryptedRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.content).toBe(originalContent);
    });

    test('should decrypt encrypted search query', async () => {
      const originalQuery = 'secret search query';
      const encryptedRequest = testUtils.generateTestSearchRequest(originalQuery, 'middleware@example.com');
      
      app.post('/test-search', (req, res) => {
        // Query should be decrypted by middleware
        expect(typeof req.body.q).toBe('string');
        expect(req.body.q).toBe(originalQuery);
        res.json({ success: true, query: req.body.q });
      });

      const response = await request(app)
        .post('/test-search')
        .send(encryptedRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.query).toBe(originalQuery);
    });

    test('should skip encryption for auth endpoints', async () => {
      const plainRequest = { email: 'test@example.com', password: 'password' };
      
      app.post('/v1/auth/login', (req, res) => {
        // Should receive plain data without decryption
        expect(req.body).toEqual(plainRequest);
        res.json({ success: true });
      });

      await request(app)
        .post('/v1/auth/login')
        .send(plainRequest)
        .expect(200);
    });

    test('should validate encrypted field structure', async () => {
      const invalidRequest = {
        content: {
          data: 'some_data',
          encryption: {
            algorithm: 'INVALID_ALGORITHM', // Invalid algorithm
            keyId: 'test_key',
            iv: 'invalid_iv',
            tag: 'invalid_tag',
            timestamp: Date.now(),
            nonce: 'nonce'
          }
        }
      };
      
      app.post('/test-invalid', (_req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test-invalid')
        .send(invalidRequest)
        .expect(400);
    });

    test('should reject expired encrypted data', async () => {
      const expiredRequest = testUtils.generateTestMessageRequest('test content', 'middleware@example.com');
      expiredRequest.content.encryption.timestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      
      app.post('/test-expired', (_req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test-expired')
        .send(expiredRequest)
        .expect(400);
    });

    test('should handle nested encrypted fields', async () => {
      const nestedRequest = {
        message: testUtils.generateTestMessageRequest('nested content', 'middleware@example.com'),
        search: testUtils.generateTestSearchRequest('nested query', 'middleware@example.com')
      };
      
      app.post('/test-nested', (req, res) => {
        expect(typeof req.body.message.content).toBe('string');
        expect(req.body.message.content).toBe('nested content');
        expect(typeof req.body.search.q).toBe('string');
        expect(req.body.search.q).toBe('nested query');
        res.json({ success: true });
      });

      await request(app)
        .post('/test-nested')
        .send(nestedRequest)
        .expect(200);
    });
  });

  describe('Error Handling', () => {
    test('should handle decryption errors gracefully', () => {
      const encryptionService = new EncryptionService();
      const invalidEncrypted: EncryptedField = {
        data: 'invalid_base64_data',
        encryption: {
          algorithm: 'AES-256-GCM',
          keyId: 'test_key',
          iv: 'invalid_iv',
          tag: 'invalid_tag',
          timestamp: Date.now(),
          nonce: 'nonce'
        }
      };

      expect(async () => {
        await encryptionService.decryptField(invalidEncrypted, 'test@example.com');
      }).rejects.toThrow();
    });

    test('should validate encrypted field detection', () => {
      const encryptionService = new EncryptionService();
      
      // Valid encrypted field
      const validField: EncryptedField = {
        data: 'test_data',
        encryption: {
          algorithm: 'AES-256-GCM',
          keyId: 'test_key',
          iv: 'test_iv',
          tag: 'test_tag',
          timestamp: Date.now(),
          nonce: 'nonce'
        }
      };
      
      expect(encryptionService.isEncryptedField(validField)).toBe(true);
      expect(encryptionService.isEncryptedField('plain string')).toBe(false);
      expect(encryptionService.isEncryptedField(null)).toBe(false);
      expect(encryptionService.isEncryptedField(undefined)).toBe(false);
      expect(encryptionService.isEncryptedField({})).toBe(false);
    });
  });

  describe('Performance', () => {
    test('should encrypt and decrypt efficiently', () => {
      const testData = 'Performance test data';
      const iterations = 100;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const encrypted = clientEncryption.encryptField(testData, { userEmail: 'perf@example.com' });
        const decrypted = clientEncryption.decryptField(encrypted, { userEmail: 'perf@example.com' });
        expect(decrypted).toBe(testData);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;
      
      console.log(`Encryption/Decryption performance: ${avgTime.toFixed(2)}ms per cycle (${iterations} iterations)`);
      
      // Should be reasonably fast (less than 10ms per cycle on average)
      expect(avgTime).toBeLessThan(10);
    });

    test('should cache keys efficiently', () => {
      const testData = 'Cache test data';
      const userEmail = 'cache@example.com';
      
      // First encryption (cold cache)
      const start1 = Date.now();
      const encrypted1 = clientEncryption.encryptField(testData, { userEmail });
      const end1 = Date.now();
      
      // Second encryption (warm cache)
      const start2 = Date.now();
      const encrypted2 = clientEncryption.encryptField(testData, { userEmail });
      const end2 = Date.now();
      
      const coldTime = end1 - start1;
      const warmTime = end2 - start2;
      
      console.log(`Cold cache: ${coldTime}ms, Warm cache: ${warmTime}ms`);
      
      // Both should decrypt correctly
      const decrypted1 = clientEncryption.decryptField(encrypted1, { userEmail });
      const decrypted2 = clientEncryption.decryptField(encrypted2, { userEmail });
      
      expect(decrypted1).toBe(testData);
      expect(decrypted2).toBe(testData);
      
      // Warm cache should be similar or faster (allow for variance in test environment)
      expect(warmTime).toBeLessThan(coldTime + 5); // Allow 5ms variance
    });
  });

  describe('Security', () => {
    test('should use different IVs for each encryption', () => {
      const testData = 'Same data, different encryption';
      const encrypted1 = clientEncryption.encryptField(testData);
      const encrypted2 = clientEncryption.encryptField(testData);
      
      // IVs should be different
      expect(encrypted1.encryption.iv).not.toBe(encrypted2.encryption.iv);
      
      // Nonces should be different
      expect(encrypted1.encryption.nonce).not.toBe(encrypted2.encryption.nonce);
      
      // Both should decrypt to the same data
      expect(clientEncryption.decryptField(encrypted1)).toBe(testData);
      expect(clientEncryption.decryptField(encrypted2)).toBe(testData);
    });

    test('should prevent cross-user decryption', () => {
      const testData = 'User-specific data';
      const user1Email = 'user1@example.com';
      const user2Email = 'user2@example.com';
      
      const encrypted = clientEncryption.encryptField(testData, { userEmail: user1Email });
      
      // User 1 can decrypt
      expect(clientEncryption.decryptField(encrypted, { userEmail: user1Email })).toBe(testData);
      
      // User 2 cannot decrypt
      expect(() => {
        clientEncryption.decryptField(encrypted, { userEmail: user2Email });
      }).toThrow();
    });

    test('should validate timestamp to prevent replay attacks', () => {
      const testData = 'Time-sensitive data';
      const encrypted = clientEncryption.encryptField(testData);
      
      // Valid timestamp
      expect(() => {
        clientEncryption.decryptField(encrypted, { maxAge: 5 * 60 * 1000 });
      }).not.toThrow();
      
      // Modify timestamp to be very old
      encrypted.encryption.timestamp = Date.now() - 10 * 60 * 1000;
      
      // Should reject old data
      expect(() => {
        clientEncryption.decryptField(encrypted, { maxAge: 5 * 60 * 1000 });
      }).toThrow('Encrypted data too old');
    });
  });
}); 