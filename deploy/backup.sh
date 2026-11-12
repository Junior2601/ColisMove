#!/usr/bin/env bash
# =========================================================
#  Sauvegarde de la base PostgreSQL du VPS (cron quotidien, 3 h) : garde 14 jours
#  Restauration (remplace toutes les données) : ./import-db.sh --force --from backups/movecolis-AAAA-MM-JJ-HHMM.dump
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups

FILE="backups/movecolis-$(date +%F-%H%M).dump"
PART="$FILE.part"
trap 'rm -f "$PART"' EXIT

# Fichier écrit à part puis renommé : une sauvegarde ratée ne laisse jamais de fichier vide ou tronqué
docker compose exec -T db pg_dump --format=custom --no-owner -U movecolis movecolis > "$PART"
mv "$PART" "$FILE"

find backups -name "movecolis-*.dump" -mtime +14 -delete
echo "$(date '+%F %T') ✅ $FILE ($(du -h "$FILE" | cut -f1))"
