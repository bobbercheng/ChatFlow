# ChatFlow Frontend Deployment Guide

This guide covers various ways to deploy the ChatFlow frontend to work with your backend.

## Quick Deployment (Recommended)

### 1. Netlify (Easiest)

1. **Build the frontend:**
   ```bash
   npm run build
   ```

2. **Deploy to Netlify:**
   - Go to [Netlify](https://netlify.com)
   - Drag and drop the `dist/` folder
   - Your app will be live immediately

3. **Configure backend (if needed):**
   - Create a `config.js` file with your backend URLs
   - Upload it to the same directory as your app

### 2. Vercel

1. **Build and deploy:**
   ```bash
   npm run build
   npx vercel --prod
   ```

2. **Follow the prompts to deploy**

### 3. GitHub Pages

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Push to GitHub Pages:**
   ```bash
   # Copy dist contents to a gh-pages branch
   git checkout -b gh-pages
   cp -r dist/* .
   git add .
   git commit -m "Deploy frontend"
   git push origin gh-pages
   ```

## Production Configuration

### Using Cloud Run Backend (Default)

The frontend automatically uses the deployed Cloud Run backend when not running on localhost:

- **API:** `https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1`
- **WebSocket:** `wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws`

No additional configuration needed!

### Using Custom Backend

Create a `config.js` file and upload it with your frontend:

```javascript
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://your-backend.com/v1',
    WS_BASE_URL: 'wss://your-backend.com/ws',
    APP_NAME: 'ChatFlow',
    VERSION: '1.0.0'
};
```

### Include in your HTML:

```html
<!DOCTYPE html>
<html>
<head>
    <title>ChatFlow</title>
    <link rel="stylesheet" href="./styles.css">
</head>
<body>
    <div id="app"></div>
    
    <!-- Include config before app -->
    <script src="./config.js"></script>
    <script type="module" src="./app.js"></script>
</body>
</html>
```

## Advanced Deployment Options

### AWS S3 + CloudFront

1. **Build:**
   ```bash
   npm run build
   ```

2. **Upload to S3:**
   ```bash
   aws s3 sync dist/ s3://your-bucket-name/
   ```

3. **Configure CloudFront distribution**

4. **Add config.js for custom backend**

### Google Cloud Storage + CDN

1. **Build and upload:**
   ```bash
   npm run build
   gsutil -m cp -r dist/* gs://your-bucket-name/
   ```

2. **Configure load balancer and CDN**

### Docker + Cloud Run

Create a `Dockerfile`:

```dockerfile
FROM nginx:alpine

# Copy built frontend
COPY dist/ /usr/share/nginx/html/

# Copy configuration (optional)
COPY config.js /usr/share/nginx/html/

# Configure nginx
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 8080;
        server_name _;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

Deploy to Cloud Run:

```bash
docker build -t gcr.io/your-project/chatflow-frontend .
docker push gcr.io/your-project/chatflow-frontend
gcloud run deploy chatflow-frontend --image gcr.io/your-project/chatflow-frontend --platform managed
```

## Environment-Specific Configurations

### Development
```javascript
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'http://localhost:3002/v1',
    WS_BASE_URL: 'ws://localhost:3002/ws',
    APP_NAME: 'ChatFlow (Dev)',
    VERSION: '1.0.0-dev'
};
```

### Staging
```javascript
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://staging-api.example.com/v1',
    WS_BASE_URL: 'wss://staging-api.example.com/ws',
    APP_NAME: 'ChatFlow (Staging)',
    VERSION: '1.0.0-staging'
};
```

### Production
```javascript
window.CHATFLOW_CONFIG = {
    API_BASE_URL: 'https://api.example.com/v1',
    WS_BASE_URL: 'wss://api.example.com/ws',
    APP_NAME: 'ChatFlow',
    VERSION: '1.0.0'
};
```

## Testing Your Deployment

1. **Open your deployed frontend**
2. **Check browser console for configuration:**
   ```
   🚀 ChatFlow Frontend Starting...
   📡 API Endpoint: https://your-backend.com/v1
   🔌 WebSocket Endpoint: wss://your-backend.com/ws
   ```

3. **Test login with valid credentials**
4. **Test real-time messaging**

## Troubleshooting

### CORS Issues
- Ensure your backend allows your frontend domain in CORS settings
- Check browser network tab for blocked requests

### WebSocket Issues
- Use `wss://` for HTTPS sites
- Check if WebSocket endpoint is accessible
- Verify firewall/proxy settings

### Configuration Issues
- Ensure `config.js` is loaded before `app.js`
- Check browser console for configuration logs
- Verify URLs don't have trailing slashes

## Production Checklist

- [ ] Frontend built with `npm run build`
- [ ] Custom `config.js` created (if needed)
- [ ] CORS configured on backend
- [ ] HTTPS enabled for production
- [ ] WebSocket endpoint accessible
- [ ] Error monitoring configured
- [ ] Performance monitoring enabled
- [ ] CDN configured for assets
- [ ] Backup/recovery plan in place

## Security Considerations

1. **Use HTTPS in production**
2. **Configure CSP headers**
3. **Secure backend endpoints**
4. **Monitor for XSS vulnerabilities**
5. **Regular security updates**

For more detailed information, see the main [README.md](./README.md). 