import crypto from 'crypto';
import { db } from '../config/firestore';

// Key management interfaces
export interface KeyMetadata {
  keyId: string;
  userId?: string;
  purpose: 'message' | 'search' | 'suggestion' | 'general';
  algorithm: 'AES-256-GCM';
  createdAt: Date;
  expiresAt?: Date;
  rotatedFrom?: string; // Previous key ID if this is a rotation
  isActive: boolean;
  version: number;
}

export interface EncryptedKey {
  keyId: string;
  encryptedKey: string; // Encrypted with master key
  salt: string;
  iv: string;
  tag: string;
}

export interface KeyDerivationParams {
  userId?: string;
  purpose: string;
  masterKeyId: string;
  salt?: Buffer;
}

export interface KeyRotationPolicy {
  rotationIntervalDays: number;
  maxKeyAge: number;
  retentionPeriodDays: number;
  autoRotation: boolean;
}

/**
 * Enterprise-grade Key Management Service
 * Handles key generation, storage, rotation, and lifecycle management
 */
export class KeyManagementService {
  private static instance: KeyManagementService;
  private keyCache = new Map<string, Buffer>();
  private metadataCache = new Map<string, KeyMetadata>();
  
  // Default rotation policy
  private defaultPolicy: KeyRotationPolicy = {
    rotationIntervalDays: 30,
    maxKeyAge: 90 * 24 * 60 * 60 * 1000, // 90 days in ms
    retentionPeriodDays: 365,
    autoRotation: true
  };

  private constructor() {}

  static getInstance(): KeyManagementService {
    if (!KeyManagementService.instance) {
      KeyManagementService.instance = new KeyManagementService();
    }
    return KeyManagementService.instance;
  }

  /**
   * Generate a new encryption key
   */
  async generateKey(params: {
    userId?: string;
    purpose: 'message' | 'search' | 'suggestion' | 'general';
    expiresIn?: number; // milliseconds
  }): Promise<KeyMetadata> {
    const keyId = this.generateKeyId(params.purpose, params.userId);
    const key = crypto.randomBytes(32); // 256-bit key
    
    const metadata: KeyMetadata = {
      keyId,
      purpose: params.purpose,
      algorithm: 'AES-256-GCM',
      createdAt: new Date(),
      isActive: true,
      version: 1,
      ...(params.userId && { userId: params.userId }),
      ...(params.expiresIn && { expiresAt: new Date(Date.now() + params.expiresIn) })
    };

    // Encrypt and store the key
    await this.storeEncryptedKey(keyId, key);
    await this.storeKeyMetadata(metadata);
    
    // Cache the key and metadata
    this.keyCache.set(keyId, key);
    this.metadataCache.set(keyId, metadata);

    return metadata;
  }

  /**
   * Derive a key for a specific user and purpose
   */
  async deriveKey(params: KeyDerivationParams): Promise<Buffer> {
    const cacheKey = `${params.userId || 'anonymous'}:${params.purpose}:${params.masterKeyId}`;
    
    // Check cache first
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    // Get master key
    const masterKey = await this.getKey(params.masterKeyId);
    if (!masterKey) {
      throw new Error(`Master key not found: ${params.masterKeyId}`);
    }

    // Derive key using HKDF (HMAC-based Key Derivation Function)
    const salt = params.salt || crypto.randomBytes(32);
    const info = Buffer.from(`${params.userId || 'anonymous'}:${params.purpose}`, 'utf8');
    
    const derivedKeyBuffer = crypto.hkdfSync('sha256', masterKey, salt, info, 32);
    const derivedKey = Buffer.from(derivedKeyBuffer);
    
    // Cache the derived key
    this.keyCache.set(cacheKey, derivedKey);
    
    return derivedKey;
  }

  /**
   * Get a key by its ID
   */
  async getKey(keyId: string): Promise<Buffer | null> {
    // Check cache first
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId)!;
    }

    try {
      // Get encrypted key from storage
      const encryptedKey = await this.getEncryptedKey(keyId);
      if (!encryptedKey) {
        return null;
      }

      // Decrypt the key
      const key = await this.decryptStoredKey(encryptedKey);
      
      // Cache the key
      this.keyCache.set(keyId, key);
      
      return key;
    } catch (error) {
      console.error(`Error retrieving key ${keyId}:`, error);
      return null;
    }
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata(keyId: string): Promise<KeyMetadata | null> {
    // Check cache first
    if (this.metadataCache.has(keyId)) {
      return this.metadataCache.get(keyId)!;
    }

    try {
      if (!db) throw new Error('Database not initialized');
      
      const doc = await db.collection('encryption_keys').doc(keyId).get();
      if (!doc.exists) {
        return null;
      }

      const metadata = doc.data() as KeyMetadata;
      metadata.createdAt = metadata.createdAt instanceof Date ? metadata.createdAt : new Date(metadata.createdAt);
      if (metadata.expiresAt) {
        metadata.expiresAt = metadata.expiresAt instanceof Date ? metadata.expiresAt : new Date(metadata.expiresAt);
      }

      // Cache the metadata
      this.metadataCache.set(keyId, metadata);
      
      return metadata;
    } catch (error) {
      console.error(`Error retrieving key metadata ${keyId}:`, error);
      return null;
    }
  }

  /**
   * Rotate a key (generate new version, deactivate old)
   */
  async rotateKey(keyId: string): Promise<KeyMetadata> {
    const oldMetadata = await this.getKeyMetadata(keyId);
    if (!oldMetadata) {
      throw new Error(`Key not found for rotation: ${keyId}`);
    }

    // Generate new key with incremented version
    const newKeyId = this.generateKeyId(oldMetadata.purpose, oldMetadata.userId, oldMetadata.version + 1);
    const newKey = crypto.randomBytes(32);
    
    const newMetadata: KeyMetadata = {
      ...oldMetadata,
      keyId: newKeyId,
      createdAt: new Date(),
      rotatedFrom: keyId,
      version: oldMetadata.version + 1
    };

    // Store new key
    await this.storeEncryptedKey(newKeyId, newKey);
    await this.storeKeyMetadata(newMetadata);
    
    // Deactivate old key
    await this.deactivateKey(keyId);
    
    // Update caches
    this.keyCache.set(newKeyId, newKey);
    this.metadataCache.set(newKeyId, newMetadata);
    
    return newMetadata;
  }

  /**
   * Deactivate a key (mark as inactive but keep for decryption)
   */
  async deactivateKey(keyId: string): Promise<void> {
    const metadata = await this.getKeyMetadata(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    metadata.isActive = false;
    await this.storeKeyMetadata(metadata);
    
    // Update cache
    this.metadataCache.set(keyId, metadata);
  }

  /**
   * Delete a key permanently (use with caution!)
   */
  async deleteKey(keyId: string): Promise<void> {
    try {
      if (!db) throw new Error('Database not initialized');
      
      // Remove from Firestore
      await db.collection('encryption_keys').doc(keyId).delete();
      await db.collection('encrypted_keys').doc(keyId).delete();
      
      // Remove from caches
      this.keyCache.delete(keyId);
      this.metadataCache.delete(keyId);
    } catch (error) {
      console.error(`Error deleting key ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * List keys for a user or purpose
   */
  async listKeys(filters: {
    userId?: string;
    purpose?: string;
    isActive?: boolean;
    includeExpired?: boolean;
  } = {}): Promise<KeyMetadata[]> {
    try {
      if (!db) throw new Error('Database not initialized');
      
      let query: any = db.collection('encryption_keys');
      
      if (filters.userId) {
        query = query.where('userId', '==', filters.userId);
      }
      
      if (filters.purpose) {
        query = query.where('purpose', '==', filters.purpose);
      }
      
      if (filters.isActive !== undefined) {
        query = query.where('isActive', '==', filters.isActive);
      }

      const snapshot = await query.get();
      const keys = snapshot.docs.map((doc: any) => {
        const data = doc.data() as KeyMetadata;
        data.createdAt = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
        if (data.expiresAt) {
          data.expiresAt = data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt);
        }
        return data;
      });

      // Filter expired keys if requested
      if (!filters.includeExpired) {
        const now = new Date();
        return keys.filter((key: KeyMetadata) => !key.expiresAt || key.expiresAt > now);
      }

      return keys;
    } catch (error) {
      console.error('Error listing keys:', error);
      return [];
    }
  }

  /**
   * Check for keys that need rotation and rotate them
   */
  async performKeyRotation(): Promise<void> {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - this.defaultPolicy.rotationIntervalDays * 24 * 60 * 60 * 1000);
    
    try {
      if (!db) throw new Error('Database not initialized');
      
      // Find active keys older than rotation interval
      const oldKeys = await db.collection('encryption_keys')
        .where('isActive', '==', true)
        .where('createdAt', '<', cutoffDate)
        .get();

      for (const doc of oldKeys.docs) {
        const metadata = doc.data() as KeyMetadata;
        try {
          console.log(`Rotating key: ${metadata.keyId}`);
          await this.rotateKey(metadata.keyId);
        } catch (error) {
          console.error(`Failed to rotate key ${metadata.keyId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during key rotation:', error);
    }
  }

  /**
   * Clean up expired keys
   */
  async cleanupExpiredKeys(): Promise<void> {
    const now = new Date();
    const retentionCutoff = new Date(now.getTime() - this.defaultPolicy.retentionPeriodDays * 24 * 60 * 60 * 1000);
    
    try {
      if (!db) throw new Error('Database not initialized');
      
      // Find keys that are beyond retention period
      const expiredKeys = await db.collection('encryption_keys')
        .where('createdAt', '<', retentionCutoff)
        .where('isActive', '==', false)
        .get();

      for (const doc of expiredKeys.docs) {
        const metadata = doc.data() as KeyMetadata;
        try {
          console.log(`Deleting expired key: ${metadata.keyId}`);
          await this.deleteKey(metadata.keyId);
        } catch (error) {
          console.error(`Failed to delete expired key ${metadata.keyId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during key cleanup:', error);
    }
  }

  /**
   * Get system health status
   */
  async getKeySystemHealth(): Promise<{
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    keysNeedingRotation: number;
    lastRotation?: Date;
  }> {
    try {
      const allKeys = await this.listKeys({ includeExpired: true });
      const activeKeys = allKeys.filter(k => k.isActive);
      const expiredKeys = allKeys.filter(k => k.expiresAt && k.expiresAt < new Date());
      
      const rotationCutoff = new Date(Date.now() - this.defaultPolicy.rotationIntervalDays * 24 * 60 * 60 * 1000);
      const keysNeedingRotation = activeKeys.filter(k => k.createdAt < rotationCutoff);
      
      const lastRotation = allKeys
        .filter(k => k.rotatedFrom)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt;

      const result: {
        totalKeys: number;
        activeKeys: number;
        expiredKeys: number;
        keysNeedingRotation: number;
        lastRotation?: Date;
      } = {
        totalKeys: allKeys.length,
        activeKeys: activeKeys.length,
        expiredKeys: expiredKeys.length,
        keysNeedingRotation: keysNeedingRotation.length
      };
      
      if (lastRotation) {
        result.lastRotation = lastRotation;
      }
      
      return result;
    } catch (error) {
      console.error('Error getting key system health:', error);
      return {
        totalKeys: 0,
        activeKeys: 0,
        expiredKeys: 0,
        keysNeedingRotation: 0
      };
    }
  }

  /**
   * Clear all caches (for testing)
   */
  clearCaches(): void {
    this.keyCache.clear();
    this.metadataCache.clear();
  }

  // Private helper methods

  private generateKeyId(purpose: string, userId?: string, version = 1): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const userPart = userId ? `_${userId.slice(0, 8)}` : '';
    return `${purpose}_${timestamp}_v${version}${userPart}_${random}`;
  }

  private async storeEncryptedKey(keyId: string, key: Buffer): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    
    // For this implementation, we'll use a simple master key approach
    // In production, this would integrate with HSM or cloud KMS
    const masterKey = this.getMasterKey();
    const iv = crypto.randomBytes(16); // 128-bit IV for CBC
    const salt = crypto.randomBytes(32);
    
    const cipher = crypto.createCipheriv('aes-256-cbc', masterKey, iv);
    let encrypted = cipher.update(key, undefined, 'base64');
    encrypted += cipher.final('base64');
    
    // Create authentication tag (simplified)
    const tag = crypto.createHash('sha256').update(encrypted + keyId).digest('base64').slice(0, 22);

    const encryptedKey: EncryptedKey = {
      keyId,
      encryptedKey: encrypted,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag
    };

    await db.collection('encrypted_keys').doc(keyId).set(encryptedKey);
  }

  private async getEncryptedKey(keyId: string): Promise<EncryptedKey | null> {
    if (!db) throw new Error('Database not initialized');
    
    const doc = await db.collection('encrypted_keys').doc(keyId).get();
    return doc.exists ? doc.data() as EncryptedKey : null;
  }

  private async decryptStoredKey(encryptedKey: EncryptedKey): Promise<Buffer> {
    const masterKey = this.getMasterKey();
    
    // Verify tag
    const expectedTag = crypto.createHash('sha256')
      .update(encryptedKey.encryptedKey + encryptedKey.keyId)
      .digest('base64').slice(0, 22);
    
    if (expectedTag !== encryptedKey.tag) {
      throw new Error('Key authentication failed');
    }
    
    const iv = Buffer.from(encryptedKey.iv, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', masterKey, iv);
    let decrypted = decipher.update(encryptedKey.encryptedKey, 'base64');
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }

  private async storeKeyMetadata(metadata: KeyMetadata): Promise<void> {
    if (!db) throw new Error('Database not initialized');
    
    await db.collection('encryption_keys').doc(metadata.keyId).set(metadata);
  }

  private getMasterKey(): Buffer {
    // In production, this would come from environment variables or HSM
    // For testing, we use a deterministic key
    const masterKeyMaterial = process.env['MASTER_KEY'] || 'default-master-key-for-testing-only';
    return crypto.scryptSync(masterKeyMaterial, 'master-salt', 32);
  }
}

// Export singleton instance
export const keyManagementService = KeyManagementService.getInstance();

// Key management utilities for testing and administration
export class KeyManagementUtils {
  private service = keyManagementService;

  /**
   * Initialize key management system with default keys
   */
  async initializeSystem(userId?: string): Promise<void> {
    console.log('Initializing key management system...');
    
    // Generate default keys for different purposes
    const purposes: Array<'message' | 'search' | 'suggestion' | 'general'> = ['message', 'search', 'suggestion', 'general'];
    
    for (const purpose of purposes) {
      try {
        const keyParams: {
          purpose: 'message' | 'search' | 'suggestion' | 'general';
          expiresIn: number;
          userId?: string;
        } = {
          purpose,
          expiresIn: 90 * 24 * 60 * 60 * 1000 // 90 days
        };
        
        if (userId) {
          keyParams.userId = userId;
        }
        
        const metadata = await this.service.generateKey(keyParams);
        console.log(`Generated ${purpose} key: ${metadata.keyId}`);
      } catch (error) {
        console.error(`Failed to generate ${purpose} key:`, error);
      }
    }
  }

  /**
   * Generate test keys for development
   */
  async generateTestKeys(): Promise<{ [purpose: string]: KeyMetadata }> {
    const testUser = 'test@example.com';
    const keys: { [purpose: string]: KeyMetadata } = {};
    
    const purposes: Array<'message' | 'search' | 'suggestion'> = ['message', 'search', 'suggestion'];
    
    for (const purpose of purposes) {
      keys[purpose] = await this.service.generateKey({
        userId: testUser,
        purpose,
        expiresIn: 24 * 60 * 60 * 1000 // 1 day for testing
      });
    }
    
    return keys;
  }

  /**
   * Backup key metadata (not the actual keys for security)
   */
  async backupKeyMetadata(): Promise<KeyMetadata[]> {
    return await this.service.listKeys({ includeExpired: true });
  }

  /**
   * Get key management system statistics
   */
  async getSystemStats(): Promise<{
    health: any;
    keysByPurpose: { [purpose: string]: number };
    keysByUser: { [userId: string]: number };
    rotationHistory: Array<{ from: string; to: string; rotatedAt: Date }>;
  }> {
    const health = await this.service.getKeySystemHealth();
    const allKeys = await this.service.listKeys({ includeExpired: true });
    
    const keysByPurpose = allKeys.reduce((acc, key) => {
      acc[key.purpose] = (acc[key.purpose] || 0) + 1;
      return acc;
    }, {} as { [purpose: string]: number });
    
    const keysByUser = allKeys.reduce((acc, key) => {
      const userId = key.userId || 'system';
      acc[userId] = (acc[userId] || 0) + 1;
      return acc;
    }, {} as { [userId: string]: number });
    
    const rotationHistory = allKeys
      .filter(key => key.rotatedFrom)
      .map(key => ({
        from: key.rotatedFrom!,
        to: key.keyId,
        rotatedAt: key.createdAt
      }));
    
    return {
      health,
      keysByPurpose,
      keysByUser,
      rotationHistory
    };
  }
}

export const keyManagementUtils = new KeyManagementUtils(); 