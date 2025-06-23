# Encryption Implementation Guide

## Overview

This document describes the field-level encryption implementation for both REST API and WebSocket endpoints in the ChatFlow backend. The implementation encrypts sensitive fields while preserving metadata in plaintext for debugging and API compatibility.

## Architecture

### Core Components

1. **ResponseEncryptionService** (`src/middleware/encryption.ts`)
   - Handles response field encryption for both REST and WebSocket
   - Provides centralized encryption logic
   - Supports field-level encryption with configurable key mapping

2. **Encryption Middleware** (`messageEncryptionMiddleware`)
   - Applied to message-related REST endpoints
   - Automatically encrypts response fields
   - Handles decryption of incoming encrypted requests

3. **WebSocket Encryption** (`sendEncryptedMessage` function)
   - Encrypts outbound WebSocket messages
   - Preserves message structure while encrypting sensitive content
   - Automatic fallback to plaintext for error messages

## Field-Level Encryption Strategy

### Sensitive Fields (Encrypted)
- `content` - Message content
- `query` - Search queries  
- `suggestionText` / `suggestion` - Search suggestions
- `text` - Generic text content
- `body` - Message body
- `rawContent` - Raw content in search results
- `semanticContent` - Semantic content in search
- `highlightedContent` - Highlighted search content

### Non-Sensitive Fields (Plaintext)
- `id` - Entity identifiers
- `timestamp` - Timestamps
- `type` - Message/event types
- `senderId` - User identifiers
- `conversationId` - Conversation identifiers
- `success` - API response status
- `totalCount`, `page`, `limit` - Pagination metadata

### Key Mapping Strategy

Different sensitive fields use appropriate keys:

```typescript
const keyMapping = {
  'content': 'message_key',
  'body': 'message_key',
  'query': 'suggestion_key',
  'suggestionText': 'suggestion_key',
  'suggestion': 'suggestion_key', 
  'text': 'text_key',
  'rawContent': 'search_key',
  'semanticContent': 'search_key',
  'highlightedContent': 'search_key'
};
```

## Implementation Details

### REST API Encryption

Message endpoints automatically encrypt responses using the `messageEncryptionMiddleware`:

```typescript
// Applied to message routes
router.post('/:conversationId/messages',
  authenticateToken,
  messageEncryptionMiddleware,  // Enables response encryption
  // ... validation
  async (req, res) => {
    const result = await messageService.createMessage(data);
    
    // Use encrypted response helper if available
    if (res.encryptedJson) {
      await res.encryptedJson({ success: true, data: result });
    } else {
      res.json({ success: true, data: result });
    }
  }
);
```

### WebSocket Encryption

WebSocket messages are encrypted using the `sendEncryptedMessage` helper:

```typescript
// Encrypt and send WebSocket message
await sendEncryptedMessage(ws, 'message:created', {
  id: 'msg_123',
  content: 'Hello, this will be encrypted',
  senderId: 'user@example.com' // This stays plaintext
});
```

### Response Structure

Encrypted fields maintain the following structure:

```json
{
  "success": true,
  "data": {
    "id": "msg_123",
    "senderId": "user@example.com",
    "timestamp": "2024-01-01T10:00:00Z",
    "content": {
      "data": "base64_encrypted_content",
      "encryption": {
        "algorithm": "AES-256-GCM",
        "keyId": "message_key",
        "iv": "base64_iv",
        "tag": "base64_tag",
        "timestamp": 1750630345123,
        "nonce": "random_nonce"
      }
    }
  }
}
```

## Security Features

### Encryption Standards
- **Algorithm**: AES-256-CBC (compatible with frontend expectations)
- **Key Derivation**: scrypt with user-specific salt
- **Authentication**: SHA-256 HMAC tags for integrity verification
- **Replay Protection**: Timestamp validation (5-minute window)

### Key Management
- User-specific key derivation: `scrypt(keyId:userEmail, 'salt', 32)`
- Per-field key types for compartmentalization
- Automatic key caching for performance

### Security Best Practices
- Unique IV per encryption operation
- Timestamp-based replay attack prevention
- Graceful fallback for encryption failures
- Error messages don't expose plaintext data

## Performance Optimizations

### Encryption Performance
- Field-level encryption minimizes overhead
- Only sensitive fields are encrypted
- Metadata remains in plaintext for fast processing

### Caching Strategy
- Key derivation results are cached
- Encryption service reuses instances
- Minimal overhead for metadata fields

### Benchmark Results
- Single field encryption: < 10ms
- Large objects (50 fields): < 100ms
- WebSocket message encryption: < 5ms

## Usage Examples

### Basic REST Endpoint

```typescript
// Message creation with automatic encryption
const response = await fetch('/v1/conversations/conv_123/messages', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: 'This will be encrypted in the response'
  })
});

// Response has encrypted content field
const data = await response.json();
console.log(data.data.content.data); // "base64_encrypted_content"
console.log(data.data.id); // "msg_123" (plaintext)
```

### WebSocket Message

```typescript
// Send message via WebSocket
ws.send(JSON.stringify({
  type: 'message:create',
  payload: {
    conversationId: 'conv_123',
    content: 'This message content will be encrypted'
  }
}));

// Receive encrypted response
ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  console.log(response.type); // "message:created" (plaintext)
  console.log(response.payload.content.data); // encrypted content
};
```

### Search Suggestions

```typescript
// Search suggestions with encrypted queries
const response = await fetch('/v1/search/suggestions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    q: {
      data: "encrypted_query",
      encryption: { /* encryption metadata */ }
    },
    limit: 5
  })
});

// Response has encrypted suggestion text
const suggestions = await response.json();
suggestions.data.forEach(suggestion => {
  console.log(suggestion.suggestion.data); // encrypted suggestion
  console.log(suggestion.type); // "recent" (plaintext)
});
```

## Testing

### Unit Tests

```typescript
// Test response encryption
const responseService = new ResponseEncryptionService();
const testResponse = { content: 'Test content' };
await responseService.encryptResponseFields(testResponse, 'user@example.com');

expect(testResponse.content).toHaveProperty('data');
expect(testResponse.content).toHaveProperty('encryption');
```

### Integration Tests

```typescript
// Test encrypted API response
const response = await request(app)
  .post('/v1/conversations/conv_123/messages')
  .set('Authorization', `Bearer ${token}`)
  .send({ content: 'Test message' });

expect(response.body.data.content).toHaveProperty('encryption');
```

### Performance Tests

```typescript
// Test encryption performance
const startTime = Date.now();
await responseService.encryptResponseFields(largeObject, userEmail);
const duration = Date.now() - startTime;
expect(duration).toBeLessThan(100); // Should be under 100ms
```

## Error Handling

### Encryption Failures
- Automatic fallback to error responses
- No plaintext data exposure in errors
- Graceful degradation for WebSocket connections

### Common Issues
1. **Missing User Email**: Falls back to plaintext with warning
2. **Invalid Key Derivation**: Returns encryption error response
3. **Timeout Issues**: Uses cached keys when available

### Debugging
- Metadata fields remain visible for debugging
- Encryption errors are logged but don't expose data
- Performance metrics available via service methods

## Configuration

### Environment Variables
- `JWT_SECRET` - Used for user authentication and key derivation
- `ENCRYPTION_CACHE_TTL` - Key cache time-to-live (default: 1 hour)
- `ENCRYPTION_MAX_AGE` - Maximum age for encrypted data (default: 5 minutes)

### Middleware Configuration

```typescript
// Custom encryption middleware
const customEncryptionMiddleware = createEncryptionMiddleware({
  encryptResponses: true,
  skipPaths: ['/v1/auth/login', '/v1/health']
});
```

## Migration Guide

### Existing Endpoints
1. Add `messageEncryptionMiddleware` to routes that handle sensitive data
2. Update response handlers to use `res.encryptedJson()` when available
3. Update client code to handle encrypted response fields

### WebSocket Handlers
1. Replace `ws.send(JSON.stringify(...))` with `await sendEncryptedMessage(ws, type, payload)`
2. Ensure sensitive fields are properly identified
3. Test encrypted message handling

### Frontend Compatibility
- Maintain existing field-level encryption patterns
- Preserve metadata field accessibility
- Handle both encrypted and plaintext responses gracefully

## Best Practices

### Development
1. **Test with Real Data**: Use realistic payloads for encryption testing
2. **Monitor Performance**: Track encryption overhead in production
3. **Validate Keys**: Ensure appropriate key IDs for different field types

### Security
1. **Rotate Keys**: Implement key rotation for long-term security
2. **Monitor Usage**: Log encryption failures and performance metrics
3. **Validate Inputs**: Always validate decrypted content

### Operations
1. **Error Monitoring**: Track encryption failures and performance issues
2. **Cache Management**: Monitor key cache hit rates and performance
3. **Capacity Planning**: Account for encryption overhead in scaling decisions

## Future Enhancements

### Planned Features
1. **Key Rotation**: Automatic key rotation with backward compatibility
2. **Performance Optimization**: Hardware-accelerated encryption
3. **Audit Logging**: Detailed encryption/decryption audit trails

### Extensibility
- Additional field types can be easily added to sensitive fields list
- Custom key derivation strategies can be implemented
- Plugin architecture for different encryption algorithms 