import { useNotifications } from "../context/NotificationsContext";

// Nombre de messages non lus (badge Messages de l'en-tête et pastille de l'icône de l'appli)
export function useUnreadCount() {
  return useNotifications().unreadMessages;
}
