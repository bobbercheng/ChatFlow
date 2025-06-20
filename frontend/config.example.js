/**
 * ChatFlow Frontend Configuration Example
 * 
 * Copy this file to your web server and include it BEFORE the main app.js
 * to configure custom backend endpoints.
 * 
 * Usage:
 * 1. Copy this file to your hosting directory
 * 2. Rename it to config.js
 * 3. Update the URLs below to match your backend deployment
 * 4. Include it in your HTML: <script src="./config.js"></script>
 * 5. Make sure to include it BEFORE the main app.js script
 */

window.CHATFLOW_CONFIG = {
    // Backend API URL (without trailing slash)
    API_BASE_URL: 'https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1',
    
    // WebSocket URL (use wss:// for HTTPS sites, ws:// for HTTP)
    WS_BASE_URL: 'wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws',
    
    // Optional: Customize app name and version
    APP_NAME: 'ChatFlow',
    VERSION: '1.0.0'
};

// Example configurations for different environments:

/*
// For local development:
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'http://localhost:3002/v1',
    WS_BASE_URL: 'ws://localhost:3002/ws',
    APP_NAME: 'ChatFlow (Dev)',
    VERSION: '1.0.0-dev'
};

// For custom backend deployment:
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://your-backend.example.com/v1',
    WS_BASE_URL: 'wss://your-backend.example.com/ws',
    APP_NAME: 'ChatFlow Custom',
    VERSION: '1.0.0-custom'
};

// For testing with ngrok or similar:
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://abc123.ngrok.io/v1',
    WS_BASE_URL: 'wss://abc123.ngrok.io/ws',
    APP_NAME: 'ChatFlow (Testing)',
    VERSION: '1.0.0-test'
};
*/ 