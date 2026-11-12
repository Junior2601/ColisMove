#!/usr/bin/env bash
# =========================================================
#  Base PostgreSQL du VPS : mise en place et reprise des données (en tant que deploy, dans /opt/movecolis)
#    ./import-db.sh                       reprend l'ancienne base Render si elle répond encore, sinon la dernière
#                                         sauvegarde valide de backups/, puis remet le site en ligne sur cette base
#    ./import-db.sh --from fichier.dump   reprend ce fichier
#    ./import-db.sh --empty               nouvelle installation : base vide (le déploiement crée le schéma)
#    --force   remplace une base qui contient déjà des données (restauration d'une sauvegarde)
#    --yes     sans question
#  Relancé alors que la base contient déjà des données : ne réimporte rien, remet seulement le site en ligne.
#  Ensuite : GitHub → Actions → « Re-run failed jobs » sur le dernier déploiement (met en ligne la dernière version).
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"

FROM="" EMPTY=0 FORCE=0 YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:?Indiquez le fichier, ex. --from backups/movecolis-2026-11-10-0300.dump}"; shift 2 ;;
    --empty) EMPTY=1; shift ;;
    --force) FORCE=1; shift ;;
    --yes) YES=1; shift ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1 (voir ./import-db.sh --help)" >&2; exit 2 ;;
  esac
done

[ -f .env ] || { echo "❌ .env introuvable dans $(pwd)" >&2; exit 1; }
mkdir -p backups

confirm() {
  [ "$YES" = 1 ] && return 0
  local answer
  read -r -p "$1 (oui/non) " answer || return 1
  [ "$answer" = "oui" ]
}

# --- 1. Mot de passe de la base (une seule fois), lu par docker compose --------------------------------
if ! grep -qE '^POSTGRES_PASSWORD=.+' .env; then
  [ -z "$(tail -c 1 .env)" ] || echo >> .env # .env sans retour à la ligne final
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" >> .env
  echo "▶ Mot de passe de la base créé dans .env"
fi
chmod 600 .env

# --- 2. Conteneur PostgreSQL -------------------------------------------------------------------------------
echo "▶ Démarrage de la base PostgreSQL du VPS"
docker compose up -d --wait --wait-timeout 120 db
db_sql() { docker compose exec -T db psql -U movecolis -d movecolis -v ON_ERROR_STOP=1 -Atc "$1"; }

HAS_DATA="$(db_sql "SELECT to_regclass('public.users') IS NOT NULL")"
IMPORT=1
if [ "$EMPTY" = 1 ]; then
  IMPORT=0
elif [ "$HAS_DATA" = "t" ] && [ "$FORCE" != 1 ]; then
  echo "ℹ️  La base du VPS contient déjà des données : rien n'est importé (--force pour les remplacer)."
  IMPORT=0
fi

# Le fichier est-il une sauvegarde PostgreSQL lisible ?
valid_dump() {
  [ -s "$1" ] || return 1
  docker compose cp "$1" db:/tmp/check.dump > /dev/null 2>&1 || return 1
  docker compose exec -T db sh -c 'pg_restore -l /tmp/check.dump > /dev/null 2>&1; rc=$?; rm -f /tmp/check.dump; exit $rc'
}

# --- 3. Reprise des données ----------------------------------------------------------------------------------
if [ "$IMPORT" = 1 ]; then
  DUMP=""
  if [ -n "$FROM" ]; then
    valid_dump "$FROM" || { echo "❌ $FROM n'est pas une sauvegarde PostgreSQL lisible." >&2; exit 1; }
    DUMP="$FROM"
  else
    # a) L'ancienne base Render, si elle répond encore : les données les plus récentes
    OLD_URL="$(grep -E '^DATABASE_URL=' .env.api 2> /dev/null | cut -d= -f2- || true)"
    if [[ "$OLD_URL" == *render.com* ]]; then
      echo "▶ Copie de l'ancienne base Render…"
      RENDER_FILE="backups/render-final-$(date +%F-%H%M).dump"
      if timeout 300 docker run --rm -e PGSSLMODE=require -e PGCONNECT_TIMEOUT=15 postgres:18-alpine \
          pg_dump --format=custom --no-owner "$OLD_URL" > "$RENDER_FILE.part" 2> backups/render-final.log; then
        mv "$RENDER_FILE.part" "$RENDER_FILE"
        DUMP="$RENDER_FILE"
        echo "   ✅ Base Render copiée"
      else
        rm -f "$RENDER_FILE.part"
        echo "   ⚠️  Base Render injoignable : $(tail -n 1 backups/render-final.log)"
      fi
    fi
    # b) Sinon, la sauvegarde nocturne valide la plus récente (celles des nuits où Render ne répondait plus sont vides)
    if [ -z "$DUMP" ]; then
      for f in $(ls -t backups/movecolis-*.dump 2> /dev/null); do
        if valid_dump "$f"; then DUMP="$f"; break; fi
        echo "   (ignorée : $f vide ou illisible)"
      done
    fi
    [ -n "$DUMP" ] || { echo "❌ Aucune sauvegarde utilisable dans backups/ : indiquez un fichier avec --from." >&2; exit 1; }
  fi

  echo "▶ Fichier à reprendre : $DUMP ($(du -h "$DUMP" | cut -f1), écrit le $(date -r "$DUMP" '+%d/%m/%Y à %H:%M'))"
  confirm "Importer ce fichier dans la base du VPS ?" || { echo "Annulé : rien n'a été modifié."; exit 1; }

  if [ "$HAS_DATA" = "t" ]; then # --force : on repart d'une base vide
    db_sql "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null
  fi

  echo "▶ Import…"
  docker compose cp "$DUMP" db:/tmp/import.dump
  # pg_stat_statements (extension propre à Render) laissée de côté ; propriétaires et droits de Render ignorés
  set +e
  docker compose exec -T db sh -c '
    pg_restore -l /tmp/import.dump | grep -v pg_stat_statements > /tmp/import.list &&
    pg_restore --no-owner --no-privileges -L /tmp/import.list -U movecolis -d movecolis /tmp/import.dump
    rc=$?; rm -f /tmp/import.dump /tmp/import.list; exit $rc' 2> backups/import.log
  RC=$?
  set -e
  if [ "$RC" != 0 ]; then
    echo "⚠️  L'import a signalé des erreurs (détail : backups/import.log) :"
    grep -E "error|erreur" backups/import.log | head -n 15
    confirm "Continuer malgré ces erreurs ?" || { echo "Arrêt : le site n'a pas été basculé."; exit 1; }
  fi

  echo "▶ Contenu repris :"
  db_sql "SELECT '   comptes : ' || count(*) FROM users
          UNION ALL SELECT '   voyages : ' || count(*) FROM trips
          UNION ALL SELECT '   réservations : ' || count(*) FROM reservations
          UNION ALL SELECT '   conversations : ' || count(*) FROM conversations
          UNION ALL SELECT '   dernière migration : ' || coalesce(max(name), '-') FROM schema_migrations"
fi

touch .db-imported

# --- 4. Remise en ligne, sur la base du VPS, de la version déjà présente ici ------------------------------------
# (images déjà téléchargées : la connexion à ghcr.io de GitHub Actions a expiré depuis)
export TAG="$(cat .deployed_tag 2> /dev/null || true)"
if [ -z "$TAG" ]; then
  echo "✅ Base prête. Mettez le site en ligne depuis GitHub : Actions → dernier déploiement → « Re-run failed jobs »."
  exit 0
fi
echo "▶ Remise en ligne de $TAG sur la base du VPS"
docker compose run --rm --no-deps api npm run db:migrate
docker compose up -d --remove-orphans
for _ in $(seq 1 30); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:4000/api/health > /dev/null 2>&1; then
    echo "✅ Le site répond, sur la base PostgreSQL du VPS (sauvegarde chaque nuit à 3 h dans backups/)."
    echo "   Dernière étape : GitHub → Actions → dernier déploiement → « Re-run failed jobs » (met en ligne la dernière version)."
    exit 0
  fi
  sleep 2
done
echo "❌ L'API ne répond pas :"
docker compose logs --tail=50 api || true
exit 1
