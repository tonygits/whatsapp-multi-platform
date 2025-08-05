#!/bin/bash

# WhatsApp Multi-Platform Cleanup Script
# Executa limpeza regular do sistema

set -e

echo "🧹 Iniciando limpeza do sistema WhatsApp Multi-Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# 1. Clean up Docker system
echo "📦 Limpando sistema Docker..."
docker system prune -f --volumes
docker image prune -f
print_status "Sistema Docker limpo"

# 2. Clean up old container images
echo "🗑️ Removendo imagens de containers antigas..."
# Remove images older than 7 days
docker image prune -f --filter "until=168h"
print_status "Imagens antigas removidas"

# 3. Clean up logs
echo "📝 Limpando logs antigos..."
LOG_DIR="${LOGS_PATH:-./logs}"
if [ -d "$LOG_DIR" ]; then
    # Remove logs older than 30 days
    find "$LOG_DIR" -name "*.log" -type f -mtime +30 -delete
    # Rotate current logs if they're larger than 100MB
    for log_file in "$LOG_DIR"/*.log; do
        if [ -f "$log_file" ] && [ $(stat -c%s "$log_file") -gt 104857600 ]; then
            mv "$log_file" "${log_file}.$(date +%Y%m%d_%H%M%S)"
            touch "$log_file"
            print_warning "Log rotacionado: $(basename $log_file)"
        fi
    done
    print_status "Logs limpos"
else
    print_warning "Diretório de logs não encontrado: $LOG_DIR"
fi

# 4. Clean up temporary volumes
echo "💾 Limpando volumes temporários..."
VOLUMES_DIR="${VOLUMES_BASE_PATH:-./volumes}"
if [ -d "$VOLUMES_DIR" ]; then
    # Find and remove empty session directories
    find "$VOLUMES_DIR" -type d -empty -delete 2>/dev/null || true
    
    # Clean up old temporary files
    find "$VOLUMES_DIR" -name "*.tmp" -type f -mtime +1 -delete 2>/dev/null || true
    find "$VOLUMES_DIR" -name "core.*" -type f -delete 2>/dev/null || true
    
    print_status "Volumes temporários limpos"
else
    print_warning "Diretório de volumes não encontrado: $VOLUMES_DIR"
fi

# 5. Check disk usage
echo "📊 Verificando uso do disco..."
DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
    print_warning "Uso do disco alto: ${DISK_USAGE}%"
    echo "💡 Considere executar limpeza mais agressiva ou aumentar espaço em disco"
else
    print_status "Uso do disco OK: ${DISK_USAGE}%"
fi

# 6. Clean up old backup files (if any)
echo "🗄️ Limpando backups antigos..."
BACKUP_DIR="${BACKUP_PATH:-./backups}"
if [ -d "$BACKUP_DIR" ]; then
    # Keep only last 7 backups
    ls -t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
    print_status "Backups antigos removidos"
fi

# 7. Clean up npm cache
echo "📦 Limpando cache npm..."
if command -v npm &> /dev/null; then
    npm cache clean --force 2>/dev/null || true
    print_status "Cache npm limpo"
fi

# 8. Memory cleanup
echo "🧠 Liberando memória..."
sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || print_warning "Não foi possível limpar cache do kernel (permissão necessária)"

# 9. Generate cleanup report
echo "📋 Gerando relatório de limpeza..."
REPORT_FILE="${LOG_DIR:-./logs}/cleanup_report_$(date +%Y%m%d_%H%M%S).txt"
{
    echo "WhatsApp Multi-Platform Cleanup Report"
    echo "======================================"
    echo "Date: $(date)"
    echo "Disk usage after cleanup: $(df / | awk 'NR==2 {print $5}')"
    echo "Docker images: $(docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}' | wc -l) total"
    echo "Docker containers: $(docker ps -a --format 'table {{.Names}}\t{{.Status}}' | wc -l) total"
    echo "Active WhatsApp containers: $(docker ps --filter 'label=whatsapp.managed_by=gateway' --format '{{.Names}}' | wc -l)"
    echo ""
    echo "Cleanup completed successfully at $(date)"
} > "$REPORT_FILE"

print_status "Relatório salvo em: $REPORT_FILE"

echo ""
echo "🎉 Limpeza concluída com sucesso!"
echo "📈 Espaço liberado, sistema otimizado"
echo ""

# Optional: Show disk usage summary
echo "💾 Resumo de uso do disco:"
df -h / | awk 'NR==2 {printf "   Usado: %s de %s (%.1f%%)\n", $3, $2, ($3/$2)*100}'

exit 0