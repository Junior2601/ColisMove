import { Server } from "socket.io";
import { env } from "../config/env.js";
import { userFromToken } from "../middlewares/auth.js";
import * as conversationService from "../services/conversation.service.js";
import { AppError, forbidden } from "../utils/AppError.js";
import { conversationRoom, setIO, userRoom } from "./realtime.js";

/**
 * Messagerie instantanée.
 * Connexion : io(URL, { auth: { token } }) — token JWT facultatif (les visiteurs n'en ont pas).
 *
 * Événements reçus (avec accusé de réception { ok, ... } ou { ok: false, error }) :
 *   conversation:join  { conversationId, guestToken? }
 *   conversation:leave { conversationId }
 *   message:send       { conversationId, body, clientId? }
 *   conversation:read  { conversationId }
 *   typing             { conversationId, isTyping }
 *
 * Événements envoyés :
 *   message:new, conversation:read, typing, reservation:updated (salle de la conversation)
 *   inbox:updated (salles user:<id> et admins)
 */
export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  // Identification à la connexion : utilisateur connecté, ou visiteur anonyme
  io.use(async (socket, next) => {
    try {
      socket.data.user = await userFromToken(socket.handshake.auth?.token);
      socket.data.access = new Map(); // conversationId → { side, guestToken }
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on("connection", (socket) => {
    const { user } = socket.data;
    if (user) {
      socket.join(userRoom(user.id));
      if (user.role === "ADMIN") socket.join("admins");
    }

    // Exécute le traitement et répond via l'accusé de réception, sans jamais faire tomber le serveur
    const handle = (fn) => async (payload = {}, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        reply({ ok: true, ...(await fn(payload)) });
      } catch (err) {
        if (!(err instanceof AppError)) console.error("[socket]", err);
        reply({ ok: false, status: err.status ?? 500, error: err instanceof AppError ? err.message : "Erreur serveur." });
      }
    };

    // Les droits ont été vérifiés au "join" ; le service les revérifie à chaque action
    const accessFor = (conversationId) => {
      const access = socket.data.access.get(conversationId);
      if (!access) throw forbidden("Ouvrez d'abord la conversation.");
      return { user, guestToken: access.guestToken };
    };

    socket.on(
      "conversation:join",
      handle(async ({ conversationId, guestToken = null }) => {
        const id = Number(conversationId);
        const { side } = await conversationService.resolveAccess(id, { user, guestToken });
        socket.data.access.set(id, { side, guestToken });
        await socket.join(conversationRoom(id));
        return { side };
      })
    );

    socket.on("conversation:leave", ({ conversationId } = {}) => {
      const id = Number(conversationId);
      socket.leave(conversationRoom(id));
      socket.data.access.delete(id);
    });

    socket.on(
      "message:send",
      handle(async ({ conversationId, body, clientId }) => {
        const id = Number(conversationId);
        const message = await conversationService.sendMessage(id, accessFor(id), body, { clientId });
        return { message };
      })
    );

    socket.on(
      "conversation:read",
      handle(async ({ conversationId }) => {
        const id = Number(conversationId);
        return conversationService.markRead(id, accessFor(id));
      })
    );

    // "… est en train d'écrire" : relayé aux autres personnes de la conversation, rien n'est stocké
    socket.on("typing", ({ conversationId, isTyping } = {}) => {
      const id = Number(conversationId);
      const access = socket.data.access.get(id);
      if (!access) return;
      socket.to(conversationRoom(id)).emit("typing", { conversationId: id, side: access.side, isTyping: Boolean(isTyping) });
    });
  });

  setIO(io);
  return io;
}
