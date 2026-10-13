import { io } from "socket.io-client";
import { tokenStorage } from "../api/client";

// Socket.io écoute sur le même serveur que l'API, sans le suffixe /api
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API_URL.replace(/\/api\/?$/, "");

let socket = null;

/**
 * Connexion temps réel unique, partagée par toute l'application.
 * Le JWT est relu à chaque (re)connexion : visiteur anonyme ou utilisateur connecté.
 */
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL || undefined, {
      auth: (cb) => cb({ token: tokenStorage.get() }),
    });
  }
  return socket;
}

// Après connexion / déconnexion : on se reconnecte pour changer d'identité côté serveur
export function reconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket.connect();
}
