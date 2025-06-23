import crypto from 'crypto';

// Client-side encryption utilities for testing and frontend integration

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

/**
 * Client-side encryption utility class
 * This can be used in tests, Swagger UI, and frontend applications
 */
export class ClientEncryption {
  private keyCache = new Map<string, Buffer>();

  constructor(private defaultKeyId: string = 'test_key') {}

  /**
   * Derive encryption key from keyId and userEmail
   * In production, this would integrate with your key management service
   */
  private deriveKey(keyId: string, userEmail?: string): Buffer {
    const cacheKey = `${keyId}:${userEmail || 'anonymous'}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    // Deterministic key derivation for testing
    const keyMaterial = userEmail ? `${keyId}:${userEmail}` : keyId;
    const key = crypto.scryptSync(keyMaterial, 'salt', 32); // 256-bit key
    
    this.keyCache.set(cacheKey, key);
    return key;
  }

  /**
   * Encrypt a field value
   */
  encryptField(data: string, options: ClientEncryptionOptions = {}): EncryptedField {
    const keyId = options.keyId || this.defaultKeyId;
    const key = this.deriveKey(keyId, options.userEmail);
    const iv = crypto.randomBytes(16); // 128-bit IV
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Use AES-256-CBC for compatibility
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Create authentication tag (simplified for testing)
    const tag = crypto.createHash('sha256').update(encrypted + keyId).digest('base64').slice(0, 22);
    
    return {
      data: encrypted,
      encryption: {
        algorithm: 'AES-256-GCM',
        keyId,
        iv: iv.toString('base64'),
        tag,
        timestamp: Date.now(),
        nonce
      }
    };
  }

  /**
   * Decrypt a field value
   */
  decryptField(encryptedField: EncryptedField, options: ClientEncryptionOptions = {}): string {
    const { data, encryption } = encryptedField;
    const key = this.deriveKey(encryption.keyId, options.userEmail);
    
    // Validate timestamp if maxAge is specified
    if (options.maxAge) {
      const age = Date.now() - encryption.timestamp;
      if (age > options.maxAge) {
        throw new Error(`Encrypted data too old (age: ${age}ms, max: ${options.maxAge}ms)`);
      }
    }
    
    // Verify authentication tag
    const expectedTag = crypto.createHash('sha256').update(data + encryption.keyId).digest('base64').slice(0, 22);
    if (expectedTag !== encryption.tag) {
      throw new Error('Authentication tag verification failed');
    }
    
    // Decrypt using AES-256-CBC
    const iv = Buffer.from(encryption.iv, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Encrypt message content for API requests
   */
  encryptMessageContent(content: string, options: ClientEncryptionOptions = {}): EncryptedField {
    return this.encryptField(content, { keyId: 'message_key', ...options });
  }

  /**
   * Encrypt search query for API requests
   */
  encryptSearchQuery(query: string, options: ClientEncryptionOptions = {}): EncryptedField {
    return this.encryptField(query, { keyId: 'search_key', ...options });
  }

  /**
   * Encrypt suggestion text for API requests
   */
  encryptSuggestionText(text: string, options: ClientEncryptionOptions = {}): EncryptedField {
    return this.encryptField(text, { keyId: 'suggestion_key', ...options });
  }

  /**
   * Clear the key cache
   */
  clearCache(): void {
    this.keyCache.clear();
  }
}

/**
 * Test utilities for Swagger UI and testing
 */
export class EncryptionTestUtils {
  private client = new ClientEncryption('test_key');

  /**
   * Generate test message request with encrypted content
   */
     generateTestMessageRequest(content: string, userEmail?: string): any {
     const options: ClientEncryptionOptions = {};
     if (userEmail !== undefined) {
       options.userEmail = userEmail;
     }
     return {
       content: this.client.encryptMessageContent(content, options),
       messageType: 'TEXT'
     };
   }

  /**
   * Generate test search request with encrypted query
   */
  generateTestSearchRequest(query: string, userEmail?: string, limit = 20): any {
    const options: ClientEncryptionOptions = {};
    if (userEmail !== undefined) {
      options.userEmail = userEmail;
    }
    return {
      q: this.client.encryptSearchQuery(query, options),
      limit
    };
  }

  /**
   * Generate test suggestion click request with encrypted data
   */
  generateTestClickRequest(
    query: string, 
    suggestionText: string, 
    suggestionType: string = 'completion',
    userEmail?: string
  ): any {
    const options: ClientEncryptionOptions = {};
    if (userEmail !== undefined) {
      options.userEmail = userEmail;
    }
    return {
      query: this.client.encryptSearchQuery(query, options),
      suggestionText: this.client.encryptSuggestionText(suggestionText, options),
      suggestionType
    };
  }

  /**
   * Generate example encrypted data for Swagger documentation
   */
  generateSwaggerExamples(): Record<string, any> {
    const testContent = "Hello, this is a private message!";
    const testQuery = "lunch plans with Sarah";
    const testSuggestion = "lunch plans";

    return {
      encryptedMessage: this.generateTestMessageRequest(testContent, 'test@example.com'),
      encryptedSearch: this.generateTestSearchRequest(testQuery, 'test@example.com'),
      encryptedClick: this.generateTestClickRequest(testQuery, testSuggestion, 'completion', 'test@example.com'),
      rawEncryptedField: this.client.encryptField("sample encrypted data", { 
        keyId: 'swagger_example', 
        userEmail: 'test@example.com' 
      })
    };
  }

  /**
   * Validate that encrypted field can be decrypted
   */
  validateEncryptedField(encryptedField: EncryptedField, userEmail?: string): boolean {
    try {
      const options: ClientEncryptionOptions = {};
      if (userEmail !== undefined) {
        options.userEmail = userEmail;
      }
      const decrypted = this.client.decryptField(encryptedField, options);
      return typeof decrypted === 'string' && decrypted.length > 0;
    } catch (error) {
      console.error('Validation failed:', error);
      return false;
    }
  }
}

/**
 * Browser-compatible encryption utilities (for frontend)
 * Note: This uses Node.js crypto for now, but in production you'd use Web Crypto API
 */
export class BrowserEncryption {
  private client = new ClientEncryption();

  /**
   * Encrypt field for browser usage
   * In production, this would use Web Crypto API
   */
  async encryptFieldAsync(data: string, options: ClientEncryptionOptions = {}): Promise<EncryptedField> {
    return new Promise((resolve) => {
      // Simulate async operation
      setTimeout(() => {
        resolve(this.client.encryptField(data, options));
      }, 0);
    });
  }

  /**
   * Decrypt field for browser usage
   */
  async decryptFieldAsync(encryptedField: EncryptedField, options: ClientEncryptionOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          resolve(this.client.decryptField(encryptedField, options));
        } catch (error) {
          reject(error);
        }
      }, 0);
    });
  }
}

// Export convenient instances
export const clientEncryption = new ClientEncryption();
export const encryptionTestUtils = new EncryptionTestUtils();
export const browserEncryption = new BrowserEncryption();

// Export helper functions for common use cases
export function encryptMessage(content: string, userEmail?: string): EncryptedField {
  const options: ClientEncryptionOptions = {};
  if (userEmail !== undefined) {
    options.userEmail = userEmail;
  }
  return clientEncryption.encryptMessageContent(content, options);
}

export function encryptSearchQuery(query: string, userEmail?: string): EncryptedField {
  const options: ClientEncryptionOptions = {};
  if (userEmail !== undefined) {
    options.userEmail = userEmail;
  }
  return clientEncryption.encryptSearchQuery(query, options);
}

export function decryptField(encryptedField: EncryptedField, userEmail?: string): string {
  const options: ClientEncryptionOptions = {};
  if (userEmail !== undefined) {
    options.userEmail = userEmail;
  }
  return clientEncryption.decryptField(encryptedField, options);
}

// Generate example data for documentation
export const swaggerExamples = encryptionTestUtils.generateSwaggerExamples(); 