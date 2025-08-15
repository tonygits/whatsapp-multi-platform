#!/bin/bash

# WhatsApp Multi-Platform Startup Script
# Inicia todos os serviços necessários

set -e

echo "🚀 Iniciando WhatsApp Multi-Platform..."

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
    echo "❌ Docker não está rodando. Por favor, inicie o Docker primeiro."
    exit 1
fi

print_status "Docker está rodando"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose não encontrado. Por favor, instale o docker-compose."
    exit 1
fi

print_status "docker-compose encontrado"

# Create necessary directories
print_info "Criando diretórios necessários..."
mkdir -p logs volumes config/docker
chmod 755 logs volumes
print_status "Diretórios criados"

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        print_info "Copiando arquivo de ambiente..."
        cp .env.example .env
        print_warning "Arquivo .env criado. Por favor, configure as variáveis necessárias."
    else
        print_warning "Arquivo .env.example não encontrado. Criando .env básico..."
        cat > .env << EOF
API_PORT=3000
NODE_ENV=production
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASS=admin
DOCKER_SOCKET=/var/run/docker.sock
CONTAINER_BASE_PORT=4000
EOF
    fi
fi

# Build Docker images
print_info "Construindo imagens Docker..."
docker-compose build
print_status "Imagens construídas"

# Start services
print_info "Iniciando serviços..."
docker-compose up -d

# Wait for services to be ready
print_info "Aguardando serviços ficarem prontos..."
sleep 10

# Check if services are running
print_info "Verificando status dos serviços..."

if docker-compose ps | grep -q "Up"; then
    print_status "Serviços iniciados com sucesso"
else
    echo "❌ Alguns serviços falharam ao iniciar"
    echo "📋 Status dos serviços:"
    docker-compose ps
    exit 1
fi

# Show running services
echo ""
echo "📋 Status dos serviços:"
docker-compose ps

# Show access information
echo ""
echo "🌐 Informações de acesso:"
echo "   API Gateway: http://localhost:${API_PORT:-3000}"
echo "   Health Check: http://localhost:${API_PORT:-3000}/api/health"
echo "   Documentação: http://localhost:${API_PORT:-3000}/"

# Show logs command
echo ""
echo "📝 Para ver os logs em tempo real:"
echo "   docker-compose logs -f"

# Show management commands
echo ""
echo "🛠️ Comandos úteis:"
echo "   Parar: docker-compose down"
echo "   Reiniciar: docker-compose restart"
echo "   Logs: docker-compose logs -f [service]"
echo "   Status: docker-compose ps"

echo ""
print_status "WhatsApp Multi-Platform iniciado com sucesso!"

exit 0