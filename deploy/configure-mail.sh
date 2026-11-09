#!/usr/bin/env bash
# =========================================================
#  Envoi d'e-mails : enregistre la boîte Hostinger dans .env.api puis redémarre l'API
#    ./configure-mail.sh [adresse]        (par défaut : serviceclient@movecolis.com)
#  Le mot de passe est demandé sans s'afficher : il n'apparaît ni à l'écran ni dans l'historique.
#  À relancer si le mot de passe de la boîte change dans hPanel.
#  Copié automatiquement par GitHub Actions à chaque déploiement.
# =========================================================
set -euo pipefail
cd "$(dirname "$0")"

ADDRESS="${1:-serviceclient@movecolis.com}"
[[ "$ADDRESS" =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]] || { echo "❌ Adresse invalide : $ADDRESS"; exit 1; }
[ -f .env.api ] || { echo "❌ .env.api introuvable dans $(pwd)"; exit 1; }

read -rsp "Mot de passe de la boîte $ADDRESS : " PASSWORD
echo
[ -n "$PASSWORD" ] || { echo "❌ Mot de passe vide : rien n'est modifié."; exit 1; }
case "$PASSWORD" in
  *"'"*) echo "❌ Le mot de passe contient une apostrophe ('), impossible à enregistrer tel quel : changez-le dans hPanel."; exit 1 ;;
esac

BACKUP=".env.api.avant-mail-$(date +%Y%m%d-%H%M%S)"
cp -p .env.api "$BACKUP"
chmod 600 "$BACKUP"

# Anciennes valeurs retirées, nouvelles ajoutées à la fin.
# Guillemets simples : docker compose prend la valeur telle quelle ($, #, espaces compris).
sed -i -E '/^(SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|SMTP_PASS|MAIL_FROM|MAIL_REPLY_TO)=/d; /^# E-mails : boîte Hostinger/d' .env.api
[ -z "$(tail -c1 .env.api)" ] || echo >> .env.api # dernière ligne terminée avant d'ajouter
{
  echo "# E-mails : boîte Hostinger (./configure-mail.sh)"
  echo "SMTP_HOST=smtp.hostinger.com"
  echo "SMTP_PORT=465"
  echo "SMTP_SECURE=true"
  echo "SMTP_USER=$ADDRESS"
  echo "SMTP_PASS='$PASSWORD'"
  echo "MAIL_FROM='MoveColis <$ADDRESS>'"
} >> .env.api
unset PASSWORD
chmod 600 .env.api
echo "✔ .env.api mis à jour (ancienne version : $BACKUP)"

# Redémarre l'API avec la version en ligne (pas « latest »), puis lit le contrôle SMTP fait au démarrage
export TAG="$(cat .deployed_tag 2>/dev/null || echo latest)"
docker compose up -d --force-recreate api

RESULT=""
for _ in $(seq 1 30); do
  RESULT="$(docker compose logs --since 3m api 2>/dev/null | grep -E 'SMTP (prêt|en erreur)' | tail -1 || true)"
  [ -n "$RESULT" ] && break
  sleep 2
done

if [[ "$RESULT" == *"SMTP prêt"* ]]; then
  echo "✅ ${RESULT#*| }"
  echo "   Dernière vérification : Admin → Paramètres → E-mails → « Envoyer le test »."
  exit 0
fi
if [ -n "$RESULT" ]; then
  echo "❌ ${RESULT#*| }"
else
  echo "⚠️  Pas de contrôle SMTP dans les journaux : docker compose logs --tail=50 api"
fi
echo "   Relancez ./configure-mail.sh pour corriger, ou revenez à l'ancienne configuration :"
echo "   cp $BACKUP .env.api && TAG=$TAG docker compose up -d --force-recreate api"
exit 1
