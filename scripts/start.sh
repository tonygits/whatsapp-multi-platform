#!/bin/bash

# WhatsApp Multi-Platform Startup Script
# Starts all necessary services

set -e

echo "🚀 Starting WhatsApp Multi-Platform..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Docker is running"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install docker-compose."
    exit 1
fi

print_status "docker-compose found"

# Create necessary directories
print_info "Creating necessary directories..."
mkdir -p logs volumes
chmod 755 logs volumes
print_status "Directories created"

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        print_info "Copying environment file..."
        cp .env.example .env
        print_warning ".env file created. Please set the necessary variables."
    else
        print_warning "File .env.example not found. Creating basic .env..."
        cat > .env << EOF
API_PORT=3000
NODE_ENV=production
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=admin
DOCKER_SOCKET=/var/run/docker.sock
CONTAINER_BASE_PORT=4000
DB_USER=admin
DB_PASS=pass123
DB_NAME=postgres_db
EOF
    fi
fi

# Build Docker images
print_info "Building Docker images..."
docker-compose build
print_status "Constructed images"

# Start services
print_info "Starting services..."
docker-compose up -d

# Wait for services to be ready
print_info "Waiting for services to be ready..."
sleep 10

# Check if services are running
print_info "Checking service status..."

if docker-compose ps | grep -q "Up"; then
    print_status "Services started successfully"
else
    echo "❌ Some services failed to start"
    echo "📋 Service status:"
    docker-compose ps
    exit 1
fi

# Show running services
echo ""
echo "📋 Service status:"
docker-compose ps

# Show access information
echo ""
echo "🌐 Access information:"
echo "   API Gateway: http://localhost:${API_PORT:-3000}"
echo "   Health Check: http://localhost:${API_PORT:-3000}/api/health"
echo "   Documentation: http://localhost:${API_PORT:-3000}/"

# Show logs command
echo ""
echo "📝 To view logs in real time:"
echo "   docker-compose logs -f"

# Show management commands
echo ""
echo "🛠️ Useful commands:"
echo "Stop: docker-compose down"
echo "Restart: docker-compose restart"
echo "Logs: docker-compose logs -f [service]"
echo "Status: docker-compose ps"

echo ""
print_status "WhatsApp Multi-Platform launched successfully!"

exit 0
