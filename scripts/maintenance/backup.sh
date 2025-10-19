#!/bin/bash

# WhatsApp Multi-Platform Backup Script
# Create full system backup

set -e

echo "💾 Starting WhatsApp Multi-Platform Backup..."

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

print_info "Backup will be saved to: $BACKUP_FILE"

# Temporary directory for staging
TEMP_DIR="/tmp/${BACKUP_NAME}"
mkdir -p "$TEMP_DIR"

echo "📁 Preparing files for backup..."

# 2. Copy application source (without node_modules)
print_info "Copying source code..."
mkdir -p "${TEMP_DIR}/src"
rsync -av --exclude='node_modules' --exclude='.git' --exclude='logs' --exclude='volumes' . "${TEMP_DIR}/src/"
print_status "Source code copied"

# 3. Export database
print_info "Exporting database..."
DATABASE_FILE="${DATABASE_PATH:-./volumes/whatsapp.db}"
if [ -f "$DATABASE_FILE" ]; then
    cp "$DATABASE_FILE" "${TEMP_DIR}/whatsapp_backup.db"
    print_status "Exported database"
else
    print_warning "Bank file not found: $DATABASE_FILE"
fi

# 4. Copy session data (selective)
print_info "Copying session data..."
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
    
    print_status "Session data copied"
else
    print_warning "Volume directory not found: $VOLUMES_DIR"
fi

# 5. Create logs snapshot (recent logs only)
print_info "Creating snapshot of logs..."
LOGS_DIR="${LOGS_PATH:-./logs}"
if [ -d "$LOGS_DIR" ]; then
    mkdir -p "${TEMP_DIR}/logs"
    
    # Copy only logs from last 7 days
    find "$LOGS_DIR" -name "*.log" -mtime -7 -exec cp {} "${TEMP_DIR}/logs/" \; 2>/dev/null || true
    
    print_status "Snapshot of logs created"
fi

# 6. Create backup metadata
print_info "Creating backup metadata..."
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

print_status "Metadata created"

# 7. Create compressed backup
echo "🗜️ Compressing backup..."
tar -czf "$BACKUP_FILE" -C "$(dirname "$TEMP_DIR")" "$(basename "$TEMP_DIR")"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    print_status "Backup created successfully: $BACKUP_SIZE"
else
    print_error "Failed to create backup"
    exit 1
fi

# 8. Cleanup temporary files
print_info "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"
print_status "Cleaning completed"

# 9. Manage backup retention
echo "🗂️ Managing backup retention..."
# Keep only last 7 backups
ls -t "${BACKUP_DIR}"/whatsapp_backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
print_status "Old backups removed (kept last 7)"

# 10. Create backup verification
echo "🔍 Verifying backup integrity..."
if tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
    print_status "Backup verified - integrity OK"
else
    print_error "Backup corrupted!"
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
echo "🎉 Backup completed successfully!"
echo "📄 File: $BACKUP_FILE"
echo "📊 Size: $(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
echo "📋 Report: $REPORT_FILE"
echo ""

# Optional: Show backup summary
echo "📈 Backup Summary:"
ls -lht "${BACKUP_DIR}"/whatsapp_backup_*.tar.gz 2>/dev/null | head -5 || echo "   No previous backups found"

exit 0
