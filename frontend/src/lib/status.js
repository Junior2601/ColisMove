// Libellés et tons de <Badge /> partagés par toutes les pages (mêmes statuts que la BD)

export const RESERVATION_STATUS = {
  PENDING:    { label: "À confirmer", tone: "pending" },
  CONFIRMED:  { label: "Confirmée",   tone: "success" },
  RECEIVED:   { label: "Colis reçu",  tone: "info" },
  IN_TRANSIT: { label: "En transit",  tone: "info" },
  ARRIVED:    { label: "Arrivée",     tone: "info" },
  DELIVERED:  { label: "Livrée",      tone: "success" },
  CANCELLED:  { label: "Annulée",     tone: "danger" },
};

// Parcours normal d'un colis, dans l'ordre (page Suivi)
export const RESERVATION_FLOW = ["PENDING", "CONFIRMED", "RECEIVED", "IN_TRANSIT", "ARRIVED", "DELIVERED"];

export const TRACKING_STEPS = {
  PENDING:    "Réservation enregistrée",
  CONFIRMED:  "Confirmée par le propriétaire",
  RECEIVED:   "Colis remis au voyageur",
  IN_TRANSIT: "En vol",
  ARRIVED:    "Arrivé à destination",
  DELIVERED:  "Livré au destinataire",
  CANCELLED:  "Réservation annulée",
};

// Étape suivante proposée sur chaque réservation (même workflow que le backend)
export const NEXT_RESERVATION_STEP = {
  PENDING:    { status: "CONFIRMED",  action: "Confirmer" },
  CONFIRMED:  { status: "RECEIVED",   action: "Colis reçu" },
  RECEIVED:   { status: "IN_TRANSIT", action: "En vol" },
  IN_TRANSIT: { status: "ARRIVED",    action: "Arrivée" },
  ARRIVED:    { status: "DELIVERED",  action: "Livrée" },
};

// Annulable tant que le colis n'a pas décollé
export const CANCELLABLE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "RECEIVED"];

export const TRAVELER_STATUS = {
  PENDING:  { label: "En attente", tone: "pending" },
  APPROVED: { label: "Approuvé",   tone: "success" },
  REJECTED: { label: "Refusé",     tone: "danger" },
};

export function tripStatusBadge(trip) {
  if (trip.status === "CANCELLED") return { tone: "danger", label: "Annulé" };
  if (trip.status === "COMPLETED" || trip.hasDeparted) return { tone: "success", label: "Terminé" };
  return { tone: "info", label: "Publié" };
}
