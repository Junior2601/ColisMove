// =========================================================
//  Cookies et stockage sur l'appareil
//  Source unique : le bandeau, la fenêtre de préférences ET la page « Politique de cookies »
//  sont générés à partir de cette liste → ils restent toujours cohérents.
// =========================================================

// Incrémenter quand les catégories changent : le consentement sera redemandé à tous
export const CONSENT_VERSION = 1;
// Durée de validité d'un choix (accepter ou refuser) avant de le redemander
export const CONSENT_DURATION_DAYS = 180;

// Outils facultatifs : actifs SEULEMENT si leur identifiant est renseigné dans le .env du frontend
export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || null; // ex. G-XXXXXXXXXX
export const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || null; // ex. 123456789012345

export const COOKIE_CATEGORIES = [
  {
    key: "necessary",
    label: "Indispensables",
    required: true, // pas de consentement nécessaire : sans eux, le site ne fonctionne pas
    enabled: true,
    description:
      "Nécessaires au fonctionnement du site : connexion à votre compte, accès à vos conversations, mémorisation de vos choix. Ils ne peuvent pas être désactivés.",
    items: [
      { name: "movecolis_token", provider: "MoveColis", type: "Stockage local", purpose: "Garder votre session de connexion ouverte.", duration: "Jusqu'à la déconnexion (7 jours au plus)" },
      { name: "movecolis_guest_access", provider: "MoveColis", type: "Stockage local", purpose: "Retrouver, sur cet appareil, les conversations des réservations faites sans compte.", duration: "Jusqu'à l'effacement des données du navigateur" },
      { name: "movecolis_consent", provider: "MoveColis", type: "Stockage local", purpose: "Mémoriser vos choix concernant les cookies.", duration: `${Math.round(CONSENT_DURATION_DAYS / 30)} mois` },
      { name: "movecolis_push_prompt_dismissed, movecolis_install_prompt, movecolis_onboarding_later", provider: "MoveColis", type: "Stockage local", purpose: "Ne plus afficher les invitations (notifications, installation, trajets favoris) que vous avez fermées.", duration: "Jusqu'à l'effacement des données du navigateur" },
      { name: "movecolis-v1", provider: "MoveColis", type: "Cache de l'application", purpose: "Afficher une page « hors ligne » et les icônes de l'application sans connexion.", duration: "Jusqu'à la prochaine mise à jour de l'application" },
    ],
  },
  {
    key: "analytics",
    label: "Mesure d'audience",
    required: false,
    enabled: Boolean(GA_MEASUREMENT_ID),
    description:
      "Nous aident à comprendre comment le site est utilisé (pages vues, parcours) pour l'améliorer. Les statistiques sont globales et ne servent pas à la publicité.",
    items: [
      { name: "_ga", provider: "Google Analytics (Google)", type: "Cookie", purpose: "Distinguer les visiteurs de façon statistique.", duration: "13 mois" },
      { name: "_ga_<identifiant>", provider: "Google Analytics (Google)", type: "Cookie", purpose: "Mémoriser l'état de la visite en cours.", duration: "13 mois" },
    ],
  },
  {
    key: "marketing",
    label: "Publicité et réseaux sociaux",
    required: false,
    enabled: Boolean(META_PIXEL_ID),
    description:
      "Permettent de mesurer l'efficacité de nos publicités sur Facebook et Instagram et de vous proposer des annonces MoveColis plus pertinentes.",
    items: [
      { name: "_fbp", provider: "Meta (Facebook, Instagram)", type: "Cookie", purpose: "Mesurer les visites issues de nos publicités.", duration: "3 mois" },
    ],
  },
];

// Catégories soumises à consentement réellement utilisées (outil configuré)
export const OPTIONAL_CATEGORIES = COOKIE_CATEGORIES.filter((c) => !c.required && c.enabled);
