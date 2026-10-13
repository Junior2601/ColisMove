/**
 * Émetteur temps réel utilisé par les services.
 * Les services ne connaissent pas Socket.io : ils appellent ces fonctions après leurs transactions.
 *
 * Salles (rooms) :
 *   user:<id>          → toutes les connexions d'un utilisateur (badge, boîte de réception)
 *   admins             → tous les admins connectés
 *   conversation:<id>  → les personnes qui ont la conversation ouverte
 */
let io = null;

export function setIO(instance) {
  io = instance;
}

export const conversationRoom = (id) => `conversation:${id}`;
export const userRoom = (id) => `user:${id}`;

export function emitToConversation(conversationId, event, payload) {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

export function emitToUser(userId, event, payload) {
  if (userId) io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToAdmins(event, payload) {
  io?.to("admins").emit(event, payload);
}

// Coupe les connexions temps réel d'un utilisateur (ex. voyageur révoqué)
export function disconnectUser(userId) {
  io?.in(userRoom(userId)).disconnectSockets(true);
}

// Prévient les boîtes de réception concernées (propriétaire, client, admins) — un seul envoi par connexion
export function notifyInbox({ conversationId, ownerId, clientId }) {
  if (!io) return;
  const rooms = ["admins", ownerId && userRoom(ownerId), clientId && userRoom(clientId)].filter(Boolean);
  io.to(rooms).emit("inbox:updated", { conversationId });
}

// Publie des messages (ex. messages système) et rafraîchit les boîtes de réception
export function publishMessages(messages, { ownerId, clientId } = {}) {
  for (const message of messages) {
    emitToConversation(message.conversationId, "message:new", message);
    notifyInbox({ conversationId: message.conversationId, ownerId, clientId });
  }
}
