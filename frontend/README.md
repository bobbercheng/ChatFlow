# ChatFlow Frontend

A simple TypeScript frontend for the ChatFlow messaging application.

## Features

- **User Authentication**: Login with email/password and JWT token storage
- **Real-time Messaging**: WebSocket-based messaging with automatic reconnection
- **Message Delivery Tracking**: Visual status indicators for message delivery
- **Simple UI**: Clean, responsive interface for easy messaging

## Quick Start

1. **Prerequisites**: Ensure the backend is running on `http://localhost:3002`

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run start
   ```
   This command automatically builds the TypeScript files and serves from the `dist/` directory.

4. **Open in browser**: Navigate to `http://localhost:3003`

## Usage

### Login
1. Enter your email and password (user must be registered via backend API first)
2. Click "Login" to authenticate and establish WebSocket connection

### Messaging
1. Enter a conversation ID (UUID format) in the conversation field
2. Type your message in the input field
3. Press Enter or click "Send" to send the message
4. Messages appear in real-time for all participants in the conversation

### Connection Status
- **Connected** (green): WebSocket is connected and ready
- **Connecting** (yellow): Attempting to establish connection
- **Disconnected** (red): No connection to server

## Architecture

### Components
- **`app.ts`**: Main application logic and UI management
- **`apiService.ts`**: REST API communication with backend
- **`websocketService.ts`**: WebSocket connection and message handling
- **`types/index.ts`**: TypeScript interfaces and type definitions

### Data Flow
1. User logs in via REST API → JWT token stored
2. WebSocket connection established with token
3. Messages sent via WebSocket for real-time delivery
4. Incoming messages received via WebSocket events
5. UI updates automatically with new messages

### Message Types
- **`message:create`**: Send a new message
- **`message:new`**: Receive a new message from others
- **`message:created`**: Confirmation of sent message
- **`message:read`**: Mark message as read
- **`message:status`**: Delivery status updates

## Development

### Build
```bash
npm run build
```

### Type Checking
```bash
npm run type-check
```

### Watch Mode
```bash
npm run dev
```

## Integration with Backend

The frontend integrates with the ChatFlow backend APIs:

- **Authentication**: `POST /v1/auth/login`
- **WebSocket**: `ws://localhost:3002/ws?token=JWT_TOKEN`
- **Message Creation**: Via WebSocket `message:create` events
- **Real-time Updates**: Via WebSocket `message:new` events

## Browser Support

- Modern browsers with ES2020 support
- WebSocket support required
- Local storage for token persistence

## Troubleshooting

### Import Errors (404 File Not Found)
If you see errors like `GET http://localhost:3003/services/apiService net::ERR_ABORTED 404`:
- Ensure you run `npm run build` before starting the server
- The build process compiles TypeScript to JavaScript with correct `.js` extensions
- The server serves from `dist/` directory, not `src/`

### WebSocket Connection Issues
- Ensure the backend is running on `http://localhost:3002`
- Check that the WebSocket endpoint `/ws` is accessible
- Verify JWT token is valid (try logging out and back in)

### Login Issues
- User must be registered via backend API first
- Check browser console for network errors
- Verify backend is running and accessible 