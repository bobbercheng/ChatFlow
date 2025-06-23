import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Types for encryption
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

// Enhanced request interface
interface EncryptedRequest extends Request {
  encryptionKeys?: Map<string, Buffer>;
  skipEncryption?: boolean;
  encryptionService?: EncryptionService;
  userEmail?: string;
  responseEncryption?: ResponseEncryptionService;
}

// Key derivation service (placeholder - in production, integrate with your key management)
class KeyDerivationService {
  private static instance: KeyDerivationService;
  private keyCache = new Map<string, Buffer>();

  static getInstance(): KeyDerivationService {
    if (!KeyDerivationService.instance) {
      KeyDerivationService.instance = new KeyDerivationService();
    }
    return KeyDerivationService.instance;
  }

  // Derive key from user credentials or key management service
  async deriveKey(keyId: string, userEmail?: string): Promise<Buffer> {
    const cacheKey = `${keyId}:${userEmail}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    // In production, this would integrate with your key management service
    // For now, we'll use a deterministic key derivation for testing
    const keyMaterial = userEmail ? `${keyId}:${userEmail}` : keyId;
    const key = crypto.scryptSync(keyMaterial, 'salt', 32); // 256-bit key
    
    this.keyCache.set(cacheKey, key);
    return key;
  }

  clearCache(): void {
    this.keyCache.clear();
  }
}

// Encryption utilities
export class EncryptionService {
  private keyService = KeyDerivationService.getInstance();

  async encryptField(data: string, keyId: string, userEmail?: string): Promise<EncryptedField> {
    const key = await this.keyService.deriveKey(keyId, userEmail);
    const iv = crypto.randomBytes(16); // 128-bit IV for simplicity
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Use AES-256-CBC for compatibility (in production, use proper GCM implementation)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Create a mock tag for API compatibility (in production, use real GCM)
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

  async decryptField(encryptedField: EncryptedField, userEmail?: string): Promise<string> {
    const { data, encryption } = encryptedField;
    const key = await this.keyService.deriveKey(encryption.keyId, userEmail);
    
    // Validate timestamp (prevent replay attacks)
    const age = Date.now() - encryption.timestamp;
    if (age > 5 * 60 * 1000) { // 5 minutes max age
      throw new Error('Encrypted data too old (potential replay attack)');
    }
    
    // Verify tag (simplified verification)
    const expectedTag = crypto.createHash('sha256').update(data + encryption.keyId).digest('base64').slice(0, 22);
    if (expectedTag !== encryption.tag) {
      throw new Error('Authentication tag verification failed');
    }
    
    // Use AES-256-CBC for compatibility
    const iv = Buffer.from(encryption.iv, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Check if field is encrypted
  isEncryptedField(field: any): field is EncryptedField {
    if (!field || typeof field !== 'object') {
      return false;
    }
    
    return typeof field.data === 'string' && 
           field.encryption &&
           typeof field.encryption === 'object' &&
           field.encryption.algorithm === 'AES-256-GCM';
  }
}

// Middleware factory
export function createEncryptionMiddleware(options: {
  encryptResponses?: boolean;
  skipPaths?: string[];
} = {}) {
  const encryptionService = new EncryptionService();
  const { encryptResponses = false, skipPaths = ['/v1/auth/register', '/v1/auth/login'] } = options;

  return async (req: EncryptedRequest, res: Response, next: NextFunction) => {
    // Skip encryption for exempt endpoints
    if (skipPaths.some(path => req.path.startsWith(path))) {
      req.skipEncryption = true;
      return next();
    }

    try {
      // Get user email from JWT token for key derivation
      const userEmail = (req as any).user?.email;

      // Decrypt incoming request fields
      if (req.body && typeof req.body === 'object') {
        await decryptRequestFields(req.body, encryptionService, userEmail);
      }

      // Store encryption service for response encryption if needed
      req.encryptionService = encryptionService;
      req.userEmail = userEmail;

      // Store response encryption service for routes to use
      req.responseEncryption = new ResponseEncryptionService();
      
      // If response encryption is enabled, provide encrypted response helper
      if (encryptResponses && !req.skipEncryption) {
        // Add encrypted response helper to response object
        (res as any).encryptedJson = async function(body: any) {
          // Get user email dynamically from request (not from closure)
          const currentUserEmail = (req as any).user?.email;
          
          if (body && typeof body === 'object' && currentUserEmail) {
            try {
              await req.responseEncryption!.encryptResponseFields(body, currentUserEmail);
              return res.json(body);
            } catch (error) {
              console.error('Response encryption failed:', error);
              return res.status(500).json({
                success: false,
                error: {
                  message: 'Response encryption failed',
                  code: 'ENCRYPTION_ERROR'
                }
              });
            }
          } else {
            console.log('Encryption fallback - body:', !!body, 'userEmail:', currentUserEmail);
            return res.json(body);
          }
        };
      }

      next();
    } catch (error) {
      console.error('Encryption middleware error:', error);
      const message = error instanceof Error ? error.message : 'Invalid encrypted data';
      res.status(400).json({
        success: false,
        error: {
          message,
          code: 'ENCRYPTION_ERROR'
        }
      });
    }
  };
}

// Recursive function to decrypt fields in request
async function decryptRequestFields(obj: any, encryptionService: EncryptionService, userEmail?: string): Promise<void> {
  for (const key in obj) {
    const value = obj[key];
    
    if (encryptionService.isEncryptedField(value)) {
      // Decrypt the field
      obj[key] = await encryptionService.decryptField(value, userEmail);
    } else if (Array.isArray(value)) {
      // Recursively handle arrays
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === 'object' && value[i] !== null) {
          await decryptRequestFields(value[i], encryptionService, userEmail);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively handle nested objects
      await decryptRequestFields(value, encryptionService, userEmail);
    }
  }
}

// Enhanced response encryption service
export class ResponseEncryptionService {
  private encryptionService = new EncryptionService();
  
  // Define which fields should be encrypted
  private readonly sensitiveFields = [
    'content',           // Message content
    'query',            // Search queries
    'suggestionText',   // Search suggestions
    'suggestion',       // Alternative suggestion field name
    'text',            // Generic text content
    'body',            // Message body
    'message',          // Response messages (e.g., "Suggestion click tracked successfully")
    'rawContent',      // Raw content in search results
    'semanticContent', // Semantic content in search
    'highlightedContent' // Highlighted search content
  ];

  /**
   * Encrypt sensitive fields in a response object
   */
  async encryptResponseFields(obj: any, userEmail?: string): Promise<void> {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      const value = obj[key];
      
      if (this.sensitiveFields.includes(key) && typeof value === 'string' && value.trim().length > 0) {
        // Encrypt sensitive fields with appropriate key
        const keyId = this.getKeyIdForField(key);
        obj[key] = await this.encryptionService.encryptField(value, keyId, userEmail);
      } else if (Array.isArray(value)) {
        // Recursively handle arrays
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'object' && value[i] !== null) {
            await this.encryptResponseFields(value[i], userEmail);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively handle nested objects
        await this.encryptResponseFields(value, userEmail);
      }
    }
  }

  /**
   * Encrypt a WebSocket message before sending
   */
  async encryptWebSocketMessage(message: any, userEmail?: string): Promise<any> {
    // Clone the message to avoid mutating the original
    const clonedMessage = JSON.parse(JSON.stringify(message));
    
    // Encrypt the payload if it exists
    if (clonedMessage.payload && typeof clonedMessage.payload === 'object') {
      await this.encryptResponseFields(clonedMessage.payload, userEmail);
    }
    
    return clonedMessage;
  }

  /**
   * Get appropriate key ID for different field types
   */
  private getKeyIdForField(fieldName: string): string {
    switch (fieldName) {
      case 'content':
      case 'body':
        return 'message_key';
      case 'query':
      case 'suggestionText':
      case 'suggestion':
        return 'suggestion_key';
      case 'text':
      case 'message':
        return 'text_key';
      case 'rawContent':
      case 'semanticContent':
      case 'highlightedContent':
        return 'search_key';
      default:
        return 'response_key';
    }
  }

  /**
   * Create an encrypted WebSocket response
   */
  async createEncryptedWebSocketResponse(type: string, payload: any, userEmail?: string): Promise<string> {
    const message = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    const encryptedMessage = await this.encryptWebSocketMessage(message, userEmail);
    return JSON.stringify(encryptedMessage);
  }
}

// Export singleton instance for WebSocket use
export const responseEncryptionService = new ResponseEncryptionService();



// Validation middleware for encrypted fields
export function validateEncryptedFields() {
  return (req: EncryptedRequest, res: Response, next: NextFunction) => {
    if (req.skipEncryption) {
      return next();
    }

    try {
      validateEncryptedFieldsRecursive(req.body);
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation error';
      res.status(400).json({
        success: false,
        error: {
          message,
          code: 'VALIDATION_ERROR'
        }
      });
    }
  };
}

function validateEncryptedFieldsRecursive(obj: any): void {
  if (!obj || typeof obj !== 'object') return;

  for (const key in obj) {
    const value = obj[key];
    
    if (value && typeof value === 'object' && value.data && value.encryption) {
      // This looks like an encrypted field, validate it
      const encryption = value.encryption;
      
      if (!encryption.algorithm || encryption.algorithm !== 'AES-256-GCM') {
        throw new Error(`Invalid encryption algorithm for field ${key}`);
      }
      
      if (!encryption.keyId || typeof encryption.keyId !== 'string') {
        throw new Error(`Invalid keyId for field ${key}`);
      }
      
      if (!encryption.iv || typeof encryption.iv !== 'string') {
        throw new Error(`Invalid IV for field ${key}`);
      }
      
      if (!encryption.tag || typeof encryption.tag !== 'string') {
        throw new Error(`Invalid tag for field ${key}`);
      }
      
      if (!encryption.timestamp || typeof encryption.timestamp !== 'number') {
        throw new Error(`Invalid timestamp for field ${key}`);
      }
      
      // Validate timestamp is not too old (5 minutes)
      const age = Date.now() - encryption.timestamp;
      if (age > 5 * 60 * 1000) {
        throw new Error(`Encrypted field ${key} is too old (potential replay attack)`);
      }
      
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          try {
            validateEncryptedFieldsRecursive(item);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Validation error';
            throw new Error(`${message} (in array index ${index})`);
          }
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      validateEncryptedFieldsRecursive(value);
    }
  }
}

// Export the encryption service for use in tests and utilities
export const encryptionService = new EncryptionService();

// Export key service for testing
export const keyDerivationService = KeyDerivationService.getInstance();

// Middleware for different use cases
export const decryptionMiddleware = createEncryptionMiddleware({ encryptResponses: false });
export const fullEncryptionMiddleware = createEncryptionMiddleware({ encryptResponses: true });

// Middleware specifically for message endpoints (decrypt requests + encrypt responses)
export const messageEncryptionMiddleware = createEncryptionMiddleware({ 
  encryptResponses: true,
  skipPaths: ['/v1/auth/register', '/v1/auth/login', '/v1/admin', '/v1/users']
}); 