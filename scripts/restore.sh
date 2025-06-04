#!/bin/bash

# Database and Volume Restore Script
# This script restores the PostgreSQL database and Docker volumes from backups

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-container_app}"
DB_USER="${DB_USER:-postgres}"

# Function to display usage
usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "Options:"
  echo "  -d, --database BACKUP_FILE    Restore database from SQL backup file"
  echo "  -v, --volume VOLUME:BACKUP    Restore volume from tar.gz backup"
  echo "  -l, --list                    List available backups"
  echo "  -h, --help                    Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --list"
  echo "  $0 --database ./backups/db_backup_20241201_120000.sql"
  echo "  $0 --volume user-data:./backups/volume_user-data_20241201_120000.tar.gz"
  exit 1
}

# Function to list available backups
list_backups() {
  echo "📋 Available backups in $BACKUP_DIR:"
  echo ""
  echo "Database backups:"
  find "$BACKUP_DIR" -name "db_backup_*.sql" -exec basename {} \; 2>/dev/null | sort -r || echo "  No database backups found"
  echo ""
  echo "Volume backups:"
  find "$BACKUP_DIR" -name "volume_*.tar.gz" -exec basename {} \; 2>/dev/null | sort -r || echo "  No volume backups found"
}

# Function to restore database
restore_database() {
  local backup_file="$1"
  
  if [ ! -f "$backup_file" ]; then
    echo "❌ Backup file not found: $backup_file"
    exit 1
  fi
  
  echo "🔄 Restoring database from: $backup_file"
  echo "⚠️  WARNING: This will overwrite the current database!"
  read -p "Are you sure you want to continue? (y/N): " -n 1 -r
  echo
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restore cancelled"
    exit 1
  fi
  
  echo "📊 Restoring database..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$backup_file"
  echo "✅ Database restore completed successfully!"
}

# Function to restore volume
restore_volume() {
  local volume_spec="$1"
  local volume_name="${volume_spec%%:*}"
  local backup_file="${volume_spec#*:}"
  
  if [ ! -f "$backup_file" ]; then
    echo "❌ Backup file not found: $backup_file"
    exit 1
  fi
  
  if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed"
    exit 1
  fi
  
  echo "🔄 Restoring volume '$volume_name' from: $backup_file"
  echo "⚠️  WARNING: This will overwrite the current volume data!"
  read -p "Are you sure you want to continue? (y/N): " -n 1 -r
  echo
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restore cancelled"
    exit 1
  fi
  
  # Create volume if it doesn't exist
  docker volume create "$volume_name" >/dev/null 2>&1 || true
  
  echo "📦 Restoring volume data..."
  docker run --rm \
    -v "$volume_name":/target \
    -v "$PWD/$(dirname "$backup_file")":/backup:ro \
    alpine:latest \
    sh -c "cd /target && tar xzf /backup/$(basename "$backup_file")"
  
  echo "✅ Volume restore completed successfully!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--database)
      DATABASE_BACKUP="$2"
      shift 2
      ;;
    -v|--volume)
      VOLUME_BACKUP="$2"
      shift 2
      ;;
    -l|--list)
      LIST_BACKUPS=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "❌ Unknown option: $1"
      usage
      ;;
  esac
done

# Execute based on options
if [ "$LIST_BACKUPS" = true ]; then
  list_backups
elif [ -n "$DATABASE_BACKUP" ]; then
  restore_database "$DATABASE_BACKUP"
elif [ -n "$VOLUME_BACKUP" ]; then
  restore_volume "$VOLUME_BACKUP"
else
  echo "❌ No operation specified"
  usage
fi 