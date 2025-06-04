# Backup and Restore Procedures

This document outlines the backup and restore procedures for the per-user containerized application, including database backups, volume backups, and disaster recovery procedures.

## Overview

The application uses PostgreSQL for data storage and Docker volumes for persistent container data. Regular backups are essential for data protection and disaster recovery.

## Backup Procedures

### Automated Backups

The application includes automated backup scripts that should be run regularly via cron jobs or CI/CD pipelines.

#### Database Backups

```bash
# Run database backup
./scripts/backup.sh

# Or with custom configuration
BACKUP_DIR=/path/to/backups DB_HOST=prod-db ./scripts/backup.sh
```

#### Configuration Options

Set these environment variables to customize backup behavior:

- `BACKUP_DIR`: Directory to store backups (default: `./backups`)
- `DB_HOST`: Database host (default: `localhost`)
- `DB_PORT`: Database port (default: `5432`)
- `DB_NAME`: Database name (default: `container_app`)
- `DB_USER`: Database user (default: `postgres`)

#### Backup Schedule

Recommended backup schedule:
- **Daily**: Full database backup
- **Weekly**: Full system backup including volumes
- **Monthly**: Archive backups to long-term storage

#### Setting up Automated Backups

Add to crontab for daily backups at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line for daily backups
0 2 * * * /path/to/your/app/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### Manual Backups

For immediate backups before maintenance or deployments:

```bash
# Quick database backup
./scripts/backup.sh

# Backup specific volume
docker run --rm -v volume_name:/source:ro -v $(pwd)/backups:/backup alpine:latest tar czf /backup/manual_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C /source .
```

## Restore Procedures

### Database Restore

#### List Available Backups

```bash
./scripts/restore.sh --list
```

#### Restore from Backup

```bash
# Restore database from specific backup
./scripts/restore.sh --database ./backups/db_backup_20241201_120000.sql

# Restore volume from backup
./scripts/restore.sh --volume user-data:./backups/volume_user-data_20241201_120000.tar.gz
```

### Emergency Restore Procedures

#### Complete System Restore

1. **Stop all services**:
   ```bash
   docker-compose down
   ```

2. **Restore database**:
   ```bash
   ./scripts/restore.sh --database ./backups/latest_db_backup.sql
   ```

3. **Restore volumes**:
   ```bash
   # Restore each volume
   ./scripts/restore.sh --volume user-data:./backups/volume_user-data_latest.tar.gz
   ./scripts/restore.sh --volume app-data:./backups/volume_app-data_latest.tar.gz
   ```

4. **Start services**:
   ```bash
   docker-compose up -d
   ```

5. **Verify restoration**:
   ```bash
   # Check database connectivity
   npm run db:studio
   
   # Check application health
   curl http://localhost:3000/api/health
   ```

#### Point-in-Time Recovery

For recovering to a specific point in time:

1. **Identify the backup closest to desired time**:
   ```bash
   ./scripts/restore.sh --list
   ```

2. **Stop application services**:
   ```bash
   docker-compose down
   ```

3. **Restore database to specific point**:
   ```bash
   ./scripts/restore.sh --database ./backups/db_backup_YYYYMMDD_HHMMSS.sql
   ```

4. **Apply any necessary migrations**:
   ```bash
   cd frontend && npm run db:migrate:deploy
   ```

5. **Restart services and verify**:
   ```bash
   docker-compose up -d
   ```

## Backup Verification

### Testing Backup Integrity

Regularly test backup integrity:

```bash
# Test database backup
pg_restore --list ./backups/db_backup_latest.sql

# Test volume backup
tar -tzf ./backups/volume_user-data_latest.tar.gz | head -10
```

### Backup Monitoring

Monitor backup processes:

1. **Check backup logs**:
   ```bash
   tail -f /var/log/backup.log
   ```

2. **Verify backup file sizes**:
   ```bash
   ls -lh ./backups/
   ```

3. **Set up alerts** for backup failures in your monitoring system

## Disaster Recovery

### Recovery Time Objectives (RTO)

- **Database restore**: < 30 minutes
- **Full system restore**: < 2 hours
- **Container data restore**: < 1 hour

### Recovery Point Objectives (RPO)

- **Maximum data loss**: 24 hours (daily backups)
- **Critical data loss**: 1 hour (with hourly backups enabled)

### Disaster Recovery Checklist

1. ✅ **Assess the situation**
   - Determine scope of data loss
   - Identify last known good state

2. ✅ **Secure the environment**
   - Stop all services to prevent further damage
   - Isolate affected systems

3. ✅ **Restore from backups**
   - Follow restore procedures above
   - Start with most recent verified backup

4. ✅ **Verify restoration**
   - Test database connectivity
   - Verify application functionality
   - Check user data integrity

5. ✅ **Resume operations**
   - Start all services
   - Monitor for issues
   - Communicate status to users

## Best Practices

### Backup Security

- **Encrypt backups** at rest and in transit
- **Store backups** in multiple locations (local + cloud)
- **Limit access** to backup files
- **Regular security audits** of backup procedures

### Backup Retention

- **Daily backups**: Keep for 30 days
- **Weekly backups**: Keep for 12 weeks
- **Monthly backups**: Keep for 12 months
- **Yearly backups**: Keep for 7 years (compliance)

### Testing

- **Monthly restore tests** in staging environment
- **Quarterly disaster recovery drills**
- **Annual full system recovery test**

## Troubleshooting

### Common Issues

#### Backup Script Fails

```bash
# Check disk space
df -h

# Check database connectivity
pg_isready -h $DB_HOST -p $DB_PORT

# Check permissions
ls -la scripts/backup.sh
```

#### Restore Fails

```bash
# Check backup file integrity
file ./backups/db_backup_latest.sql

# Check database permissions
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "\l"

# Check available space
df -h
```

#### Volume Restore Issues

```bash
# Check Docker daemon
docker info

# Check volume exists
docker volume ls

# Check volume permissions
docker run --rm -v volume_name:/data alpine:latest ls -la /data
```

## Support

For backup and restore support:

1. **Check logs**: `/var/log/backup.log`
2. **Review documentation**: This file and README.md
3. **Contact support**: Include backup logs and error messages
4. **Emergency contact**: [Your emergency contact information]

---

**Remember**: Always test your backups regularly and keep this documentation updated with any changes to your backup procedures. 