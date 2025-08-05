# Multi-stage build for WhatsApp container
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Clone and build go-whatsapp-web-multidevice
RUN git clone https://github.com/aldinokemal/go-whatsapp-web-multidevice.git .

# Copy custom source code if needed
COPY src/ ./ 

# Download dependencies
RUN go mod download

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main .

# Final stage
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates tzdata curl

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/main .

# Create sessions directory
RUN mkdir -p /app/sessions && chmod 755 /app/sessions

# Copy configuration files
COPY config/config.yml ./config.yml

# Create non-root user
RUN addgroup -g 1001 -S whatsapp && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G whatsapp whatsapp

# Set ownership
RUN chown -R whatsapp:whatsapp /app

# Switch to non-root user
USER whatsapp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${API_PORT:-3001}/health || exit 1

# Expose port
EXPOSE 3001

# Environment variables
ENV GIN_MODE=release
ENV APP_PORT=3001
ENV APP_ENV=production

# Run the application
CMD ["./main"]