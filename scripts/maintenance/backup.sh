#!/bin/bash

# WhatsApp Multi-Platform Backup Script
# Cria backup completo do sistema

set -e

echo "💾 Iniciando backup do WhatsApp Multi-Platform..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Configuration
BACKUP_DIR="${BACKUP_PATH:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="whatsapp_backup_${TIMESTAMP}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

print_info "Backup será salvo em: $BACKUP_FILE"

# Temporary directory for staging
TEMP_DIR="/tmp/${BACKUP_NAME}"
mkdir -p "$TEMP_DIR"

echo "📁 Preparando arquivos para backup..."

# 1. Copy configuration files
print_info "Copiando arquivos de configuração..."
mkdir -p "${TEMP_DIR}/config"
cp -r ./config/* "${TEMP_DIR}/config/" 2>/dev/null || true
print_status "Configurações copiadas"

# 2. Copy application source (without node_modules)
print_info "Copiando código fonte..."
mkdir -p "${TEMP_DIR}/src"
rsync -av --exclude='node_modules' --exclude='.git' --exclude='logs' --exclude='volumes' . "${TEMP_DIR}/src/"
print_status "Código fonte copiado"

# 3. Export database
print_info "Exportando banco de dados..."
DATABASE_FILE="${DATABASE_PATH:-./volumes/whatsapp.db}"
if [ -f "$DATABASE_FILE" ]; then
    cp "$DATABASE_FILE" "${TEMP_DIR}/whatsapp_backup.db"
    print_status "Banco de dados exportado"
else
    print_warning "Arquivo de banco não encontrado: $DATABASE_FILE"
fi

# 4. Copy session data (selective)
print_info "Copiando dados de sessão..."
VOLUMES_DIR="${VOLUMES_BASE_PATH:-./volumes}"
if [ -d "$VOLUMES_DIR" ]; then
    mkdir -p "${TEMP_DIR}/sessions"
    
    # Copy only essential session files (not temporary ones)
    for session_dir in "$VOLUMES_DIR"/*; do
        if [ -d "$session_dir" ]; then
            session_name=$(basename "$session_dir")
            mkdir -p "${TEMP_DIR}/sessions/${session_name}"
            
            # Copy database files
            cp "$session_dir"/*.db "${TEMP_DIR}/sessions/${session_name}/" 2>/dev/null || true
            # Copy key files
            cp "$session_dir"/*.key "${TEMP_DIR}/sessions/${session_name}/" 2>/dev/null || true
            # Copy session files
            cp "$session_dir"/*.session "${TEMP_DIR}/sessions/${session_name}/" 2>/dev/null || true
        fi
    done
    
    print_status "Dados de sessão copiados"
else
    print_warning "Diretório de volumes não encontrado: $VOLUMES_DIR"
fi

# 5. Create logs snapshot (recent logs only)
print_info "Criando snapshot dos logs..."
LOGS_DIR="${LOGS_PATH:-./logs}"
if [ -d "$LOGS_DIR" ]; then
    mkdir -p "${TEMP_DIR}/logs"
    
    # Copy only logs from last 7 days
    find "$LOGS_DIR" -name "*.log" -mtime -7 -exec cp {} "${TEMP_DIR}/logs/" \; 2>/dev/null || true
    
    print_status "Snapshot dos logs criado"
fi

# 6. Create backup metadata
print_info "Criando metadados do backup..."
{
    echo "WhatsApp Multi-Platform Backup"
    echo "=============================="
    echo "Backup Date: $(date)"
    echo "Backup Name: $BACKUP_NAME"
    echo "System Info:"
    echo "  OS: $(uname -s) $(uname -r)"
    echo "  Hostname: $(hostname)"
    echo "  User: $(whoami)"
    echo ""
    echo "Application Info:"
    echo "  Node Version: $(node --version 2>/dev/null || echo 'Not found')"
    echo "  Docker Version: $(docker --version 2>/dev/null || echo 'Not found')"
    echo ""
    echo "Backup Contents:"
    echo "  ✓ Configuration files"
    echo "  ✓ Application source code"
    echo "  ✓ Device configurations"
    echo "  ✓ Session data"
    echo "  ✓ Docker configuration"
    echo "  ✓ Recent logs (7 days)"
    echo ""
    echo "Backup Size: $(du -sh "$TEMP_DIR" | cut -f1)"
    echo "Files Count: $(find "$TEMP_DIR" -type f | wc -l)"
} > "${TEMP_DIR}/backup_info.txt"

print_status "Metadados criados"

# 7. Create compressed backup
echo "🗜️ Comprimindo backup..."
tar -czf "$BACKUP_FILE" -C "$(dirname "$TEMP_DIR")" "$(basename "$TEMP_DIR")"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    print_status "Backup criado com sucesso: $BACKUP_SIZE"
else
    print_error "Falha ao criar backup"
    exit 1
fi

# 8. Cleanup temporary files
print_info "Limpando arquivos temporários..."
rm -rf "$TEMP_DIR"
print_status "Limpeza concluída"

# 9. Manage backup retention
echo "🗂️ Gerenciando retenção de backups..."
# Keep only last 7 backups
ls -t "${BACKUP_DIR}"/whatsapp_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
print_status "Backups antigos removidos (mantidos últimos 7)"

# 10. Create backup verification
echo "🔍 Verificando integridade do backup..."
if tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
    print_status "Backup verificado - integridade OK"
else
    print_error "Backup corrompido!"
    exit 1
fi

# 11. Generate backup report
REPORT_FILE="${BACKUP_DIR}/backup_report_${TIMESTAMP}.txt"
{
    echo "WhatsApp Multi-Platform Backup Report"
    echo "====================================="
    echo "Date: $(date)"
    echo "Backup File: $BACKUP_FILE"
    echo "Backup Size: $(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
    echo "Verification: PASSED"
    echo ""
    echo "Contents verified:"
    tar -tzf "$BACKUP_FILE" | head -20
    echo "... and $(tar -tzf "$BACKUP_FILE" | wc -l) total files"
    echo ""
    echo "Storage location: $BACKUP_DIR"
    echo "Available space: $(df -h "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
} > "$REPORT_FILE"

echo ""
echo "🎉 Backup concluído com sucesso!"
echo "📄 Arquivo: $BACKUP_FILE"
echo "📊 Tamanho: $(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
echo "📋 Relatório: $REPORT_FILE"
echo ""

# Optional: Show backup summary
echo "📈 Resumo dos backups:"
ls -lht "${BACKUP_DIR}"/whatsapp_backup_*.tar.gz 2>/dev/null | head -5 || echo "   Nenhum backup anterior encontrado"

exit 0