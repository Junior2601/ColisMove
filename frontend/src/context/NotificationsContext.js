import { createContext, useContext } from "react";
import { CalendarDays, Clock, Megaphone, MessageCircle, Package, PackagePlus, Plane, Ticket, UserCheck } from "lucide-react";

// Le fournisseur (<NotificationsProvider>, toast) est dans NotificationsProvider.jsx
export const NotificationsContext = createContext(null);

// Icône de chaque type de notification (cloche, toast, centre de notifications)
export const NOTIFICATION_ICONS = {
  NEW_MESSAGE: MessageCircle,
  NEW_RESERVATION: Package,
  RESERVATION_STATUS: Package,
  TRIP_CANCELLED: Plane,
  TRAVELER_APPROVED: UserCheck,
  TRAVELER_PENDING: UserCheck,
  NEW_TRIP: PackagePlus, // nouveaux kilos publiés (tous les clients)
  ROUTE_ALERT: Plane, // un voyageur part sur un trajet recherché / consulté / favori
  DEPARTURE_SOON: Clock, // « Il reste 3 jours pour confier votre colis »
  WEEKLY_DIGEST: CalendarDays, // « Des voyageurs partent vers X cette semaine »
  CAMPAIGN: Megaphone, // campagne saisonnière
  FLIGHT_ORDER: Ticket, // (admin) nouvelle demande de billet d'avion
  FLIGHT_ORDER_STATUS: Ticket, // paiement reçu, billet émis, annulation
};

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications() doit être utilisé à l'intérieur de <NotificationsProvider>.");
  return context;
}
