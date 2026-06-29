#!/bin/bash
# Daily backup of the NBC Bible Plan stack: Directus Postgres DB + uploads + app SQLite.
# Installed via cron. Keeps 14 days. So "no backup" never happens again.
set -euo pipefail

BACKUP_DIR=/opt/nbc/backups
STACK_DIR=/opt/nbc/bible-plan/deploy
KEEP_DAYS=14
TS=$(date -u +%Y%m%d-%H%M%S)

cd "$STACK_DIR"

# 1) Postgres (Directus) logical dump
docker exec nbc-bible-postgres-1 pg_dump -U directus -d directus \
  | gzip > "$BACKUP_DIR/directus-db-$TS.sql.gz"

# 2) Directus uploads volume
docker run --rm \
  -v nbc-bible_directus_uploads:/data:ro \
  -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/directus-uploads-$TS.tar.gz" -C /data . || true

# 3) App SQLite (Lucia auth/sessions)
docker run --rm \
  -v nbc-bible_app_db:/data:ro \
  -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/app-db-$TS.tar.gz" -C /data . || true

# Rotate
find "$BACKUP_DIR" -name 'directus-db-*.sql.gz' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name 'directus-uploads-*.tar.gz' -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name 'app-db-*.tar.gz' -mtime +$KEEP_DAYS -delete

echo "[$(date -u +%FT%TZ)] backup done: $TS"
