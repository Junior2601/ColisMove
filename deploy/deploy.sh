#!/usr/bin/env bash
# =========================================================
#  Déploiement d'une version sur le VPS :  ./deploy.sh sha-1a2b3c4
#  (lancé automatiquement par GitHub Actions ; utilisable à la main pour revenir en arrière)
#  1. télécharge les images  2. migre la base  3. redémarre  4. vérifie, sinon retour à la version précédente
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"

export TAG="${1:?Usage : ./deploy.sh <tag>  (ex. sha-1a2b3c4)}"
PREVIOUS_TAG="$(cat .deployed_tag 2>/dev/null || echo latest)"
echo "▶ Déploiement de $TAG (version actuelle : $PREVIOUS_TAG)"

# Base PostgreSQL du VPS : on ne migre jamais une base dont les données n'ont pas encore été reprises
# (sur une base vide, la migration créerait un site vide)
if [ ! -f .db-imported ]; then
  echo "❌ La base PostgreSQL du VPS n'est pas encore en place : lancez d'abord ./import-db.sh (voir README)."
  exit 1
fi

docker compose pull api web
docker compose up -d --wait --wait-timeout 120 db

# Migrations de la base (sans perte de données) avec la NOUVELLE version de l'API
docker compose run --rm --no-deps api npm run db:migrate

docker compose up -d --remove-orphans

# L'API doit répondre (base de données comprise) dans la minute
for _ in $(seq 1 30); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:4000/api/health > /dev/null 2>&1; then
    echo "$TAG" > .deployed_tag
    docker image prune -f > /dev/null
    echo "✅ $TAG est en ligne."
    exit 0
  fi
  sleep 2
done

echo "❌ L'API ne répond pas : retour à $PREVIOUS_TAG."
docker compose logs --tail=50 api || true
TAG="$PREVIOUS_TAG" docker compose up -d --remove-orphans
exit 1
