#!/usr/bin/env bash
# =========================================================
#  Préparation du VPS — version SERVEUR PARTAGÉ (MoveCash y tourne déjà)
#  Ne modifie NI Nginx, NI le pare-feu, NI les autres applications.
#    sudo bash setup-vps.sh "ssh-ed25519 AAAA… github-actions-movecolis"
# =========================================================
set -euo pipefail
PUBKEY="${1:?Indiquez la clé PUBLIQUE SSH de déploiement (contenu du fichier .pub)}"
APP_DIR=/opt/movecolis

echo "▶ Docker (dépôt officiel)"
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "▶ Utilisateur deploy (connexion par clé uniquement, utilisé par GitHub Actions)"
id deploy &> /dev/null || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$PUBKEY" /home/deploy/.ssh/authorized_keys 2> /dev/null || echo "$PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "▶ Dossier de l'application : $APP_DIR"
install -d -o deploy -g deploy "$APP_DIR" "$APP_DIR/backups"

echo "▶ Certbot (certificats HTTPS pour Nginx)"
if ! command -v certbot > /dev/null; then
  apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx
fi

echo "▶ Sauvegarde quotidienne de la base à 3 h"
( crontab -u deploy -l 2> /dev/null | grep -v backup.sh || true
  echo "0 3 * * * $APP_DIR/backup.sh >> $APP_DIR/backups/backup.log 2>&1" ) | crontab -u deploy -

echo
echo "✅ Terminé. Docker : $(docker --version)"
