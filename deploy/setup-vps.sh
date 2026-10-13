#!/usr/bin/env bash
# =========================================================
#  Préparation d'un VPS Ubuntu 22.04 / 24.04 (Hostinger), une seule fois, en root :
#    sudo bash setup-vps.sh "ssh-ed25519 AAAA… github-actions-movecolis"
#  Docker, utilisateur "deploy" (utilisé par GitHub Actions), pare-feu, mises à jour automatiques, sauvegarde.
# =========================================================
set -euo pipefail
PUBKEY="${1:?Indiquez la clé PUBLIQUE SSH de déploiement (contenu du fichier .pub)}"
APP_DIR=/opt/movecolis

echo "▶ Mises à jour du système"
apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade

echo "▶ Docker"
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

echo "▶ Utilisateur deploy (sans mot de passe, connexion par clé uniquement)"
id deploy &> /dev/null || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$PUBKEY" /home/deploy/.ssh/authorized_keys 2> /dev/null || echo "$PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "▶ Dossier de l'application : $APP_DIR"
install -d -o deploy -g deploy "$APP_DIR" "$APP_DIR/backups"

echo "▶ Pare-feu : SSH, HTTP, HTTPS uniquement"
DEBIAN_FRONTEND=noninteractive apt-get install -y ufw fail2ban unattended-upgrades
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

echo "▶ Mises à jour de sécurité automatiques"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "▶ Sauvegarde quotidienne de la base à 3 h"
( crontab -u deploy -l 2> /dev/null | grep -v backup.sh || true
  echo "0 3 * * * $APP_DIR/backup.sh >> $APP_DIR/backups/backup.log 2>&1" ) | crontab -u deploy -

cat << MSG

✅ VPS prêt. Il reste à créer, en tant que deploy, deux fichiers dans $APP_DIR :
   - .env      (modèle : deploy/.env.example)
   - .env.api  (modèle : deploy/.env.api.example), puis : chmod 600 $APP_DIR/.env.api
Ensuite, un push sur la branche main de GitHub déploie le site.
MSG
