#!/usr/bin/env bash
# =========================================================
#  Sauvegarde de la base Render sur le VPS (cron quotidien, 3 h) : garde 14 jours
#  Restauration : docker run --rm -i postgres:18-alpine pg_restore --clean --no-owner -d "$DATABASE_URL" < fichier.dump
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups

DATABASE_URL="$(grep -E '^DATABASE_URL=' .env.api | cut -d= -f2-)"
FILE="backups/movecolis-$(date +%F-%H%M).dump"

# pg_dump doit être d'une version ≥ à celle du serveur : la base Render est en PostgreSQL 18
docker run --rm -e PGSSLMODE=require postgres:18-alpine pg_dump --format=custom --no-owner "$DATABASE_URL" > "$FILE"

find backups -name "movecolis-*.dump" -mtime +14 -delete
echo "$(date '+%F %T') ✅ $FILE ($(du -h "$FILE" | cut -f1))"
