# MoveColis — Backend

Node.js · Express 5 · PostgreSQL (driver `pg`, sans ORM) · architecture Modèle / Service / Contrôleur / Route.

## Démarrage

```bash
npm install
cp .env.example .env        # renseigner DATABASE_URL, JWT_SECRET, ADMIN_*
# créer la base "kilofly" (pgAdmin ou: createdb kilofly)
npm run db:schema           # ⚠️ supprime et recrée toutes les tables
npm run db:seed:demo        # compte admin + données de démo (ou db:seed pour l'admin seul)
npm run dev                 # http://localhost:4000/api
```

Tester les routes : fichier `api.http` (extension VS Code « REST Client »).

## Parcours d'une requête

```
route  →  authenticate / authorize  →  validate (Zod)  →  controller  →  service  →  model  →  PostgreSQL
```

| Couche       | Rôle                                                                   |
|--------------|------------------------------------------------------------------------|
| `routes`     | URL + middlewares, rien d'autre                                        |
| `controllers`| Lit `req.valid` / `req.user`, appelle le service, renvoie le JSON      |
| `services`   | Règles métier, transactions, erreurs `AppError`                        |
| `models`     | SQL paramétré uniquement, conversion snake_case → camelCase            |
| `validators` | Schémas Zod des entrées (body, query, params)                          |

## Format des erreurs

```json
{ "error": "Données invalides.", "details": [{ "field": "kilosTotal", "message": "Champ obligatoire." }] }
```

## Notifications et PWA

1. Créer les tables (sans perte de données) :
   `npm run db:sql -- database/migrations/002_notifications.sql`
2. Générer les clés Web Push **une seule fois** : `npm run vapid:generate`,
   puis copier `Public Key` / `Private Key` dans `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` du `.env`.
   Ne régénérez pas ces clés ensuite : tous les appareils abonnés devraient se réabonner.
3. Le push exige HTTPS (sauf sur `localhost`). Sur iPhone : iOS 16.4+, site ajouté à l'écran d'accueil.

| Événement                         | Notifié                                     |
|-----------------------------------|---------------------------------------------|
| Nouveau message                   | l'autre côté de la conversation (comptes)   |
| Nouvelle réservation              | le propriétaire du voyage                   |
| Étape du colis / annulation       | le client et le propriétaire (sauf l'auteur)|
| Voyage annulé                     | chaque client ayant réservé                 |
| Demande de compte voyageur        | les admins                                  |
| Compte voyageur approuvé          | le voyageur                                 |
