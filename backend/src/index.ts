import dotenv from 'dotenv';
import { createServer } from 'http';
import { app } from './app';
import { initializeWebSocket } from './websocket/websocket';

// Load environment variables
dotenv.config();

const PORT = process.env['PORT'] || 3000;

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 ChatFlow server running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
}); 