# Sponsor Messaging System - Design Document

## Architecture Overview

The sponsor messaging system will be implemented as a new service integrated with existing ChatFlow services, following established patterns for database operations, API endpoints, and service architecture.

## Database Design

### New Collection: `sponsors`

```typescript
interface FirestoreSponsor {
  id: string; // Auto-generated document ID
  sponsorUserEmail: string; // Email of the sponsor user
  message: string; // The message to be sent
  targetFilter: SponsorTargetFilter; // Who should receive the message
  isActive: boolean; // Whether this sponsor is currently active
  createdBy: string; // Admin email who created this sponsor
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

enum SponsorTargetFilter {
  NEW_USER = 'new_user', // Only send to newly registered users
  EVERYONE = 'everyone'   // Send to all users (existing + new)
}
```

### Database Indexes
```typescript
// Composite indexes for efficient queries
- sponsorUserEmail + isActive
- targetFilter + isActive
- createdAt (for pagination)
```

### Integration with Existing Collections
- **users**: Check sponsor user exists before creating sponsor
- **conversations**: Reuse existing direct conversations or create new ones
- **messages**: Create sponsor messages using existing message service

## Service Layer Design

### New Service: `SponsorService`

```typescript
export class SponsorServiceFirestore {
  // Core sponsor management
  async createSponsor(data: CreateSponsorData): Promise<FirestoreSponsor>
  async deactivateSponsor(sponsorId: string, adminEmail: string): Promise<void>
  async getSponsors(options: PaginationOptions): Promise<PaginationResult<FirestoreSponsor>>
  async getSponsorById(sponsorId: string): Promise<FirestoreSponsor | null>
  
  // Message delivery
  async processSponsorMessages(userEmail: string, isNewUser: boolean): Promise<void>
  async sendEveryoneMessages(sponsorId: string): Promise<void>
  
  // Validation and utilities
  async validateSponsorUser(email: string): Promise<boolean>
  private async findExistingSponsor(sponsorUserEmail: string): Promise<FirestoreSponsor | null>
  private async createSponsorConversation(sponsorEmail: string, targetEmail: string): Promise<string>
  private async sendSponsorMessage(conversationId: string, sponsorEmail: string, message: string): Promise<void>
}
```

### Service Implementation Strategy

#### 1. Create Sponsor Flow
```typescript
async createSponsor(data: CreateSponsorData): Promise<FirestoreSponsor> {
  // 1. Validate sponsor user exists
  // 2. Check for existing sponsor (active or inactive)
  // 3. If inactive sponsor exists, reactivate it with new message/filter
  // 4. If no sponsor exists, create new sponsor record
  // 5. If targetFilter is 'everyone', trigger message delivery to all users
  // 6. Return created/updated sponsor
}
```

#### 2. Message Delivery Flow
```typescript
async processSponsorMessages(userEmail: string, isNewUser: boolean): Promise<void> {
  // 1. Query active sponsors matching user type
  // 2. For each sponsor:
  //    - Check if conversation already exists
  //    - Create/get conversation
  //    - Send sponsor message
  // 3. Handle errors gracefully (log but don't fail)
}
```

#### 3. Sponsor Deactivation Flow
```typescript
async deactivateSponsor(sponsorId: string, adminEmail: string): Promise<void> {
  // 1. Find sponsor by ID
  // 2. Validate sponsor exists and is active
  // 3. Set isActive to false (soft delete)
  // 4. Update updatedAt timestamp
  // 5. Log deactivation for audit trail
}
```

#### 4. Everyone Filter Processing
```typescript
async sendEveryoneMessages(sponsorId: string): Promise<void> {
  // 1. Get all users in batches (prevent memory issues)
  // 2. For each user:
  //    - Skip if conversation already exists
  //    - Create conversation and send message
  // 3. Use batch processing with transaction safety
  // 4. Implement retry logic for failed deliveries
}
```

## API Layer Design

### New Routes: `/v1/admin/sponsors`

#### Create Sponsor
```typescript
POST /v1/admin/sponsors
Authorization: Bearer {admin_token}
Content-Type: application/json

Request Body:
{
  "sponsorUserEmail": "sponsor@example.com",
  "message": "Welcome to ChatFlow! I'm here to help you get started.",
  "targetFilter": "new_user" | "everyone"
}

Response (201):
{
  "success": true,
  "data": {
    "id": "sponsor_123",
    "sponsorUserEmail": "sponsor@example.com",
    "message": "Welcome to ChatFlow!...",
    "targetFilter": "new_user",
    "isActive": true,
    "createdBy": "admin@chatflow.app",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Deactivate Sponsor (Soft Delete)
```typescript
DELETE /v1/admin/sponsors/:sponsorId
Authorization: Bearer {admin_token}

Response (200):
{
  "success": true,
  "data": {
    "message": "Sponsor deactivated successfully"
  }
}

Note: This performs a soft delete by setting isActive to false.
The sponsor record is preserved for audit trail purposes.
```

#### List Sponsors
```typescript
GET /v1/admin/sponsors?page=1&limit=20&sponsorUserEmail=sponsor@example.com&includeInactive=false
Authorization: Bearer {admin_token}

Query Parameters:
- includeInactive: boolean (default: false) - Include deactivated sponsors in results

Response (200):
{
  "success": true,
  "data": {
    "sponsors": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "hasMore": false
    }
  }
}

Note: By default, only active sponsors are returned. 
Set includeInactive=true to include deactivated sponsors for audit purposes.
```

### Route Implementation
```typescript
// /src/rest/v1/routes/sponsors.ts (new file)
const router = Router();

// Apply middleware
router.use(adminRateLimit);
router.use(authenticateToken);
router.use(requireAdmin);

// Route handlers with validation
router.post('/', [
  body('sponsorUserEmail').isEmail().withMessage('Valid sponsor email required'),
  body('message').isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
  body('targetFilter').isIn(['new_user', 'everyone']).withMessage('Invalid target filter')
], createSponsorHandler);

router.delete('/:sponsorId', [
  param('sponsorId').notEmpty().withMessage('Sponsor ID required')
], deactivateSponsorHandler);

router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sponsorUserEmail').optional().isEmail(),
  query('includeInactive').optional().isBoolean()
], getSponsorsHandler);
```

## Integration Points

### 1. User Registration Integration
Modify existing user registration flow to call sponsor service:

```typescript
// In auth.service.ts or user registration endpoint
async registerUser(userData: CreateUserData): Promise<FirestoreUser> {
  // ... existing registration logic ...
  
  const newUser = await databaseAdapter.create<FirestoreUser>(COLLECTIONS.USERS, userEmail, userData);
  
  // NEW: Process sponsor messages for new user
  try {
    await sponsorService.processSponsorMessages(userEmail, true);
  } catch (error) {
    // Log error but don't fail registration
    console.error('Failed to process sponsor messages for new user:', error);
  }
  
  return newUser;
}
```

### 2. Conversation Service Integration
Sponsor service will use existing conversation service:

```typescript
private async createSponsorConversation(sponsorEmail: string, targetEmail: string): Promise<string> {
  // Check if direct conversation already exists
  const existingConversation = await conversationService.findDirectConversation(sponsorEmail, targetEmail);
  
  if (existingConversation) {
    return existingConversation.id;
  }
  
  // Create new conversation using existing service
  const conversation = await conversationService.createConversation({
    participantEmails: [sponsorEmail, targetEmail],
    createdBy: sponsorEmail
  });
  
  return conversation.id;
}
```

### 3. Message Service Integration
Sponsor service will use existing message service:

```typescript
private async sendSponsorMessage(conversationId: string, sponsorEmail: string, message: string): Promise<void> {
  await messageService.createMessage({
    conversationId,
    senderId: sponsorEmail,
    content: message,
    messageType: MessageType.TEXT
  });
}
```

## Type Definitions

### New Types
```typescript
// Add to /src/types/firestore.ts

export interface FirestoreSponsor {
  id: string;
  sponsorUserEmail: string;
  message: string;
  targetFilter: SponsorTargetFilter;
  isActive: boolean;
  createdBy: string;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export enum SponsorTargetFilter {
  NEW_USER = 'new_user',
  EVERYONE = 'everyone'
}

export interface CreateSponsorData {
  sponsorUserEmail: string;
  message: string;
  targetFilter: SponsorTargetFilter;
  createdBy: string;
}

// Update COLLECTIONS constant
export const COLLECTIONS = {
  USERS: 'users',
  CONVERSATIONS: 'conversations',
  PARTICIPANTS: 'participants',
  MESSAGES: 'messages',
  MESSAGE_STATUS: 'status',
  SPONSORS: 'sponsors' // NEW
} as const;
```

## Error Handling Strategy

### Service Level Errors
```typescript
export class SponsorError extends HttpError {
  constructor(statusCode: number, message: string, code: string, details?: any) {
    super(statusCode, message, code);
    this.details = details;
  }
}

// Common error codes
const SPONSOR_ERRORS = {
  SPONSOR_NOT_FOUND: 'SPONSOR_NOT_FOUND',
  SPONSOR_USER_NOT_FOUND: 'SPONSOR_USER_NOT_FOUND',
  SPONSOR_ALREADY_ACTIVE: 'SPONSOR_ALREADY_ACTIVE',
  SPONSOR_ALREADY_INACTIVE: 'SPONSOR_ALREADY_INACTIVE',
  MESSAGE_DELIVERY_FAILED: 'MESSAGE_DELIVERY_FAILED',
  INVALID_TARGET_FILTER: 'INVALID_TARGET_FILTER'
} as const;
```

### Graceful Degradation
- If sponsor message delivery fails, log error but don't fail main operation
- If "everyone" processing fails partially, continue with successful deliveries
- Implement retry logic for transient failures
- Provide detailed error logging for debugging

## Performance Considerations

### Batch Processing
```typescript
// Process "everyone" filter in batches to prevent memory issues
private async processEveryoneFilter(sponsorId: string): Promise<void> {
  const BATCH_SIZE = 100;
  let processed = 0;
  let hasMore = true;
  
  while (hasMore) {
    const users = await databaseAdapter.findWithPagination<FirestoreUser>(
      COLLECTIONS.USERS,
      { limit: BATCH_SIZE, offset: processed }
    );
    
    // Process batch in parallel with concurrency limit
    await Promise.allSettled(
      users.data.map(user => this.createSponsorConversation(sponsorId, user.email))
    );
    
    processed += users.data.length;
    hasMore = users.hasMore;
  }
}
```

### Database Optimization
- Use compound indexes for efficient sponsor queries
- Implement pagination for large result sets
- Use transactions only when necessary (avoid long-running transactions)
- Cache frequently accessed sponsor data

### Async Processing
- Use background job processing for "everyone" filter
- Implement queue-based message delivery for better reliability
- Add monitoring and alerting for failed deliveries

## Security Considerations

### Authorization
- All sponsor endpoints require admin authentication
- Validate sponsor user exists and is not admin
- Prevent self-sponsoring (admin can't be sponsor)

### Input Validation
- Sanitize sponsor messages to prevent XSS
- Validate email formats and message length
- Rate limit sponsor creation to prevent abuse

### Audit Trail
- Log all sponsor operations (create, remove, message delivery)
- Track who created/removed sponsors
- Monitor for suspicious patterns

## Testing Strategy

### Unit Tests
```typescript
// /src/services/sponsor.service.test.ts
describe('SponsorService', () => {
  describe('createSponsor', () => {
    it('should create sponsor with valid data');
    it('should reject invalid sponsor user email');
    it('should reactivate existing inactive sponsor');
    it('should reject creation if sponsor already active');
    it('should trigger everyone messages when applicable');
    it('should update message and filter when reactivating');
  });
  
  describe('deactivateSponsor', () => {
    it('should deactivate active sponsor (soft delete)');
    it('should reject deactivation of non-existent sponsor');
    it('should reject deactivation of already inactive sponsor');
    it('should preserve sponsor data for audit trail');
  });
  
  describe('processSponsorMessages', () => {
    it('should only process active sponsors');
    it('should send messages to new users from new_user sponsors');
    it('should send messages to all users from everyone sponsors');
    it('should reuse existing conversations');
    it('should handle sponsor message delivery failures gracefully');
  });
});
```

### Integration Tests
```typescript
// /src/rest/v1/routes/sponsors.test.ts
describe('Sponsor API', () => {
  it('should create sponsor as admin');
  it('should reactivate inactive sponsor as admin');
  it('should reject sponsor creation as non-admin');
  it('should list sponsors with pagination (only active by default)');
  it('should deactivate sponsor by ID (soft delete)');
  it('should reject deactivation of already inactive sponsor');
  it('should validate request body properly');
  it('should include inactive sponsors when explicitly requested');
});
```

### Performance Tests
- Test "everyone" filter with large user base (1000+ users)
- Measure response times for sponsor operations
- Test concurrent sponsor message delivery

## Migration Strategy

### Database Migration
1. Create `sponsors` collection with proper indexes
2. No existing data migration needed (new feature)
3. Add database constraints and validation rules

### Code Deployment
1. Deploy service layer changes first
2. Deploy API routes
3. Deploy user registration integration
4. Monitor for any issues and rollback if needed

### Feature Rollout
1. Start with limited admin testing
2. Enable for small user base initially
3. Monitor performance and error rates
4. Gradually expand to full user base

## Monitoring and Observability

### Metrics to Track
- Number of active sponsors
- Sponsor message delivery success rate
- Average processing time for "everyone" filter
- Failed sponsor message deliveries
- Admin sponsor operations frequency

### Logging Strategy
```typescript
// Structured logging for sponsor operations
logger.info('Sponsor created', {
  sponsorId,
  sponsorUserEmail,
  targetFilter,
  createdBy: adminEmail,
  isReactivation: false,
  timestamp: new Date().toISOString()
});

logger.info('Sponsor reactivated', {
  sponsorId,
  sponsorUserEmail,
  newTargetFilter: targetFilter,
  newMessage: message,
  reactivatedBy: adminEmail,
  timestamp: new Date().toISOString()
});

logger.info('Sponsor deactivated', {
  sponsorId,
  sponsorUserEmail,
  deactivatedBy: adminEmail,
  timestamp: new Date().toISOString()
});

logger.error('Sponsor message delivery failed', {
  sponsorId,
  targetUserEmail,
  error: error.message,
  retryCount,
  timestamp: new Date().toISOString()
});
```

### Alerting
- Alert on high failure rates for sponsor message delivery
- Alert on unusually long processing times for "everyone" filter
- Alert on failed sponsor operations

## Open API Documentation

### Swagger Documentation
```yaml
paths:
  /v1/admin/sponsors:
    post:
      summary: Create a new sponsor
      tags: [Admin - Sponsors]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateSponsorRequest'
      responses:
        201:
          description: Sponsor created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SponsorResponse'
        400:
          $ref: '#/components/responses/ValidationError'
        403:
          $ref: '#/components/responses/Forbidden'

components:
  schemas:
    CreateSponsorRequest:
      type: object
      required:
        - sponsorUserEmail
        - message
        - targetFilter
      properties:
        sponsorUserEmail:
          type: string
          format: email
          example: "sponsor@example.com"
        message:
          type: string
          minLength: 1
          maxLength: 2000
          example: "Welcome to ChatFlow! I'm here to help you get started."
        targetFilter:
          type: string
          enum: [new_user, everyone]
          example: "new_user"
```

This design follows the existing ChatFlow backend patterns and provides a robust, scalable solution for the sponsor messaging system. 