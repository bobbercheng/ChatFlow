# ChatFlow

## Requirement
Build a minimal but clean WhatsApp-style messaging app that proves code quality, architecture, and scalability thinking. Polish > feature count.

### Highest-Priority Scope (complete these before anything else)

| Area | Tasks to Complete First | Purpose / What Reviewers Look For |
|------|------------------------|-----------------------------------|
| **User Authentication** | Implement `POST /auth/register`, `POST /auth/login`, `GET /users/me` | Enables all other features; judged for REST correctness and basic security |
| **Messaging Core** | Implement `POST /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages` (1-on-1 and group) | Demonstrates data modeling, validation, and business logic |
| **Real-Time Delivery** | Add WebSocket or SSE endpoint (`/ws`) for live message push | Shows understanding of stateful connections and scaling trade-offs |
| **Data Layer** | Design relational schema (users, conversations, messages, participants) with migrations | Reviewers inspect schema & queries for performance and clarity |
| **Automated Tests** | 3–5 meaningful tests covering auth, message creation, and real-time path | Signals engineering discipline and quality |
| **Documentation** | Write README (setup & run), *Architecture Overview* (1 page), *Trade-offs* (1 page) | Accounts for 25 % of score; shows leadership-level communication |

### Deliverables checklist

-   **Working API** with the endpoints above, refer to [backend/src/rest/v1/openapi.yaml](backend/src/rest/v1/openapi.yaml)
    
-   **Minimal UI/CLI** just to demo flows (no styling effort), refer to [Frontend Demo](https://github.com/bobbercheng/ChatFlow/tree/main?tab=readme-ov-file#frontend-demo) and [frontend/images/frontend.png](frontend/images/frontend.png)
    
-   **Docker‐compose or simple script** to spin up DB + app locally, refer to [DOCKER_SETUP.md](DOCKER_SETUP.md)
    
-   **README** ⇒ setup, how to run tests, cURL/WebSocket demo. refer to [Example API Usage](https://github.com/bobbercheng/ChatFlow/tree/main?tab=readme-ov-file#example-api-usage)
    
-   **Architecture doc** ⇒ diagram, tech choices, how to scale to 10k concurrent users, refer to [architecture.md](architecture.md)
    
-   **Trade-offs sheet** ⇒ key decisions + what you'd improve with more time, refer to [tradeoffs.md](tradeoffs.md)

## How To Run

### Prerequisites
- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Google Cloud Firestore Emulator (via Docker)
- Google Cloud Pub/Sub Emulator (via Docker)

### Quick Start

1. **Clone and install dependencies**
   ```bash
   npm install
   ```

2. **Start Firestore and Pub/Sub emulators**
   ```bash
   npm run docker:up
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize Firestore and Pub/Sub**
   ```bash
   npm run gcp:setup
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Run tests**
   ```bash
   npm test
   ```

7. **Start the frontend (optional)**
   ```bash
   cd ../frontend
   npm install
   npm run start
   ```
   Frontend will be available at: http://localhost:3003
   
   Note: The `npm run start` command automatically builds the TypeScript files and serves from the `dist/` directory.

### API Documentation
- Swagger UI: http://localhost:3002/api-docs
- Health check: http://localhost:3002/health

### Example API Usage

#### User Management

**Register a user:**
```bash
curl -X POST http://localhost:3002/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "displayName": "John Doe"
  }'
```

**User authentication (login):**
```bash
curl -X POST http://localhost:3002/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Get user profile:**
```bash
curl -X GET http://localhost:3002/v1/users/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Messages

**Send text message:**
```bash
curl -X POST http://localhost:3002/v1/conversations/conv_1750386041311_fpmswok2p/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "content": "Hello, how are you?",
    "messageType": "TEXT"
  }'
```

**View conversation history:**
```bash
curl -X GET "http://localhost:3002/v1/conversations/conv_1750386041311_fpmswok2p/messages?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Get specific message:**
```bash
curl -X GET http://localhost:3002/v1/conversations/conv_1750386041311_fpmswok2p/messages/msg_1750386041311_abc123def \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Update message:**
```bash
curl -X PUT http://localhost:3002/v1/conversations/conv_1750386041311_fpmswok2p/messages/msg_1750386041311_abc123def \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "content": "Updated message content"
  }'
```

**Delete message:**
```bash
curl -X DELETE http://localhost:3002/v1/conversations/conv_1750386041311_fpmswok2p/messages/msg_1750386041311_abc123def \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Real-time message delivery (WebSocket):**
```javascript
const ws = new WebSocket('ws://localhost:3002/ws?token=YOUR_JWT_TOKEN');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};
```

#### Chat Management

**List all conversations:**
```bash
curl -X GET "http://localhost:3002/v1/conversations?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Create new conversation (1-on-1):**
```bash
curl -X POST http://localhost:3002/v1/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "participantEmails": ["friend@example.com"]
  }'
```

**Create group chat (3+ participants):**
```bash
curl -X POST http://localhost:3002/v1/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "participantEmails": ["friend1@example.com", "friend2@example.com", "friend3@example.com"]
  }'
```

#### Message Timestamps and Delivery Status

**Message Timestamps:**
Every message includes automatic timestamps:
- `createdAt`: When the message was first created
- `updatedAt`: When the message was last modified (for edited messages)

**Message Delivery Status Tracking:**
The system tracks delivery status for each recipient with four states:
- `SENT`: Message created and stored in database
- `DELIVERED`: Message delivered to recipient's device/WebSocket
- `READ`: Message read by recipient
- `FAILED`: Message failed to deliver

**Example message response with timestamps:**
```json
{
  "success": true,
  "data": {
    "id": "msg_1750386041311_abc123def",
    "conversationId": "conv_1750386041311_fpmswok2p",
    "senderId": "sender@example.com",
    "senderDisplayName": "John Doe",
    "content": "Hello, how are you?",
    "messageType": "TEXT",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "sender": {
      "email": "sender@example.com",
      "displayName": "John Doe"
    }
  }
}
```

**Real-time delivery status updates via WebSocket:**
```javascript
const ws = new WebSocket('ws://localhost:3002/ws?token=YOUR_JWT_TOKEN');

// Listen for delivery status updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'message:status') {
    console.log('Message status update:', {
      messageId: data.payload.messageId,
      userId: data.payload.userId,
      status: data.payload.status, // 'DELIVERED' or 'READ'
      occurredAt: data.payload.occurredAt
    });
  }
};

// Mark a message as read (client-initiated)
ws.send(JSON.stringify({
  type: 'message:read',
  payload: {
    messageId: 'MESSAGE_ID'
  }
}));
```

**Automatic status progression:**
1. **SENT**: Automatically set when message is created for all recipients
2. **DELIVERED**: Automatically set when message is pushed to recipient's WebSocket connection
3. **READ**: Set when recipient views the message (via API or WebSocket event)
4. **FAILED**: Set if message delivery fails (network issues, etc.)

### Run backend with docker
Refer to [DOCKER_SETUP.md](DOCKER_SETUP.md)


### Frontend Demo

A simple frontend demo is available at `frontend/` directory. It provides:

**Features:**
- User login with JWT token storage
- Real-time messaging via WebSocket
- Message delivery status tracking
- Simple conversation interface

**Usage:**
1. Start the backend server (see instructions above)
2. Navigate to frontend directory: `cd frontend`
3. Install dependencies: `npm install`
4. Start the frontend: `npm run start`
5. Open http://localhost:3003 in your browser
6. Login with existing user credentials
7. Enter a conversation ID and start messaging

**Demo Flow:**
- Login with email/password (must be registered via API first)
- Enter a conversation ID (UUID format)
- Send messages in real-time
- See connection status (Connected/Disconnected/Connecting)
- Messages appear instantly for all participants in the same conversation

### Available Scripts
- `npm run start` - Start production server
- `npm run dev` - Start development server with hot reload
- `npm test` - Run all tests
- `npm run build` - Build for production
- `npm run gcp:setup` - Initialize Firestore and Pub/Sub
- `npm run emulators:start` - Start Firestore & Pub/Sub emulators
- `npm run emulators:stop` - Stop emulators
- `npm run docker:up` - Start Docker services (emulators)
- `npm run docker:down` - Stop Docker services
- `npm run docker:deploy` - Build and deploy with Docker

### TODO
- Add more error handling and limit message size. - Done, max message size is 2M.
- Message encryption from server to peers. - Done, refer to frontend/ENCRYPTION_README.md
- Enable message search with Firestore full-text search. - Done
- Implement Firestore composite indexes for complex queries. - Not yet
- Add Cloud Functions for background processing.
- Load balance by conversation id with Cloud Run.
- Add CICD for deployment to Google Cloud Platform.
- Support image, binary files with Google Cloud Storage.
- Add Cloud Monitoring and Cloud Trace for performance monitoring.
- Migrate to production Firestore from emulator. - Done

# Roadmap
- POC to delegate a participant in a conversation to local OpenAI compatible LLM. -  Done.
- Add conversation list. - Done.
- Register bot user with web webhook and OpenAI compatible LLM.
- SSO login.