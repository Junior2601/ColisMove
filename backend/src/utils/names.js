// Nom affiché d'un propriétaire de voyage : "MoveColis" pour l'admin, "Serge B." pour un voyageur
export function ownerDisplayName(owner) {
  if (!owner) return "";
  if (owner.role === "ADMIN") return "MoveColis";
  return owner.lastName ? `${owner.firstName} ${owner.lastName.charAt(0)}.` : owner.firstName;
}

export const routeText = (trip) => `${trip.departureCity} → ${trip.arrivalCity}`;
