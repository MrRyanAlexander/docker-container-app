#!/bin/bash

# Database and Volume Backup Script
# This script creates backups of the PostgreSQL database and Docker volumes

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-container_app}"
DB_USER="${DB_USER:-postgres}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🗄️  Starting backup process..."

# Database backup
echo "📊 Backing up database..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-password --verbose --clean --if-exists \
  > "$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

echo "✅ Database backup completed: $BACKUP_DIR/db_backup_$TIMESTAMP.sql"

# Docker volumes backup (if using Docker)
if command -v docker &> /dev/null; then
  echo "🐳 Backing up Docker volumes..."
  
  # Get list of volumes used by the application
  APP_VOLUMES=$(docker volume ls --filter label=app=container-app --format "{{.Name}}" 2>/dev/null || echo "")
  
  if [ -n "$APP_VOLUMES" ]; then
    for volume in $APP_VOLUMES; do
      echo "📦 Backing up volume: $volume"
      docker run --rm \
        -v "$volume":/source:ro \
        -v "$PWD/$BACKUP_DIR":/backup \
        alpine:latest \
        tar czf "/backup/volume_${volume}_$TIMESTAMP.tar.gz" -C /source .
      echo "✅ Volume backup completed: $BACKUP_DIR/volume_${volume}_$TIMESTAMP.tar.gz"
    done
  else
    echo "ℹ️  No application volumes found to backup"
  fi
fi

# Cleanup old backups (keep last 7 days)
echo "🧹 Cleaning up old backups..."
find "$BACKUP_DIR" -name "*.sql" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "🎉 Backup process completed successfully!"
echo "📁 Backup location: $BACKUP_DIR"
ls -la "$BACKUP_DIR" 