# API Gateway Dockerfile - Using debian base for glibc compatibility
FROM node:18-slim

# Install system dependencies including unzip and wget for binary download
RUN apt-get update && apt-get install -y \
    docker.io \
    curl \
    bash \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Download and setup go-whatsapp-web-multidevice binary
RUN wget -O whatsapp_linux_amd64.zip https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases/download/v7.4.0/whatsapp_7.4.0_linux_amd64.zip && \
    unzip whatsapp_linux_amd64.zip && \
    mv linux-amd64 whatsapp && \
    chmod +x whatsapp && \
    rm whatsapp_linux_amd64.zip readme.md

# Copy application source
COPY api-gateway/src ./src
COPY openapi.yaml ./openapi.yaml
COPY docs ./docs

# Create necessary directories
RUN mkdir -p /app/config /app/volumes /app/logs /app/sessions

# Create non-root user
RUN groupadd -g 1001 gateway && \
    useradd -u 1001 -g gateway -d /app -s /bin/bash gateway

# Set ownership and ensure binary is executable
RUN chown -R gateway:gateway /app && \
    chmod +x /app/whatsapp

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