# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Install dependencies needed for native modules and curl for health checks
RUN apk add --no-cache libc6-compat curl

# Set working directory
WORKDIR /app

# Copy package files and configuration
COPY package*.json ./
COPY tsconfig.json ./
COPY backend/package*.json ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/jest.config.js ./backend/
COPY shared/package*.json ./shared/
COPY shared/tsconfig.json ./shared/

# Install all dependencies
RUN npm ci

# Copy source code
COPY backend/src ./backend/src
COPY shared/src ./shared/src

# Build the application
RUN cd backend && npm run build

# Copy REST API files to dist directory (needed for runtime)
RUN cp -r backend/src/rest backend/dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S chatflow -u 1001

# Change ownership of the app directory
RUN chown -R chatflow:nodejs /app
USER chatflow

# Expose port
EXPOSE 3002

# Set environment variables for production
ENV NODE_ENV=production
ENV USE_FIRESTORE=true
ENV USE_PUBSUB=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Change working directory to backend/dist and start the application
WORKDIR /app/backend/dist
CMD ["node", "index.js"] 