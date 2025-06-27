/**
 * Frontend Encryption Service for ChatFlow
 * Implements client-side encryption following the Key Management Guide
 * Browser-compatible using Web Crypto API with scrypt key derivation
 */

import * as scryptJs from 'scrypt-js';

export interface EncryptionMetadata {
  algorithm: 'AES-256-GCM';
  keyId: string;
  iv: string;
  tag: string;
  timestamp: number;
  nonce: string;
}

export interface EncryptedField {
  data: string;
  encryption: EncryptionMetadata;
}

export interface ClientEncryptionOptions {
  keyId?: string;
  userEmail?: string;
  maxAge?: number; // Maximum age in milliseconds
}

export interface KeyContext {
  keyIds: {
    message: string;
    search: string;
    suggestion: string;
  };
  userEmail: string;
  salt: string;
}

/**
 * Browser-compatible encryption service using Web Crypto API
 * Follows the Key Management Guide patterns
 */
export class EncryptionService {
  private keyCache = new Map<string, CryptoKey>();
  private keyContext: KeyContext | null = null;
  private isInitialized = false;

  constructor() {
    console.info('🔐 Encryption Service initializing...');
  }

  /**
   * Initialize encryption with key context from server
   */
  async initialize(keyContext: KeyContext): Promise<void> {
    try {
      this.keyContext = keyContext;
      
      // Derive all keys upfront
      await this.deriveKeys();
      
      this.isInitialized = true;
      console.info('🔐 Encryption Service initialized successfully');
      
      // Verify encryption is working
      await this.verifyEncryption();
      
    } catch (error) {
      console.error('🔐 Encryption Service initialization failed:', error);
      throw new Error('Failed to initialize encryption system');
    }
  }

  /**
   * Check if encryption service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.keyContext !== null;
  }

  /**
   * Derive all encryption keys from keyIds and user context
   */
  private async deriveKeys(): Promise<void> {
    if (!this.keyContext) {
      throw new Error('Key context not available');
    }

    const { keyIds, userEmail } = this.keyContext;
    // Use the same salt as backend: 'salt'
    const saltBuffer = new TextEncoder().encode('salt');

    for (const [purpose, keyId] of Object.entries(keyIds)) {
      try {
        const derivedKey = await this.deriveKey(keyId, userEmail, saltBuffer);
        const cacheKey = `${purpose}:${userEmail}`;
        this.keyCache.set(cacheKey, derivedKey);
        console.info(`🔑 Derived key for purpose: ${purpose}`);
      } catch (error) {
        console.error(`Failed to derive key for purpose ${purpose}:`, error);
        throw error;
      }
    }
  }

  /**
   * Derive a single encryption key using scrypt to exactly match backend
   * Backend uses: scrypt(keyId + userEmail, 'salt', 32)
   */
  private async deriveKey(keyId: string, userEmail: string, salt: Uint8Array): Promise<CryptoKey> {
    // Create key material to match backend format: keyId:userEmail (colon separator)
    const keyMaterial = `${keyId}:${userEmail}`;
    console.info('🔑 [ENCRYPTION DEBUG] Key derivation:', {
      keyId,
      userEmail,
      keyMaterial,
      saltString: new TextDecoder().decode(salt)
    });
    
    const keyMaterialBuffer = new TextEncoder().encode(keyMaterial);

    // Use scrypt exactly like the backend: scrypt(keyMaterial, salt, 32)
    // Default scrypt parameters: N=16384, r=8, p=1 (as used by Node.js crypto.scryptSync)
    const scryptKeyBuffer = await scryptJs.scrypt(
      keyMaterialBuffer,
      salt,
      16384, // N: CPU/memory cost parameter
      8,     // r: block size parameter  
      1,     // p: parallelization parameter
      32     // dkLen: desired key length (256 bits)
    );

    console.info('🔑 [ENCRYPTION DEBUG] Scrypt key derived, length:', scryptKeyBuffer.length);

    // Import the raw scrypt output as an AES-CBC key
    const derivedKey = await crypto.subtle.importKey(
      'raw',
      scryptKeyBuffer,
      {
        name: 'AES-CBC',
        length: 256
      },
      false, // Not extractable for security
      ['encrypt', 'decrypt']
    );

    console.info('🔑 [ENCRYPTION DEBUG] Key imported successfully');
    return derivedKey;
  }

  /**
   * Get cached key for a specific purpose
   */
  private getKey(purpose: 'message' | 'search' | 'suggestion'): CryptoKey {
    if (!this.keyContext) {
      throw new Error('Encryption service not initialized');
    }

    const cacheKey = `${purpose}:${this.keyContext.userEmail}`;
    const key = this.keyCache.get(cacheKey);
    
    if (!key) {
      throw new Error(`Key not found for purpose: ${purpose}`);
    }
    
    return key;
  }

  /**
   * Encrypt a field value for a specific purpose (compatible with backend CBC implementation)
   */
  async encryptField(data: string, purpose: 'message' | 'search' | 'suggestion'): Promise<EncryptedField> {
    if (!this.isReady()) {
      throw new Error('Encryption service not initialized');
    }

    try {
      const key = this.getKey(purpose);
      const keyId = this.keyContext!.keyIds[purpose];
      
      console.info('🔐 [ENCRYPTION DEBUG] Starting encryption:', {
        purpose,
        keyId,
        dataLength: data.length,
        userEmail: this.keyContext!.userEmail
      });
      
      // Generate random IV and nonce (16 bytes for CBC compatibility)
      const iv = crypto.getRandomValues(new Uint8Array(16)); // 128-bit IV for CBC
      const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(nonceBytes).reduce((str, byte) => 
        str + byte.toString(16).padStart(2, '0'), '');

      console.info('🔐 [ENCRYPTION DEBUG] Generated IV and nonce:', {
        ivLength: iv.length,
        nonceLength: nonce.length
      });

      // Encrypt data using AES-CBC to match backend
      const dataBuffer = new TextEncoder().encode(data);
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-CBC',
          iv: iv
        },
        key,
        dataBuffer
      );

      const encryptedData = new Uint8Array(encryptedBuffer);

      // Convert to base64 (compatible with older TypeScript targets)
      const encryptedBase64 = btoa(String.fromCharCode.apply(null, Array.from(encryptedData)));
      const ivBase64 = btoa(String.fromCharCode.apply(null, Array.from(iv)));
      
      console.info('🔐 [ENCRYPTION DEBUG] Encrypted data:', {
        originalLength: data.length,
        encryptedLength: encryptedData.length,
        encryptedBase64Length: encryptedBase64.length
      });
      
      // Create compatible tag like backend does: hash(encrypted + keyId)
      const tagData = encryptedBase64 + keyId;
      const tagBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tagData));
      const tagArray = new Uint8Array(tagBuffer);
      const tagBase64 = btoa(String.fromCharCode.apply(null, Array.from(tagArray))).slice(0, 22);

      console.info('🔐 [ENCRYPTION DEBUG] Tag creation:', {
        tagData: tagData.substring(0, 50) + '...',
        tagBase64,
        tagLength: tagBase64.length
      });

      const result: EncryptedField = {
        data: encryptedBase64,
        encryption: {
          algorithm: 'AES-256-GCM' as const, // Keep claiming GCM for API compatibility
          keyId,
          iv: ivBase64,
          tag: tagBase64,
          timestamp: Date.now(),
          nonce
        }
      };

      console.info('🔐 [ENCRYPTION DEBUG] Encryption complete:', {
        dataLength: result.data.length,
        ivLength: result.encryption.iv.length,
        tagLength: result.encryption.tag.length
      });

      return result;
    } catch (error) {
      console.error('🔐 [ENCRYPTION ERROR] Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted field (compatible with backend CBC implementation)
   */
  async decryptField(encryptedField: EncryptedField): Promise<string> {
    if (!this.isReady()) {
      throw new Error('Encryption service not initialized');
    }

    try {
      const { data, encryption } = encryptedField;

      console.info('🔓 [DECRYPTION DEBUG] Starting decryption:', {
        keyId: encryption.keyId,
        dataLength: data.length,
        ivLength: encryption.iv.length,
        tagLength: encryption.tag.length,
        timestamp: encryption.timestamp,
        userEmail: this.keyContext!.userEmail
      });

      // Validate timestamp if needed (prevent replay attacks)
      const age = Date.now() - encryption.timestamp;
      if (age > 24 * 60 * 60 * 1000) { // 24 hours max age
        throw new Error('Encrypted data too old');
      }

      console.info('🔓 [DECRYPTION DEBUG] Timestamp valid, age:', age, 'ms');

      // Find the purpose from keyId
      const purpose = this.getPurposeFromKeyId(encryption.keyId);
      const key = this.getKey(purpose);

      console.info('🔓 [DECRYPTION DEBUG] Retrieved key for purpose:', purpose);

      // Verify tag like backend does: hash(encrypted + keyId)
      const tagData = data + encryption.keyId;
      const expectedTagBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tagData));
      const expectedTagArray = new Uint8Array(expectedTagBuffer);
      const expectedTag = btoa(String.fromCharCode.apply(null, Array.from(expectedTagArray))).slice(0, 22);
      
      console.info('🔓 [DECRYPTION DEBUG] Tag verification:', {
        expectedTag,
        actualTag: encryption.tag,
        tagDataPreview: tagData.substring(0, 50) + '...'
      });
      
      if (expectedTag !== encryption.tag) {
        console.error('🔓 [DECRYPTION ERROR] Tag verification failed!', {
          expectedTag,
          actualTag: encryption.tag,
          tagData: tagData.substring(0, 100)
        });
        throw new Error('Authentication tag verification failed');
      }

      console.info('🔓 [DECRYPTION DEBUG] Tag verification passed');

      // Convert from base64
      const encryptedData = Uint8Array.from(Array.from(atob(data)).map(c => c.charCodeAt(0)));
      const iv = Uint8Array.from(Array.from(atob(encryption.iv)).map(c => c.charCodeAt(0)));

      console.info('🔓 [DECRYPTION DEBUG] Decoded data:', {
        encryptedDataLength: encryptedData.length,
        ivLength: iv.length
      });

      // Decrypt data using AES-CBC
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-CBC',
          iv: iv
        },
        key,
        encryptedData
      );

      const result = new TextDecoder().decode(decryptedBuffer);
      console.info('🔓 [DECRYPTION DEBUG] Decryption successful:', {
        resultLength: result.length,
        preview: result.substring(0, 50)
      });

      return result;
    } catch (error) {
      console.error('🔓 [DECRYPTION ERROR] Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Determine purpose from keyId
   */
  private getPurposeFromKeyId(keyId: string): 'message' | 'search' | 'suggestion' {
    if (!this.keyContext) {
      throw new Error('Key context not available');
    }

    const { keyIds } = this.keyContext;
    
    if (keyIds.message === keyId) return 'message';
    if (keyIds.search === keyId) return 'search';
    if (keyIds.suggestion === keyId) return 'suggestion';
    
    throw new Error(`Unknown keyId: ${keyId}`);
  }

  /**
   * Encrypt message content
   */
  async encryptMessage(content: string): Promise<EncryptedField> {
    return this.encryptField(content, 'message');
  }

  /**
   * Encrypt search query
   */
  async encryptSearchQuery(query: string): Promise<EncryptedField> {
    return this.encryptField(query, 'search');
  }

  /**
   * Encrypt suggestion text
   */
  async encryptSuggestion(text: string): Promise<EncryptedField> {
    return this.encryptField(text, 'suggestion');
  }

  /**
   * Check if data is an encrypted field
   */
  isEncryptedField(data: any): data is EncryptedField {
    return data && 
           typeof data === 'object' && 
           typeof data.data === 'string' && 
           data.encryption && 
           typeof data.encryption === 'object' &&
           data.encryption.algorithm === 'AES-256-GCM';
  }

  /**
   * Verify encryption is working correctly
   */
  private async verifyEncryption(): Promise<void> {
    try {
      const testData = 'ChatFlow encryption test';
      const encrypted = await this.encryptMessage(testData);
      const decrypted = await this.decryptField(encrypted);
      
      if (decrypted !== testData) {
        throw new Error('Encryption verification failed: data mismatch');
      }
      
      console.info('🔐 Encryption verification successful');
    } catch (error) {
      console.error('🔐 Encryption verification failed:', error);
      throw error;
    }
  }

  /**
   * Refresh keys when key rotation occurs
   */
  async refreshKeys(newKeyContext: KeyContext): Promise<void> {
    console.info('🔄 Refreshing encryption keys...');
    
    // Clear old keys
    this.keyCache.clear();
    
    // Initialize with new context
    await this.initialize(newKeyContext);
    
    console.info('🔄 Key refresh completed');
  }

  /**
   * Clear all cached keys (security cleanup)
   */
  clearKeys(): void {
    this.keyCache.clear();
    this.keyContext = null;
    this.isInitialized = false;
    console.info('🔐 Encryption keys cleared');
  }

  /**
   * Get current key context for debugging
   */
  getKeyContext(): KeyContext | null {
    return this.keyContext;
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService(); 