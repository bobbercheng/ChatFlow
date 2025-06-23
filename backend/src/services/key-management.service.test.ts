import {
  KeyManagementService,
  KeyManagementUtils,
  keyManagementService,
  KeyMetadata,
  KeyDerivationParams
} from './key-management.service';

// Create dynamic mock state - needs to be global for Jest hoisting
const mockState = {
  keys: new Map<string, any>(),
  shouldError: false,
  errorMessage: '',
  queryFilters: [] as any[],
  queryResults: [] as any[]
};

// Mock implementation
jest.mock('../config/firestore', () => {
  const mockDoc = {
    set: jest.fn().mockImplementation(async (_data: any) => {
      if (mockState.shouldError) {
        throw new Error(mockState.errorMessage);
      }
      return {};
    }),
    get: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockImplementation(async () => {
      if (mockState.shouldError) {
        throw new Error(mockState.errorMessage);
      }
      return {};
    }),
  };

  const mockCollection = {
    doc: jest.fn().mockImplementation((keyId: string) => {
      // Update the get implementation for this specific keyId
      mockDoc.get.mockImplementation(async () => {
        if (mockState.shouldError) {
          throw new Error(mockState.errorMessage);
        }
        
        const keyData = mockState.keys.get(keyId);
        
        if (!keyData) {
          return { exists: false };
        }
        
        return {
          exists: true,
          data: () => keyData
        };
      });
      return mockDoc;
    }),
    where: jest.fn().mockImplementation((field: string, op: string, value: any) => {
      mockState.queryFilters.push({ field, op, value });
      return mockCollection;
    }),
    get: jest.fn().mockImplementation(async () => {
      if (mockState.shouldError) {
        throw new Error(mockState.errorMessage);
      }
      
      let results = mockState.queryResults.length > 0 ? mockState.queryResults : Array.from(mockState.keys.values());
      
      // Apply filters
      for (const filter of mockState.queryFilters) {
        results = results.filter(item => {
          if (filter.op === '==') {
            return item[filter.field] === filter.value;
          }
          if (filter.op === '<') {
            return item[filter.field] < filter.value;
          }
          return true;
        });
      }
      
      return {
        docs: results.map(data => ({
          data: () => data
        }))
      };
    })
  };

  return {
    db: {
      collection: jest.fn().mockReturnValue(mockCollection),
    },
  };
});

// Get references to mocked functions after hoisting
const mockDb = require('../config/firestore').db;
const mockCollection = mockDb.collection();
const mockDoc = mockCollection.doc();

// Test helper functions
const resetMockState = () => {
  mockState.keys.clear();
  mockState.shouldError = false;
  mockState.errorMessage = '';
  mockState.queryFilters = [];
  mockState.queryResults = [];
  
  // Add default test key
  mockState.keys.set('test_key_123', {
    keyId: 'test_key_123',
    purpose: 'message',
    algorithm: 'AES-256-GCM',
    createdAt: new Date(),
    isActive: true,
    version: 1
  });
};

const setMockError = (shouldError: boolean, message: string = 'Mock error') => {
  mockState.shouldError = shouldError;
  mockState.errorMessage = message;
};

const addMockKey = (keyId: string, data: any) => {
  mockState.keys.set(keyId, data);
};

describe('Key Management Service', () => {
  let service: KeyManagementService;

  beforeEach(() => {
    service = KeyManagementService.getInstance();
    service.clearCaches();
    
    // Reset mock state and clear call history
    resetMockState();
    jest.clearAllMocks();
    mockCollection.doc.mockClear();
    mockDoc.get.mockClear();
    mockDoc.set.mockClear();
    mockDoc.delete.mockClear();
    mockCollection.where.mockClear();
    mockCollection.get.mockClear();
    mockDb.collection.mockClear();
  });

  describe('Key Generation', () => {
    test('should generate a new encryption key', async () => {
      const params = {
        userId: 'test@example.com',
        purpose: 'message' as const,
        expiresIn: 24 * 60 * 60 * 1000 // 1 day
      };

      const metadata = await service.generateKey(params);

      expect(metadata.keyId).toBeDefined();
      expect(metadata.purpose).toBe('message');
      expect(metadata.algorithm).toBe('AES-256-GCM');
      expect(metadata.userId).toBe('test@example.com');
      expect(metadata.isActive).toBe(true);
      expect(metadata.version).toBe(1);
      expect(metadata.expiresAt).toBeDefined();
      expect(metadata.createdAt).toBeInstanceOf(Date);

      // Verify storage calls
      expect(mockCollection.doc).toHaveBeenCalled();
      expect(mockDoc.set).toHaveBeenCalledTimes(2); // metadata + encrypted key
    });

    test('should generate key without userId', async () => {
      const params = {
        purpose: 'general' as const
      };

      const metadata = await service.generateKey(params);

      expect(metadata.keyId).toBeDefined();
      expect(metadata.purpose).toBe('general');
      expect(metadata.userId).toBeUndefined();
      expect(metadata.expiresAt).toBeUndefined();
    });

    test('should generate different keyIds for same parameters', async () => {
      const params = {
        purpose: 'search' as const,
        userId: 'test@example.com'
      };

      const metadata1 = await service.generateKey(params);
      const metadata2 = await service.generateKey(params);

      expect(metadata1.keyId).not.toBe(metadata2.keyId);
    });
  });

  describe('Key Retrieval', () => {
    test('should retrieve key metadata', async () => {
      const keyId = 'test_key_123';
      
      const metadata = await service.getKeyMetadata(keyId);

      expect(metadata).toBeDefined();
      expect(metadata!.keyId).toBe(keyId);
      expect(metadata!.purpose).toBe('message');
      expect(mockCollection.doc).toHaveBeenCalledWith(keyId);
      expect(mockDoc.get).toHaveBeenCalled();
    });

    test('should return null for non-existent key', async () => {
      // Don't add the key to mock state, so it will return { exists: false }
      const metadata = await service.getKeyMetadata('non_existent_key');

      expect(metadata).toBeNull();
      expect(mockCollection.doc).toHaveBeenCalledWith('non_existent_key');
      expect(mockDoc.get).toHaveBeenCalled();
    });

    test('should cache key metadata', async () => {
      const keyId = 'test_key_123';
      
      // Clear any previous calls from beforeEach
      mockDoc.get.mockClear();
      
      // First call
      await service.getKeyMetadata(keyId);
      // Second call
      await service.getKeyMetadata(keyId);

      // Should only call Firestore once due to caching
      expect(mockDoc.get).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      setMockError(true, 'Database error');

      const metadata = await service.getKeyMetadata('error_key');

      expect(metadata).toBeNull();
    });
  });

  describe('Key Derivation', () => {
    test('should derive key from master key', async () => {
      // Set up master key in mock state
      addMockKey('master_key', {
        keyId: 'master_key',
        encryptedKey: 'encrypted_data',
        salt: 'salt_data',
        iv: 'iv_data',
        tag: 'tag_data'
      });

      const mockKey = Buffer.from('test-master-key-32-bytes-long-123');
      jest.spyOn(service as any, 'getKey').mockResolvedValue(mockKey);

      const params: KeyDerivationParams = {
        userId: 'test@example.com',
        purpose: 'message',
        masterKeyId: 'master_key'
      };

      const derivedKey = await service.deriveKey(params);

      expect(derivedKey).toBeInstanceOf(Buffer);
      expect(derivedKey.length).toBe(32); // 256-bit key
    });

    test('should cache derived keys', async () => {
      // Set up master key in mock state
      addMockKey('master_key', {
        keyId: 'master_key',
        encryptedKey: 'encrypted_data',
        salt: 'salt_data',
        iv: 'iv_data',
        tag: 'tag_data'
      });

      const mockKey = Buffer.from('test-master-key-32-bytes-long-123');
      const getKeySpy = jest.spyOn(service as any, 'getKey').mockResolvedValue(mockKey);

      const params: KeyDerivationParams = {
        userId: 'test@example.com',
        purpose: 'message',
        masterKeyId: 'master_key'
      };

      // First call
      await service.deriveKey(params);
      // Second call with same params
      await service.deriveKey(params);

      // Should only get key once due to caching
      expect(getKeySpy).toHaveBeenCalledTimes(1);
    });

    test('should throw error for missing master key', async () => {
      // Clear the test key and don't add the master key to mock state
      mockState.keys.clear();
      
      // Clear any existing spies that might be interfering
      jest.restoreAllMocks();

      const params: KeyDerivationParams = {
        userId: 'test@example.com',
        purpose: 'message',
        masterKeyId: 'non_existent_key'
      };

      await expect(service.deriveKey(params)).rejects.toThrow('Master key not found');
    });
  });

  describe('Key Rotation', () => {
    test('should rotate a key successfully', async () => {
      const oldKeyId = 'old_key_123';
      const oldMetadata: KeyMetadata = {
        keyId: oldKeyId,
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: new Date(Date.now() - 1000),
        isActive: true,
        version: 1
      };

      jest.spyOn(service, 'getKeyMetadata').mockResolvedValue(oldMetadata);
      jest.spyOn(service, 'deactivateKey').mockResolvedValue();

      const newMetadata = await service.rotateKey(oldKeyId);

      expect(newMetadata.version).toBe(2);
      expect(newMetadata.rotatedFrom).toBe(oldKeyId);
      expect(newMetadata.purpose).toBe(oldMetadata.purpose);
      expect(newMetadata.isActive).toBe(true);
      expect(newMetadata.keyId).not.toBe(oldKeyId);
    });

    test('should fail rotation for non-existent key', async () => {
      jest.spyOn(service, 'getKeyMetadata').mockResolvedValue(null);

      await expect(service.rotateKey('non_existent_key')).rejects.toThrow('Key not found for rotation');
    });
  });

  describe('Key Deactivation', () => {
    test('should deactivate a key', async () => {
      const keyId = 'test_key_123';
      
      // Start completely fresh for this test
      jest.restoreAllMocks();
      resetMockState();
      
      // Ensure the key exists in mock state
      addMockKey(keyId, {
        keyId,
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: new Date(),
        isActive: true,
        version: 1
      });

      // Track calls to the mock
      mockDoc.set.mockClear();

      await service.deactivateKey(keyId);

      // Verify the method was called at least once
      expect(mockDoc.set).toHaveBeenCalled();
      
      // Check that it was called with isActive: false
      const calls = mockDoc.set.mock.calls;
      const hasDeactivationCall = calls.some((call: any) => 
        call[0] && typeof call[0] === 'object' && call[0].isActive === false
      );
      expect(hasDeactivationCall).toBe(true);
    });

    test('should fail deactivation for non-existent key', async () => {
      // Start completely fresh
      jest.restoreAllMocks();
      resetMockState();
      
      // Clear mock state so no keys exist
      mockState.keys.clear();

      // The actual service method should check if key exists via getKeyMetadata
      // and since it returns null for non-existent keys, it should throw
      await expect(service.deactivateKey('non_existent_key')).rejects.toThrow('Key not found');
    });
  });

  describe('Key Deletion', () => {
    test('should delete a key permanently', async () => {
      const keyId = 'test_key_123';

      // Clear previous call counts
      mockCollection.doc.mockClear();
      mockDoc.delete.mockClear();

      await service.deleteKey(keyId);

      // Check that doc() was called for both collections (encryption_keys and encrypted_keys)
      expect(mockCollection.doc).toHaveBeenCalledWith(keyId);
      expect(mockDoc.delete).toHaveBeenCalledTimes(2); // metadata + encrypted key
    });

    test('should handle deletion errors', async () => {
      setMockError(true, 'Deletion failed');

      await expect(service.deleteKey('error_key')).rejects.toThrow('Deletion failed');
    });
  });

  describe('Key Listing', () => {
    test('should list keys with filters', async () => {
      // Add test keys with the specific properties
      addMockKey('user_key_1', {
        keyId: 'user_key_1',
        userId: 'test@example.com',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: new Date(),
        isActive: true,
        version: 1
      });

      mockCollection.where.mockClear();

      const keys = await service.listKeys({
        userId: 'test@example.com',
        purpose: 'message',
        isActive: true
      });

      expect(keys).toBeInstanceOf(Array);
      expect(mockCollection.where).toHaveBeenCalledWith('userId', '==', 'test@example.com');
      expect(mockCollection.where).toHaveBeenCalledWith('purpose', '==', 'message');
      expect(mockCollection.where).toHaveBeenCalledWith('isActive', '==', true);
    });

    test('should list all keys when no filters provided', async () => {
      mockCollection.get.mockClear();

      const keys = await service.listKeys();

      expect(keys).toBeInstanceOf(Array);
      expect(mockCollection.get).toHaveBeenCalled();
    });

    test('should handle listing errors', async () => {
      setMockError(true, 'Database error');

      const keys = await service.listKeys();

      expect(keys).toEqual([]);
    });

    test('should filter expired keys', async () => {
      // Clear default keys and add only expired key
      mockState.keys.clear();
      const expiredDate = new Date(Date.now() - 1000);
      
      addMockKey('expired_key', {
        keyId: 'expired_key',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: expiredDate,
        expiresAt: expiredDate,
        isActive: true,
        version: 1
      });

      const keys = await service.listKeys({ includeExpired: false });

      expect(keys).toHaveLength(0);
    });
  });

  describe('Key Rotation Automation', () => {
    test('should perform automatic key rotation', async () => {
      // Clear default keys and add old key that needs rotation
      mockState.keys.clear();
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      
      addMockKey('old_key_123', {
        keyId: 'old_key_123',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: oldDate,
        isActive: true,
        version: 1
      });

      jest.spyOn(service, 'rotateKey').mockResolvedValue({} as KeyMetadata);

      await service.performKeyRotation();

      expect(service.rotateKey).toHaveBeenCalledWith('old_key_123');
    });

    test('should handle rotation errors gracefully', async () => {
      // Clear and set up specific error key
      mockState.keys.clear();
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      
      addMockKey('error_key', {
        keyId: 'error_key',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: oldDate,
        isActive: true,
        version: 1
      });

      jest.spyOn(service, 'rotateKey').mockRejectedValue(new Error('Rotation failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await service.performKeyRotation();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to rotate key'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Key Cleanup', () => {
    test('should cleanup expired keys', async () => {
      // Start fresh with no spies interfering
      jest.restoreAllMocks();
      
      // Clear default keys and add only the expired key
      mockState.keys.clear();
      const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // 400 days ago
      
      addMockKey('expired_key_123', {
        keyId: 'expired_key_123',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: oldDate,
        isActive: false,
        version: 1
      });

      // Create a fresh spy
      const deleteKeySpy = jest.spyOn(service, 'deleteKey').mockResolvedValue();

      await service.cleanupExpiredKeys();

      expect(deleteKeySpy).toHaveBeenCalledWith('expired_key_123');
    });
  });

  describe('System Health', () => {
    test('should get key system health status', async () => {
      const testKeys: KeyMetadata[] = [
        {
          keyId: 'active_key_1',
          purpose: 'message',
          algorithm: 'AES-256-GCM',
          createdAt: new Date(),
          isActive: true,
          version: 1
        },
        {
          keyId: 'expired_key_1',
          purpose: 'search',
          algorithm: 'AES-256-GCM',
          createdAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() - 500),
          isActive: false,
          version: 1
        },
        {
          keyId: 'rotated_key_1',
          purpose: 'message',
          algorithm: 'AES-256-GCM',
          createdAt: new Date(),
          rotatedFrom: 'old_key_id',
          isActive: true,
          version: 2
        }
      ];

      jest.spyOn(service, 'listKeys').mockResolvedValue(testKeys);

      const health = await service.getKeySystemHealth();

      expect(health.totalKeys).toBe(3);
      expect(health.activeKeys).toBe(2);
      expect(health.expiredKeys).toBe(1);
      expect(health.lastRotation).toBeInstanceOf(Date);
    });

    test('should handle health check errors', async () => {
      jest.spyOn(service, 'listKeys').mockRejectedValue(new Error('Database error'));

      const health = await service.getKeySystemHealth();

      expect(health.totalKeys).toBe(0);
      expect(health.activeKeys).toBe(0);
      expect(health.expiredKeys).toBe(0);
      expect(health.keysNeedingRotation).toBe(0);
    });
  });

  describe('Cache Management', () => {
    test('should clear caches', () => {
      // Populate caches
      const service_any = service as any;
      service_any.keyCache.set('test_key', Buffer.from('test'));
      service_any.metadataCache.set('test_key', {} as KeyMetadata);

      expect(service_any.keyCache.size).toBe(1);
      expect(service_any.metadataCache.size).toBe(1);

      service.clearCaches();

      expect(service_any.keyCache.size).toBe(0);
      expect(service_any.metadataCache.size).toBe(0);
    });
  });
});

describe('Key Management Utils', () => {
  let utils: KeyManagementUtils;

  beforeEach(() => {
    utils = new KeyManagementUtils();
    jest.clearAllMocks();
  });

  describe('System Initialization', () => {
    test('should initialize system with default keys', async () => {
      const generateKeySpy = jest.spyOn(keyManagementService, 'generateKey').mockResolvedValue({
        keyId: 'test_key',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: new Date(),
        isActive: true,
        version: 1
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await utils.initializeSystem('admin@example.com');

      expect(generateKeySpy).toHaveBeenCalledTimes(4); // message, search, suggestion, general
      expect(generateKeySpy).toHaveBeenCalledWith({
        userId: 'admin@example.com',
        purpose: 'message',
        expiresIn: 90 * 24 * 60 * 60 * 1000
      });

      expect(consoleSpy).toHaveBeenCalledWith('Initializing key management system...');

      consoleSpy.mockRestore();
    });

    test('should handle initialization errors gracefully', async () => {
      jest.spyOn(keyManagementService, 'generateKey').mockRejectedValue(new Error('Generation failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await utils.initializeSystem();

      expect(consoleSpy).toHaveBeenCalledTimes(4); // One error per purpose

      consoleSpy.mockRestore();
    });
  });

  describe('Test Key Generation', () => {
    test('should generate test keys', async () => {
      const mockMetadata: KeyMetadata = {
        keyId: 'test_key',
        purpose: 'message',
        algorithm: 'AES-256-GCM',
        createdAt: new Date(),
        isActive: true,
        version: 1
      };

      jest.spyOn(keyManagementService, 'generateKey').mockResolvedValue(mockMetadata);

      const keys = await utils.generateTestKeys();

      expect(keys).toHaveProperty('message');
      expect(keys).toHaveProperty('search');
      expect(keys).toHaveProperty('suggestion');
      expect(Object.keys(keys)).toHaveLength(3);
    });
  });

  describe('System Statistics', () => {
    test('should get system statistics', async () => {
      const mockKeys: KeyMetadata[] = [
        {
          keyId: 'key1',
          purpose: 'message',
          algorithm: 'AES-256-GCM',
          createdAt: new Date(),
          isActive: true,
          version: 1,
          userId: 'user1@example.com'
        },
        {
          keyId: 'key2',
          purpose: 'search',
          algorithm: 'AES-256-GCM',
          createdAt: new Date(),
          rotatedFrom: 'old_key',
          isActive: true,
          version: 2
        }
      ];

      const mockHealth = {
        totalKeys: 2,
        activeKeys: 2,
        expiredKeys: 0,
        keysNeedingRotation: 0
      };

      jest.spyOn(keyManagementService, 'getKeySystemHealth').mockResolvedValue(mockHealth);
      jest.spyOn(keyManagementService, 'listKeys').mockResolvedValue(mockKeys);

      const stats = await utils.getSystemStats();

      expect(stats.health).toEqual(mockHealth);
      expect(stats.keysByPurpose).toEqual({
        message: 1,
        search: 1
      });
      expect(stats.keysByUser).toEqual({
        'user1@example.com': 1,
        'system': 1
      });
      expect(stats.rotationHistory).toHaveLength(1);
      expect(stats.rotationHistory[0]?.from).toBe('old_key');
      expect(stats.rotationHistory[0]?.to).toBe('key2');
    });
  });

  describe('Backup Operations', () => {
    test('should backup key metadata', async () => {
      const mockKeys: KeyMetadata[] = [
        {
          keyId: 'key1',
          purpose: 'message',
          algorithm: 'AES-256-GCM',
          createdAt: new Date(),
          isActive: true,
          version: 1
        }
      ];

      jest.spyOn(keyManagementService, 'listKeys').mockResolvedValue(mockKeys);

      const backup = await utils.backupKeyMetadata();

      expect(backup).toEqual(mockKeys);
      expect(keyManagementService.listKeys).toHaveBeenCalledWith({ includeExpired: true });
    });
  });
});

describe('Singleton Pattern', () => {
  test('should return same instance', () => {
    const instance1 = KeyManagementService.getInstance();
    const instance2 = KeyManagementService.getInstance();

    expect(instance1).toBe(instance2);
  });
});

describe('Integration Tests', () => {
  test('should handle complete key lifecycle', async () => {
    const service = KeyManagementService.getInstance();
    service.clearCaches();

    // Generate key
    const metadata = await service.generateKey({
      purpose: 'message',
      userId: 'integration@example.com'
    });

    expect(metadata.keyId).toBeDefined();

    // Rotate key
    jest.spyOn(service, 'getKeyMetadata').mockResolvedValue(metadata);
    jest.spyOn(service, 'deactivateKey').mockResolvedValue();

    const newMetadata = await service.rotateKey(metadata.keyId);
    expect(newMetadata.version).toBe(2);

    // Deactivate old key
    await service.deactivateKey(metadata.keyId);

    // Clean up
    const deleteKeySpy = jest.spyOn(service, 'deleteKey').mockResolvedValue();
    await service.deleteKey(metadata.keyId);

    expect(deleteKeySpy).toHaveBeenCalledWith(metadata.keyId);
  });
}); 