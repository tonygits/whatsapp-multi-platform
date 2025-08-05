# Use official go-whatsapp-web-multidevice image
FROM aldinokemal2104/go-whatsapp-web-multidevice:latest

# Install additional tools
USER root
RUN apk add --no-cache curl jq

# Create app directory and set permissions
WORKDIR /app
RUN mkdir -p /app/sessions /app/statics/images/qrcode && \
    chown -R 1001:1001 /app

# Copy custom configuration
COPY config/config.yml /app/config.yml

# Create startup script
COPY scripts/start-container.sh /app/start.sh
RUN chmod +x /app/start.sh

# Switch back to non-root user
USER 1001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${WHATSAPP_API_PORT:-3000}/app/reconnect || exit 1

# Expose port (same as original)
EXPOSE 3000

# Environment variables
ENV WHATSAPP_API_PORT=3000
ENV WHATSAPP_API_HOST=0.0.0.0

# Run startup script
CMD ["/app/start.sh"]