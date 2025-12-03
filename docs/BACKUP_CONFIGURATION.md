# Automatic Backup Configuration

## Environment Variables

### Basic Settings

| Variable | Standard         | Description |
|----------|------------------|-----------|
| `BACKUP_ENABLED` | `false`          | Enables/disables the automatic backup system|
| `BACKUP_SCHEDULE` | `0 2 * * *`      | Backup schedule (cron format) - default: 2 AM every day |
| `BACKUP_TIMEZONE` | `Africq/Nairobi` | Time zone for running backups|
| `BACKUP_MAX_BACKUPS` | `3`              | Maximum number of backups to keep (older versions are removed)|
| `BACKUP_STOP_INSTANCES` | `false`          | For instances before backup for greater data security|

### S3 Settings

| Variable | Standard | Description |
|----------|--------|----------|
| `BACKUP_S3_BUCKET` | - | Nome do bucket S3 (mandatory) |
| `BACKUP_S3_REGION` | `us-east-1` | S3 region|
| `BACKUP_S3_ACCESS_KEY` | - | Access Key do S3 (mandatory) |
| `BACKUP_S3_SECRET_KEY` | - | Secret Key do S3 (mandatory) |
| `BACKUP_S3_ENDPOINT` | - | Custom S3 endpoint (optional - for S3 compatible) |

### Compression and Security Settings

| Variable | Standard | Description |
|----------|--------|-----------|
| `BACKUP_COMPRESSION_LEVEL` | `6` | Compression level (1-9, where 9 is maximum compression)|
| `BACKUP_ENCRYPTION_KEY` | - | Key for AES-256 encryption (optional)|

## Configuration Example

```bash
# .env
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_TIMEZONE=Africa/Nairobi
BACKUP_MAX_BACKUPS=3
BACKUP_STOP_INSTANCES=true

# S3 Configuration
BACKUP_S3_BUCKET=my-whatsapp-backups
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
BACKUP_S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Security
BACKUP_COMPRESSION_LEVEL=6
BACKUP_ENCRYPTION_KEY=minha-chave-super-secreta-256-bits
```

## Common Backup Schedules

| Cron Expression| Description |
|----------------|-----------|
| `0 2 * * *` | Every day at 2am|
| `0 2 * * 0` | Sundays at 2am|
| `0 */6 * * *` | Every 6 hours|
| `0 2 1 * *` | On the first day of the month at 2 am|

## Endpoints da API

### GET /api/backup/status
Returns the current status of the backup system.

### POST /api/backup/trigger
Performs a manual backup immediately.

### GET /api/backup/list
Lists all available backups in S3.

### POST /api/backup/restore
Restores a specific backup.

```json
{
  "backupKey": "backups/whatsapp-data-backup-2025-08-29T05-00-00-000Z.tar.gz"
}
```

## Backup Structure

Backups are saved to S3 with the following structure:

```
s3://meu-bucket/
├── backups/
│   ├── whatsapp-data-backup-2025-08-29T02-00-00-000Z.tar.gz
│   ├── whatsapp-data-backup-2025-08-29T02-00-00-000Z.tar.gz.metadata.json
│   ├── whatsapp-data-backup-2025-08-28T02-00-00-000Z.tar.gz
│   ├── whatsapp-data-backup-2025-08-28T02-00-00-000Z.tar.gz.metadata.json
│   └── ...
```

### Backup Metadata

Each backup includes a JSON metadata file:

```json
{
  "timestamp": "2025-08-29T02:00:00.000Z",
  "size": 1048576,
  "checksum": "sha256:abc123...",
  "compressed": true,
  "encrypted": true,
  "version": "1.0.0"
}
```

## Security

- **Cryptography**: Use `BACKUP_ENCRYPTION_KEY` to encrypt backups
- **S3 Access**: Configure restrictive IAM policies
- **Credentials**: Keep S3 keys safe
- **Network**: Use HTTPS/TLS for all transfers

## Monitoring

- Detailed logs in `/logs/app.log`
- WebSocket notifications for backup status
- Endpoint metrics `/api/backup/status`

## Restoration

⚠️ **ATTENTION**: Restoring completely replaces the current `data` folder. A backup of the current folder is created before restoring as a safety precaution.

## Troubleshooting

### Error: "BACKUP_S3_BUCKET is not configured"
Set the `BACKUP_S3_BUCKET` variable to the name of your S3 bucket.

### Error: "Failed to connect to S3"
Verify AWS credentials and connectivity.

### Backup fails during compression
Check that there is enough disk space in the `temp` folder.

### Encryption failed
Verify that `BACKUP_ENCRYPTION_KEY` is at least 32 characters long.
