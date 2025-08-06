# API Gateway Dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    docker \
    docker-cli \
    curl \
    bash

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application source
COPY api-gateway/src ./src
COPY api-gateway/docs ./docs

# Create necessary directories
RUN mkdir -p /app/config /app/volumes /app/logs

# Create non-root user
RUN addgroup -g 1001 -S gateway && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G gateway gateway

# Set ownership
RUN chown -R gateway:gateway /app

# Switch to non-root user
USER gateway

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV API_PORT=3000

# Start command
CMD ["node", "src/server.js"]