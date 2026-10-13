# MoveColis — Mise en ligne (Docker · GitHub · Render · VPS Hostinger)

```
                 GitHub (push sur main)
                         │  GitHub Actions : vérifications → images Docker → déploiement
                         ▼
 ghcr.io (images) ──► VPS Hostinger ──────────────────────────────► Render PostgreSQL
                      ┌──────────── docker compose ─────────────┐    (connexion chiffrée,
 https://movecolis.com│ caddy (HTTPS automatique)                │     IP du VPS seule autorisée)
 ────────────────────►│  ├─ /api, /socket.io → api (Node.js)     │────────┘
                      │  └─ le reste        → web (Nginx, React) │
                      └──────────────────────────────────────────┘
```

## Organisation du dépôt (un seul dépôt GitHub)

```
movecolis/
├── .github/workflows/ci-cd.yml   ← pipeline
├── backend/                      ← l'API (fournie complète)
├── frontend/                     ← TON dossier frontend complet + Dockerfile, nginx.conf, .dockerignore, index.html
├── deploy/                       ← docker-compose, Caddyfile, scripts du VPS
└── docker-compose.dev.yml        ← PostgreSQL local pour le développement
```

⚠️ `backend/package-lock.json` et `frontend/package-lock.json` doivent être dans Git (`npm install` une fois dans chaque dossier).

---

## 1. Base de données Render

1. **New → PostgreSQL**, région la plus proche du VPS (ex. Frankfurt si le VPS est en Europe).
   **Offre payante en production** : la base gratuite expire après 30 jours, puis est supprimée, et n'a pas de sauvegardes.
2. **PostgreSQL 16 ou 17** (12 minimum).
3. Copiez l'**External Database URL** (menu *Connect*).
4. *Access Control* : remplacez `0.0.0.0/0` par **l'IP du VPS**.

## 2. Nom de domaine

Enregistrements **A** `@` et `www` → IP du VPS. Le HTTPS s'active tout seul une fois le DNS propagé.

## 3. Clé SSH de déploiement (sur votre ordinateur)

```bash
ssh-keygen -t ed25519 -f movecolis_deploy -C "github-actions-movecolis" -N ""
```
`movecolis_deploy.pub` (publique) → VPS · `movecolis_deploy` (privée) → GitHub.

## 4. VPS Hostinger (une seule fois)

Système : **Ubuntu 24.04** (hPanel → VPS → Système d'exploitation). Pare-feu hPanel : autorisez 22, 80 et 443.

```bash
scp deploy/setup-vps.sh root@IP_DU_VPS:/root/
ssh root@IP_DU_VPS
bash setup-vps.sh "ssh-ed25519 AAAA… github-actions-movecolis"   # contenu de movecolis_deploy.pub
```

Puis, en tant que **deploy** (`su - deploy`) :
```bash
cd /opt/movecolis
nano .env        # modèle : deploy/.env.example
nano .env.api    # modèle : deploy/.env.api.example   (JWT_SECRET : openssl rand -hex 64)
chmod 600 .env .env.api
```

## 5. GitHub

1. Dépôt **privé** `movecolis` organisé comme ci-dessus, puis `git push`.
2. *Settings → Environments* : créez **production** (option : *Required reviewers* pour valider chaque mise en ligne).
3. *Settings → Secrets and variables → Actions* :

| Type | Nom | Valeur |
|---|---|---|
| Secret | `VPS_HOST` | IP du VPS |
| Secret | `VPS_USER` | `deploy` |
| Secret | `VPS_SSH_KEY` | contenu de `movecolis_deploy` (clé **privée**) |
| Secret | `VPS_PORT` | facultatif (22 par défaut) |
| Secret | `VPS_KNOWN_HOSTS` | recommandé : résultat de `ssh-keyscan -H IP_DU_VPS` |
| Variable | `DOMAIN` | `movecolis.com` |
| Variable | `VITE_GA_MEASUREMENT_ID` | facultatif (Google Analytics) |
| Variable | `VITE_META_PIXEL_ID` | facultatif (pixel Meta) |

## 6. Première mise en ligne

1. Push sur **main** → onglet *Actions* : *Vérifications → Images Docker → Déploiement → Contrôle public*.
   La base vide reçoit automatiquement le schéma complet.
2. Compte administrateur (une fois) :
   ```bash
   ssh deploy@IP_DU_VPS "cd /opt/movecolis && docker compose run --rm api npm run db:seed"
   ```
3. **https://movecolis.com** : connexion admin, installation de l'appli, notifications.

## Au quotidien

- **Travailler** : branche → *pull request* (vérifications et build automatiques) → fusion dans `main` → mise en ligne automatique.
- **Revenir en arrière** : `ssh deploy@IP_DU_VPS "cd /opt/movecolis && ./deploy.sh sha-xxxxxxx"`.
  Si une nouvelle version ne répond pas, le script revient seul à la précédente.
- **Journaux** : `docker compose logs -f api` dans `/opt/movecolis`.
- **Sauvegardes** : chaque nuit à 3 h dans `/opt/movecolis/backups` (14 jours) — copiez-les aussi hors du VPS.
- **Évolutions de la base** : un nouveau fichier `backend/database/migrations/005_….sql` (rejouable, sans perte) est appliqué au déploiement suivant.
  Les migrations ne reviennent pas en arrière : l'ancienne version de l'API doit rester compatible.

## Développement local

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL 17 sur localhost:5432
cd backend  && npm run db:migrate && npm run db:seed:demo && npm run dev
cd frontend && npm run dev
```
