# ChatFlow Frontend

A modern, TypeScript-based chat application frontend that connects to the ChatFlow backend.

## Features

- 🔐 User authentication with JWT tokens
- 💬 Real-time messaging via WebSocket
- 📱 Responsive design
- ⚙️ Configurable backend endpoints
- 🚀 Multiple deployment options

## Quick Start

### 1. Development (Local Backend)

```bash
npm install
npm run dev
```

This will use the local backend at `http://localhost:3002` by default.

### 2. Production (Cloud Run Backend)

The frontend automatically detects when running in production and uses the deployed Cloud Run backend:
- API: `https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1`
- WebSocket: `wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws`

## Configuration

### Automatic Environment Detection

The frontend automatically chooses the appropriate backend based on where it's running:

- **Development** (`localhost`): Uses local backend (`http://localhost:3002`)
- **Production** (any other domain): Uses Cloud Run backend
- **Custom**: Uses manually configured backend

### Custom Backend Configuration

#### Option 1: Configuration File (Recommended)

1. Copy `config.example.js` to `config.js`
2. Update the URLs in `config.js`:

```javascript
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://your-backend.com/v1',
    WS_BASE_URL: 'wss://your-backend.com/ws',
    APP_NAME: 'ChatFlow Custom',
    VERSION: '1.0.0'
};
```

3. Include the config file in your HTML before the main app:

```html
<script src="./config.js"></script>
<script type="module" src="./app.js"></script>
```

#### Option 2: Inline Configuration

Add configuration directly in your HTML:

```html
<script>
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://your-backend.com/v1',
    WS_BASE_URL: 'wss://your-backend.com/ws'
};
</script>
<script type="module" src="./app.js"></script>
```

#### Option 3: Runtime Configuration (Development)

When running locally, you can use the configuration panel:

1. Click the "⚙️ Config" button in the top-right corner
2. Enter your backend URLs
3. Click "Apply" to reload with new configuration

### Environment Variables

The frontend supports these configuration options:

| Variable | Description | Example |
|----------|-------------|---------|
| `API_BASE_URL` | Backend API endpoint | `https://api.example.com/v1` |
| `WS_BASE_URL` | WebSocket endpoint | `wss://api.example.com/ws` |
| `APP_NAME` | Application name | `ChatFlow Custom` |
| `VERSION` | Application version | `1.0.0` |

## Deployment Options

### 1. Static File Hosting

Build and deploy to any static file hosting service:

```bash
npm run build
# Upload dist/ folder to your hosting service
```

**Hosting Services:**
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront
- Google Cloud Storage + CDN

### 2. Local HTTP Server

```bash
npm run start
# Serves on http://localhost:3003
```

### 3. Docker Deployment

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY config.js /usr/share/nginx/html/
EXPOSE 80
```

### 4. CDN Deployment

Upload the `dist/` folder to a CDN and include your `config.js` file. We use Google Cloud Storage. You can check [https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html?v=20250620](https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html?v=20250620)

## Backend Compatibility

### Required Backend Endpoints

The frontend expects these endpoints from the backend:

- `POST /v1/auth/login` - User authentication
- `GET /v1/conversations/{id}/messages` - Fetch messages
- `POST /v1/conversations/{id}/messages` - Send message
- `WebSocket /ws` - Real-time messaging

### CORS Configuration

Ensure your backend allows requests from your frontend domain:

```javascript
// Backend CORS configuration
app.use(cors({
  origin: ['https://your-frontend-domain.com'],
  credentials: true,
}));
```

For the deployed Cloud Run backend, CORS is configured to allow all origins (`*`).

## Development

### Scripts

- `npm run build` - Build for production
- `npm run dev` - Build and watch for changes
- `npm run start` - Build and serve locally
- `npm run type-check` - TypeScript type checking

### File Structure

```
src/
├── config/
│   └── environment.ts     # Environment configuration
├── services/
│   ├── apiService.ts      # HTTP API client
│   └── websocketService.ts # WebSocket client
├── types/
│   └── index.ts           # TypeScript type definitions
├── app.ts                 # Main application
├── index.html             # HTML template
└── styles.css             # Styling
```

### Adding Custom Backends

To use a custom backend:

1. Ensure it implements the required API endpoints
2. Configure CORS to allow your frontend domain
3. Use one of the configuration methods above
4. Test the connection using the browser developer tools

## Troubleshooting

### Common Issues

**CORS Errors**
- Ensure backend CORS is configured correctly
- Check that URLs don't have trailing slashes in config

**WebSocket Connection Failed**
- Use `wss://` for HTTPS sites, `ws://` for HTTP
- Check firewall and network settings
- Verify backend WebSocket endpoint is accessible

**Authentication Issues**
- Check if backend auth endpoints are working
- Verify JWT token storage in browser localStorage
- Clear browser storage and try logging in again

### Debug Information

The frontend logs configuration details to the browser console:

```
🚀 ChatFlow Frontend Starting...
📡 API Endpoint: https://backend.com/v1
🔌 WebSocket Endpoint: wss://backend.com/ws
📱 App Version: 1.0.0
```

## Production Considerations

1. **HTTPS**: Always use HTTPS in production
2. **CSP**: Configure Content Security Policy headers
3. **Caching**: Set appropriate cache headers for static assets
4. **Monitoring**: Monitor frontend errors and performance
5. **Backup**: Keep configuration files in version control

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both local and production backends
5. Submit a pull request

## License

MIT License - see LICENSE file for details 