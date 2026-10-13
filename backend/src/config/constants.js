export const USER_ROLES = ["ADMIN", "VOYAGEUR", "CLIENT"];
export const USER_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
export const TRIP_STATUSES = ["PUBLISHED", "COMPLETED", "CANCELLED"];

// Parcours normal d'un colis, dans l'ordre
export const RESERVATION_FLOW = ["PENDING", "CONFIRMED", "RECEIVED", "IN_TRANSIT", "ARRIVED", "DELIVERED"];
export const RESERVATION_STATUSES = [...RESERVATION_FLOW, "CANCELLED"];

// Transitions autorisées : statut actuel → statuts suivants possibles
export const RESERVATION_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["ARRIVED"],
  ARRIVED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

// Réservations encore annulables (le colis n'a pas décollé)
export const CANCELLABLE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "RECEIVED"];

export const RESERVATION_STATUS_LABELS = {
  PENDING: "À confirmer",
  CONFIRMED: "Confirmée",
  RECEIVED: "Colis reçu",
  IN_TRANSIT: "En transit",
  ARRIVED: "Arrivée",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
};

// Variables utilisables dans le modèle de premier message
export const TEMPLATE_VARIABLES = ["kilos", "trajet", "date", "nom", "code"];

// Regroupement des réservations pour l'espace client (onglets)
export const RESERVATION_GROUPS = {
  current: ["PENDING", "CONFIRMED", "RECEIVED", "IN_TRANSIT", "ARRIVED"],
  delivered: ["DELIVERED"],
  cancelled: ["CANCELLED"],
};

// Message automatique posté dans la conversation à chaque changement de statut
export const STATUS_SYSTEM_MESSAGES = {
  CONFIRMED: "✅ Réservation confirmée par le propriétaire du voyage.",
  RECEIVED: "📦 Colis remis au voyageur.",
  IN_TRANSIT: "✈️ Colis en vol.",
  ARRIVED: "🛬 Colis arrivé à destination.",
  DELIVERED: "🎉 Colis livré au destinataire.",
  CANCELLED: "❌ Réservation annulée.",
};

// Titre des notifications envoyées à chaque étape du colis
export const STATUS_NOTIFICATION_TITLES = {
  CONFIRMED: "Réservation confirmée ✅",
  RECEIVED: "Colis remis au voyageur 📦",
  IN_TRANSIT: "Votre colis est en vol ✈️",
  ARRIVED: "Colis arrivé à destination 🛬",
  DELIVERED: "Colis livré 🎉",
  CANCELLED: "Réservation annulée ❌",
};

// Version en vigueur des CGU et de la politique de confidentialité (enregistrée à l'inscription).
// À changer à chaque mise à jour importante des textes (même valeur que LEGAL_VERSION côté frontend).
export const TERMS_VERSION = "2026-10";

// Notifications automatiques (réengagement) : garde-fous pour ne pas lasser les utilisateurs
export const MARKETING = {
  maxPerDay: 1, // messages marketing par personne et par jour (au-delà : reporté au lendemain)
  maxPerWeek: 3, // … et par semaine (au-delà : abandonné)
  quietStartHour: 21, // heures calmes, à l'heure locale de la personne : rien entre 21 h…
  quietEndHour: 8, // … et 8 h
  morningHour: 9, // envoi reporté pendant les heures calmes : le lendemain vers 9 h
  departureSoonDays: 3, // « Il reste 3 jours pour confier votre colis »
  interestRecencyDays: 60, // une recherche ou une consultation compte pendant 60 jours
  routeAlertDelayMinutes: 10, // délai avant l'alerte d'un nouveau voyage (le voyageur peut corriger une erreur)
  campaignValidityHours: 72, // une campagne non distribuée en 72 h (plafonds) est abandonnée
  tickMinutes: Number(process.env.MARKETING_TICK_MINUTES || 5), // fréquence du planificateur
  dailyJobsHourUtc: 7, // tâches quotidiennes (départs imminents, sélection de la semaine) à partir de 7 h UTC
  purge: { interestsDays: 180, queueDays: 365, notificationsDays: 365 }, // durées de conservation
};
