# API Gateway Dockerfile - Using debian base for glibc compatibility
FROM node:22-slim

ARG TARGETARCH=amd64

# Set working directory
WORKDIR /app

# Copia todo o diretório (inclui src, tsconfig, etc)
COPY . .
# Copia package.json e package-lock.json explicitamente
COPY package.json ./
COPY package-lock.json ./

# Instala dependências (inclui devDependencies para build)
RUN npm install

# Download e setup do binário go-whatsapp-web-multidevice (arch-aware)
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) ARCH_SUFFIX=amd64; FOLDER_NAME=linux-amd64 ;; \
      arm64) ARCH_SUFFIX=arm64; FOLDER_NAME=linux-arm64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}"; exit 1 ;; \
    esac; \
    wget -O whatsapp_linux_${ARCH_SUFFIX}.zip \
      https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases/download/v${WHATSAPP_VERSION}/whatsapp_${WHATSAPP_VERSION}_linux_${ARCH_SUFFIX}.zip; \
    unzip whatsapp_linux_${ARCH_SUFFIX}.zip; \
    mv ${FOLDER_NAME} whatsapp; \
    chmod +x whatsapp; \
    rm -f whatsapp_linux_${ARCH_SUFFIX}.zip readme.md

# Build TypeScript
RUN npm run build

# Remove devDependencies para imagem final enxuta
RUN npm prune --production

# Create necessary directories
RUN mkdir -p /app/volumes /app/logs /app/sessions

# Create non-root user
RUN groupadd -g 1001 gateway && \
    useradd -u 1001 -g gateway -d /app -s /bin/bash gateway

# Set ownership e garantir binário executável
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
ENV BIN_PATH=/app/whatsapp
ENV SESSIONS_DIR=/app/sessions
ENV VOLUMES_DIR=/app/volumes
ENV APP_BASE_DIR=/app

# Start command (TypeScript build)
CMD ["node", "dist/src/server.js"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV API_PORT=3000
ENV BIN_PATH=/app/whatsapp
ENV SESSIONS_DIR=/app/sessions
ENV VOLUMES_DIR=/app/volumes
ENV APP_BASE_DIR=/app

# Start command (TypeScript build)
CMD ["node", "dist/src/server.js"]