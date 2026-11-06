#!/bin/sh
# Daily backup of the database and the blog photos, kept 30 days (plan/decisions.md, 26/10:
# backups are kept 30 days, so a deleted account is gone from them within 30 days).
# Run as the skinwise user from cron, e.g.:  15 3 * * *  /srv/skinwise/app/deploy/backup.sh
# Keep backups on a server in Vietnam (Law 91/2025 Art. 20).
set -eu

BACKUP_DIR=${BACKUP_DIR:-/srv/skinwise/backups}
UPLOAD_DIR=${UPLOAD_DIR:-/srv/skinwise/uploads}
DB=${DB:-skinwise}
KEEP_DAYS=${KEEP_DAYS:-30}

stamp=$(date +%Y-%m-%d)
mkdir -p "$BACKUP_DIR"
umask 077
pg_dump --format=custom --file="$BACKUP_DIR/db-$stamp.dump" "$DB"
tar -czf "$BACKUP_DIR/uploads-$stamp.tar.gz" -C "$UPLOAD_DIR" .
find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$((KEEP_DAYS - 1))" -delete
