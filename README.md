# MoveColis — Mise en ligne (Docker · GitHub · Render · VPS Hostinger)

```
              GitHub (push sur main)
                      │  GitHub Actions : vérifications → images Docker → déploiement
                      ▼
 ghcr.io (images) ─► VPS Hostinger (Frankfurt) ────────────────────────► Render PostgreSQL
                     Nginx déjà en place (HTTPS Certbot)                   (Frankfurt, connexion
 https://movecolis.com ─► movecolis.conf                                    chiffrée, IP du VPS)
                           ├─ /api, /socket.io → 127.0.0.1:4100 (conteneur api)
                           └─ le reste         → 127.0.0.1:8100 (conteneur web)
                     movecash.site, api.movecash.site : inchangés
```

## Organisation du dépôt

```
movecolis/
├── .github/workflows/ci-cd.yml   ← pipeline
├── backend/                      ← API
├── frontend/                     ← site React (+ Dockerfile, nginx.conf interne au conteneur)
├── deploy/
│   ├── docker-compose.yml        ← conteneurs api + web (copié à chaque déploiement)
│   ├── deploy.sh, backup.sh      ← déploiement avec retour arrière, sauvegarde quotidienne
│   ├── setup-vps.sh              ← préparation du VPS (serveur partagé : ne touche à rien d'existant)
│   ├── nginx/movecolis.conf      ← site Nginx à installer une fois
│   └── .env.example, .env.api.example
└── docker-compose.dev.yml        ← PostgreSQL local pour le développement
```

## Étapes

1. **Dépôt GitHub** privé, `package-lock.json` inclus (backend et frontend).
2. **Render** : base PostgreSQL à **Frankfurt** (même ville que le VPS). External Database URL ; *Access Control* : IP du VPS uniquement.
   ⚠️ Une base gratuite expire après 30 jours : passez-la en offre payante avant l'ouverture au public (les données sont conservées).
3. **DNS** : enregistrements **A** `@` et `www` → IP du VPS. Pas d'enregistrement AAAA (IPv6).
4. **VPS** (en root) :
   ```bash
   bash setup-vps.sh "ssh-ed25519 AAAA… github-actions-movecolis"     # Docker, utilisateur deploy, Certbot, sauvegarde
   cp movecolis.conf /etc/nginx/sites-available/movecolis.conf
   ln -s /etc/nginx/sites-available/movecolis.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d movecolis.com -d www.movecolis.com              # HTTPS
   ```
5. **Secrets du VPS** (en tant que deploy, dans `/opt/movecolis`) : `.env` et `.env.api` d'après les modèles, puis `chmod 600 .env .env.api`.
6. **GitHub** → *Settings* : environnement `production` ; secrets `VPS_HOST`, `VPS_USER` (= deploy), `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` ; variable `DOMAIN`.
7. **Push sur main** → *Actions*. La base vide reçoit le schéma complet automatiquement.
8. **Compte admin** (une fois) : `ssh deploy@IP "cd /opt/movecolis && docker compose run --rm api npm run db:seed"`.

## Au quotidien

- **Travailler** : branche → *pull request* (vérifications) → fusion dans `main` → mise en ligne automatique.
- **Revenir en arrière** : `ssh deploy@IP "cd /opt/movecolis && ./deploy.sh sha-xxxxxxx"` (automatique si la nouvelle version ne répond pas).
- **Journaux** : `docker compose logs -f api` dans `/opt/movecolis`.
- **Sauvegardes** : chaque nuit à 3 h dans `/opt/movecolis/backups` (14 jours) — copiez-les aussi ailleurs.
- **Évolutions de la base** : nouveau fichier `backend/database/migrations/00X_….sql` (rejouable, sans perte), appliqué au déploiement suivant.

## Développement local

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL 17 sur localhost:5432
cd backend  && npm run db:migrate && npm run db:seed:demo && npm run dev
cd frontend && npm run dev
```
