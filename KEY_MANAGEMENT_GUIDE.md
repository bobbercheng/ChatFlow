# ChatFlow Key Management System - Technical Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Key Management Architecture](#key-management-architecture)
3. [Admin Key Management](#admin-key-management)
4. [Client-Side Encryption](#client-side-encryption)
5. [Message Encryption](#message-encryption)
6. [Search Query Encryption](#search-query-encryption)
7. [API Integration Examples](#api-integration-examples)
8. [Security Best Practices](#security-best-practices)
9. [Troubleshooting](#troubleshooting)

## System Overview

ChatFlow implements a sophisticated field-level encryption system designed to prevent message leakage through proxy servers while maintaining full API functionality and testability. The system uses client-side key derivation with server-coordinated key management.

### Key Security Principles

- **Zero Key Transmission**: Actual encryption keys are never sent over the network
- **Client-Side Derivation**: Keys are derived locally using `scrypt(keyId + userEmail, salt, 32)`
- **Perfect Forward Secrecy**: Automatic key rotation ensures old messages remain secure
- **User Isolation**: Each user gets unique derived keys from the same keyId
- **Proxy-Safe**: Even compromised proxy servers cannot access encryption keys

## Key Management Architecture

### Key Hierarchy

```
Master Key (Server-only)
├── System Keys (per purpose)
│   ├── message_key_v1
│   ├── search_key_v1
│   └── suggestion_key_v1
└── User-Derived Keys (client-side)
    ├── scrypt(message_key_v1 + user@email.com, salt, 32)
    ├── scrypt(search_key_v1 + user@email.com, salt, 32)
    └── scrypt(suggestion_key_v1 + user@email.com, salt, 32)
```

### Key Lifecycle

1. **Initialization**: System creates initial keys for each purpose
2. **Distribution**: KeyIds (not keys) are distributed to clients
3. **Derivation**: Clients derive actual keys using keyId + userEmail
4. **Rotation**: Old keys are rotated, new keyIds distributed
5. **Cleanup**: Expired keys are securely deleted

## Admin Key Management

### System Initialization

```bash
# Initialize the key management system
curl -X POST https://api.chatflow.com/v1/admin/keys/initialize \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"adminEmail": "admin@company.com"}'
```

### Health Monitoring

```bash
# Get detailed system health
curl -X GET https://api.chatflow.com/v1/admin/keys/health \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalKeys": 15,
    "activeKeys": 12,
    "expiredKeys": 3,
    "keysNeedingRotation": 2,
    "lastRotation": "2024-01-15T10:30:00Z"
  }
}
```


### Key Rotation

```bash
# Rotate all old keys (recommended)
curl -X POST https://api.chatflow.com/v1/admin/keys/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Rotate specific key
curl -X POST https://api.chatflow.com/v1/admin/keys/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"keyId": "message_key_v1"}'
```

### Key Metadata Management

```bash
# List all active keys
curl -X GET "https://api.chatflow.com/v1/admin/keys?isActive=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# List keys by purpose
curl -X GET "https://api.chatflow.com/v1/admin/keys?purpose=message" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Include expired keys in listing
curl -X GET "https://api.chatflow.com/v1/admin/keys?includeExpired=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### System Statistics

```bash
# Get comprehensive statistics
curl -X GET https://api.chatflow.com/v1/admin/keys/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Cleanup Operations

```bash
# Remove expired keys
curl -X POST https://api.chatflow.com/v1/admin/keys/cleanup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Client-Side Encryption

### Setup and Initialization

```typescript
import { apiService } from './services/apiService';
import { EncryptionService } from './utils/encryption';

class ChatFlowClient {
  private encryptionService: EncryptionService;
  
  async initialize() {
    // Get current keyIds from server
    const keyResponse = await apiService.getCurrentKeyIds();
    const { keyIds } = keyResponse.data;
    
    // Get user context for salt and derivation info
    const contextResponse = await apiService.getUserKeyContext();
    const userContext = contextResponse.data;
    
    // Initialize encryption service
    this.encryptionService = new EncryptionService(keyIds, userContext);
  }
}
```

### Key Derivation Implementation

```typescript
import { scrypt } from 'crypto';

class EncryptionService {
  private keys: Map<string, Buffer> = new Map();
  
  constructor(keyIds: any, userContext: any) {
    this.deriveKeys(keyIds, userContext);
  }
  
  private async deriveKeys(keyIds: any, userContext: any) {
    const { userEmail } = userContext;
    const salt = Buffer.from(userContext.salt || 'chatflow-salt', 'utf8');
    
    for (const [purpose, keyId] of Object.entries(keyIds)) {
      const keyMaterial = `${keyId}_${userEmail}`;
      const derivedKey = await this.deriveKey(keyMaterial, salt);
      this.keys.set(purpose, derivedKey);
    }
  }
  
  private deriveKey(keyMaterial: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(keyMaterial, salt, 32, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });
  }
}
```


### Encryption Implementation

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

class EncryptionService {
  async encryptField(data: string, purpose: 'message' | 'search' | 'suggestion'): Promise<EncryptedField> {
    const key = this.keys.get(purpose);
    if (!key) throw new Error(`Key not found for purpose: ${purpose}`);
    
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    return {
      data: encrypted,
      encryption: {
        algorithm: 'AES-256-GCM',
        keyId: this.getCurrentKeyId(purpose),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        timestamp: Date.now(),
        nonce: randomBytes(8).toString('hex')
      }
    };
  }
  
  async decryptField(encryptedField: EncryptedField): Promise<string> {
    const { data, encryption } = encryptedField;
    const key = this.keys.get(this.getPurposeFromKeyId(encryption.keyId));
    
    if (!key) throw new Error(`Key not found for keyId: ${encryption.keyId}`);
    
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encryption.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(encryption.tag, 'base64'));
    
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

## Message Encryption

### Sending Encrypted Messages

```typescript
class MessageService {
  async sendMessage(conversationId: string, plainTextContent: string) {
    // Encrypt the message content
    const encryptedContent = await this.encryptionService.encryptField(
      plainTextContent, 
      'message'
    );
    
    // Send encrypted message
    const response = await apiService.sendMessage(conversationId, {
      content: encryptedContent,  // EncryptedField object
      messageType: 'TEXT'
    });
    
    return response;
  }
}
```

### Receiving and Decrypting Messages

```typescript
class MessageService {
  async getMessages(conversationId: string) {
    const response = await apiService.getMessages(conversationId);
    
    // Decrypt messages
    const decryptedMessages = await Promise.all(
      response.data.data.map(async (message) => {
        if (this.isEncrypted(message.content)) {
          message.content = await this.encryptionService.decryptField(message.content);
        }
        return message;
      })
    );
    
    return { ...response, data: { ...response.data, data: decryptedMessages } };
  }
  
  private isEncrypted(content: any): boolean {
    return content && typeof content === 'object' && content.encryption;
  }
}
```

### OpenAPI Schema for Encrypted Messages

```yaml
CreateMessageRequest:
  type: object
  required:
    - content
  properties:
    content:
      oneOf:
        - type: string
          description: "Plain text (not recommended for production)"
        - $ref: '#/components/schemas/EncryptedField'
      description: "Message content - should be encrypted for privacy"
```


## Search Query Encryption

### Encrypted Search Implementation

```typescript
class SearchService {
  async searchConversations(plainTextQuery: string, options = {}) {
    // Encrypt the search query
    const encryptedQuery = await this.encryptionService.encryptField(
      plainTextQuery,
      'search'
    );
    
    // Send encrypted search request using POST endpoint
    const response = await fetch('/v1/search/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        q: encryptedQuery,  // EncryptedField object
        limit: options.limit || 20
      })
    });
    
    return response.json();
  }
}
```

### Encrypted Search Suggestions

```typescript
class SearchService {
  async getSearchSuggestions(partialQuery: string = '') {
    let requestBody: any = { limit: 5 };
    
    if (partialQuery.trim()) {
      // Encrypt partial query
      const encryptedQuery = await this.encryptionService.encryptField(
        partialQuery,
        'suggestion'
      );
      requestBody.q = encryptedQuery;
    }
    
    // Use POST endpoint for encrypted queries
    const response = await fetch('/v1/search/suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
    
    return response.json();
  }
}
```

### Tracking Encrypted Suggestion Clicks

```typescript
class SearchService {
  async trackSuggestionClick(originalQuery: string, suggestionText: string, type: string) {
    // Encrypt both query and suggestion
    const encryptedQuery = await this.encryptionService.encryptField(
      originalQuery,
      'suggestion'
    );
    
    const encryptedSuggestion = await this.encryptionService.encryptField(
      suggestionText,
      'suggestion'
    );
    
    return apiService.trackSuggestionClick(
      encryptedQuery,      // EncryptedField
      encryptedSuggestion, // EncryptedField
      type                 // Plain text for analytics
    );
  }
}
```

## API Integration Examples

### Complete Frontend Integration

```typescript
import { apiService } from './services/apiService';

class ChatFlowApp {
  private encryptionService: EncryptionService;
  
  async initialize() {
    // Check if user is authenticated
    const token = localStorage.getItem('chatflow_token');
    if (token) {
      apiService.setToken(token);
      await this.setupEncryption();
    }
  }
  
  private async setupEncryption() {
    try {
      // Get current keyIds and user context
      const [keyResponse, contextResponse] = await Promise.all([
        apiService.getCurrentKeyIds(),
        apiService.getUserKeyContext()
      ]);
      
      // Initialize encryption
      this.encryptionService = new EncryptionService(
        keyResponse.data.keyIds,
        contextResponse.data
      );
      
      // Verify encryption is working
      const verification = await apiService.verifyUserKeys({
        testData: 'Hello, ChatFlow!',
        purpose: 'message'
      });
      
      if (!verification.data.verified) {
        throw new Error('Encryption verification failed');
      }
      
      console.log('Encryption system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
    }
  }
}
```

### Key Rotation Handling

```typescript
class EncryptionService {
  async refreshKeys() {
    try {
      // Get updated keyIds
      const keyResponse = await apiService.getCurrentKeyIds();
      const contextResponse = await apiService.getUserKeyContext();
      
      // Re-derive keys if keyIds have changed
      await this.deriveKeys(keyResponse.data.keyIds, contextResponse.data);
      
      console.log('Keys refreshed successfully');
    } catch (error) {
      console.error('Key refresh failed:', error);
      // Implement retry logic or fallback
    }
  }
  
  // Call this periodically or on encryption failures
  async handleEncryptionError(error: Error) {
    if (error.message.includes('key') || error.message.includes('decrypt')) {
      console.log('Possible key rotation, refreshing keys...');
      await this.refreshKeys();
    }
  }
}
```


## Security Best Practices

### 1. Key Management

- **Never log encryption keys** or sensitive key material
- **Rotate keys regularly** (recommended: every 30 days)
- **Monitor key health** through admin endpoints
- **Use HTTPS only** for all API communications

### 2. Client-Side Security

```typescript
// ✅ Good: Secure key derivation
const derivedKey = await scrypt(keyMaterial, salt, 32);

// ❌ Bad: Storing raw keys
localStorage.setItem('encryptionKey', key.toString()); // Never do this

// ✅ Good: Clear sensitive data
derivedKey.fill(0); // Clear key from memory when done

// ✅ Good: Validate encrypted fields
if (!encryptedField.encryption || !encryptedField.data) {
  throw new Error('Invalid encrypted field');
}
```

### 3. Error Handling

```typescript
class EncryptionService {
  async encryptField(data: string, purpose: string): Promise<EncryptedField> {
    try {
      // Encryption implementation
    } catch (error) {
      // Log error without sensitive data
      console.error('Encryption failed:', {
        purpose,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      // Don't expose internal details
      throw new Error('Encryption failed');
    }
  }
}
```

### 4. Timestamp Validation

```typescript
// Validate encryption timestamp to prevent replay attacks
private validateTimestamp(timestamp: number): boolean {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  return Math.abs(now - timestamp) <= fiveMinutes;
}
```

## Troubleshooting

### Common Issues

1. **Encryption/Decryption Failures**
   ```typescript
   // Check key availability
   if (!this.keys.has(purpose)) {
     await this.refreshKeys();
   }
   
   // Verify user context
   const context = await apiService.getUserKeyContext();
   if (!context.data.keyIds) {
     throw new Error('User key context not available');
   }
   ```

2. **Key Rotation Issues**
   ```bash
   # Check system health
   curl -X GET https://api.chatflow.com/v1/admin/keys/health \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   
   # Force key refresh on client
   await this.encryptionService.refreshKeys();
   ```

3. **Performance Issues**
   ```typescript
   // Cache derived keys (but clear on key rotation)
   private keyCache = new Map<string, Buffer>();
   
   // Use efficient encryption
   const startTime = performance.now();
   const encrypted = await this.encryptField(data, purpose);
   const duration = performance.now() - startTime;
   
   if (duration > 10) { // 10ms threshold
     console.warn(`Slow encryption: ${duration}ms`);
   }
   ```

### Debugging Tools

```typescript
// Enable debug logging
class EncryptionService {
  private debug = process.env.NODE_ENV === 'development';
  
  private log(message: string, data?: any) {
    if (this.debug) {
      console.log(`[Encryption] ${message}`, data);
    }
  }
}

// Test encryption round-trip
async testEncryption() {
  const testData = 'Test message';
  const encrypted = await this.encryptField(testData, 'message');
  const decrypted = await this.decryptField(encrypted);
  
  if (testData !== decrypted) {
    throw new Error('Encryption round-trip failed');
  }
  
  console.log('Encryption test passed');
}
```

### Health Checks

```typescript
// Client-side health check
async checkEncryptionHealth(): Promise<boolean> {
  try {
    const result = await apiService.verifyUserKeys({
      testData: 'health-check',
      purpose: 'message'
    });
    
    return result.data.verified;
  } catch (error) {
    console.error('Encryption health check failed:', error);
    return false;
  }
}
```

### Admin Monitoring Commands

```bash
# Quick system status check
curl -X GET https://api.chatflow.com/v1/keys/health

# Detailed admin health check
curl -X GET https://api.chatflow.com/v1/admin/keys/health \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get system statistics
curl -X GET https://api.chatflow.com/v1/admin/keys/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# List active keys
curl -X GET "https://api.chatflow.com/v1/admin/keys?isActive=true" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Manual key rotation
curl -X POST https://api.chatflow.com/v1/admin/keys/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Clean up expired keys
curl -X POST https://api.chatflow.com/v1/admin/keys/cleanup \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Conclusion

The ChatFlow key management system provides enterprise-grade security while maintaining ease of use and API compatibility. By following this guide, you can:

- **Implement secure message encryption** for all sensitive communications
- **Manage encryption keys effectively** through admin interfaces
- **Handle key rotation seamlessly** without service disruption
- **Debug and troubleshoot** encryption issues efficiently

### Quick Start Checklist

1. **Admin Setup**:
   - [ ] Initialize key system: `POST /admin/keys/initialize`
   - [ ] Verify health: `GET /admin/keys/health`
   - [ ] Set up monitoring for key rotation

2. **Client Integration**:
   - [ ] Get keyIds: `GET /keys/current`
   - [ ] Get user context: `GET /users/me/keys/context`
   - [ ] Implement key derivation with scrypt
   - [ ] Verify encryption: `POST /users/me/keys/verify`

3. **Message Encryption**:
   - [ ] Encrypt content before sending
   - [ ] Use EncryptedField schema in API calls
   - [ ] Decrypt content after receiving

4. **Search Encryption**:
   - [ ] Encrypt queries for `POST /search/conversations`
   - [ ] Encrypt suggestions for `POST /search/suggestions`
   - [ ] Track encrypted suggestion clicks

### Available Endpoints

**Public (No Auth)**:
- `GET /keys/current` - Get current keyIds
- `GET /keys/algorithms` - Supported algorithms
- `GET /keys/version` - System version
- `GET /keys/health` - Basic health

**User (Auth Required)**:
- `GET /users/me/keys/context` - User key context
- `POST /users/me/keys/verify` - Test encryption

**Admin (Admin Auth)**:
- `GET /admin/keys/health` - Detailed health
- `GET /admin/keys` - List key metadata
- `POST /admin/keys/rotate` - Rotate keys
- `POST /admin/keys/cleanup` - Clean expired keys
- `GET /admin/keys/stats` - Usage statistics
- `POST /admin/keys/initialize` - Initialize system

For additional support or questions, refer to the OpenAPI documentation at `/v1/docs` or contact the development team.

---

**Security Notice**: This encryption system is designed to protect against proxy server interception. Always use HTTPS and follow security best practices in production environments.

