import { useCallback, useEffect, useRef, useState } from "react";
import { conversationsApi } from "../api/conversations";
import { getGuestToken } from "../lib/guestAccess";
import { getSocket } from "../lib/socket";

const byDate = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

/**
 * Ajoute un message à la liste sans doublon :
 *  - même id déjà présent → ignoré (le message arrive à la fois par l'accusé et par la diffusion)
 *  - clientId connu → remplace le message "en cours d'envoi" affiché tout de suite
 */
function mergeMessage(list, message) {
  if (list.some((m) => m.id === message.id)) return list;
  if (message.clientId) {
    const index = list.findIndex((m) => m.id === message.clientId);
    if (index !== -1) {
      const next = [...list];
      next[index] = { ...message, pending: false };
      return next;
    }
  }
  return [...list, message].sort(byDate);
}

/**
 * Toute la logique d'une conversation : historique (REST), temps réel (Socket.io),
 * envoi optimiste, accusés de lecture et indicateur "en train d'écrire".
 * Fonctionne pour un utilisateur connecté comme pour un visiteur (jeton mémorisé sur l'appareil).
 */
export function useConversation(conversationId) {
  const id = Number(conversationId);
  const guestToken = getGuestToken(id);

  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherReadAt, setOtherReadAt] = useState(null);

  const sideRef = useRef(null); // OWNER | CUSTOMER | ADMIN
  const joinedRef = useRef(false); // salle Socket.io rejointe ?
  const joinedOnceRef = useRef(false);
  const readTimer = useRef(null);
  const typingTimer = useRef(null);
  const typingSent = useRef(false);
  const otherTypingTimer = useRef(null);

  /* ---------- 1. Chargement initial (REST) ---------- */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setDetail(null);
    setMessages([]);

    Promise.all([conversationsApi.get(id), conversationsApi.messages(id, { limit: 30 })])
      .then(([conversation, page]) => {
        if (!active) return;
        sideRef.current = conversation.viewerSide;
        setDetail(conversation);
        setMessages(page.items);
        setHasMore(page.hasMore);
        // "Vu" : dernière lecture de l'autre côté
        setOtherReadAt(
          conversation.viewerSide === "CUSTOMER" ? conversation.ownerLastReadAt : conversation.customerLastReadAt
        );
      })
      .catch((err) => active && setError(err))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [id]);

  /* ---------- Accusé de lecture (regroupé, seulement si l'onglet est visible) ---------- */
  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      const socket = getSocket();
      if (socket.connected && joinedRef.current) socket.emit("conversation:read", { conversationId: id });
      else conversationsApi.markRead(id).catch(() => {});
    }, 300);
  }, [id]);

  /* ---------- 2. Temps réel ---------- */
  useEffect(() => {
    const socket = getSocket();

    const join = () => {
      socket.emit("conversation:join", { conversationId: id, guestToken }, (res) => {
        if (!res?.ok) return;
        joinedRef.current = true;
        markRead();
        // Après une coupure réseau : on récupère les messages manqués
        if (joinedOnceRef.current) {
          conversationsApi
            .messages(id, { limit: 30 })
            .then((page) => setMessages((list) => page.items.reduce(mergeMessage, list)))
            .catch(() => {});
        }
        joinedOnceRef.current = true;
      });
    };
    const onDisconnect = () => {
      joinedRef.current = false;
    };
    const onMessage = (message) => {
      if (message.conversationId !== id) return;
      setMessages((list) => mergeMessage(list, message));
      if (message.senderType !== sideRef.current) {
        setOtherTyping(false);
        markRead();
      }
    };
    const onTyping = (event) => {
      if (event.conversationId !== id || event.side === sideRef.current) return;
      setOtherTyping(event.isTyping);
      // Sécurité : l'indicateur s'efface seul si l'autre se déconnecte en pleine saisie
      clearTimeout(otherTypingTimer.current);
      if (event.isTyping) otherTypingTimer.current = setTimeout(() => setOtherTyping(false), 6000);
    };
    const onRead = (event) => {
      if (event.conversationId === id && event.side !== sideRef.current) setOtherReadAt(event.readAt);
    };
    const onReservation = (event) => {
      if (event.conversationId !== id) return;
      setDetail((d) => d && { ...d, reservation: { ...d.reservation, ...event.reservation } });
    };
    const onVisible = () => document.visibilityState === "visible" && markRead();

    if (socket.connected) join();
    socket.on("connect", join); // (re)connexion → on rejoint la salle
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onMessage);
    socket.on("typing", onTyping);
    socket.on("conversation:read", onRead);
    socket.on("reservation:updated", onReservation);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.emit("conversation:leave", { conversationId: id });
      joinedRef.current = false;
      joinedOnceRef.current = false;
      socket.off("connect", join);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onMessage);
      socket.off("typing", onTyping);
      socket.off("conversation:read", onRead);
      socket.off("reservation:updated", onReservation);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(readTimer.current);
      clearTimeout(typingTimer.current);
      clearTimeout(otherTypingTimer.current);
    };
  }, [id, guestToken, markRead]);

  /* ---------- "… est en train d'écrire" ---------- */
  const stopTyping = useCallback(() => {
    clearTimeout(typingTimer.current);
    if (typingSent.current) {
      getSocket().emit("typing", { conversationId: id, isTyping: false });
      typingSent.current = false;
    }
  }, [id]);

  const notifyTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket.connected || !joinedRef.current) return;
    if (!typingSent.current) {
      socket.emit("typing", { conversationId: id, isTyping: true });
      typingSent.current = true;
    }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2500);
  }, [id, stopTyping]);

  /* ---------- Envoi (optimiste : affiché tout de suite, confirmé par le serveur) ---------- */
  const deliver = useCallback(
    async (body, clientId) => {
      const socket = getSocket();
      let message;
      if (socket.connected && joinedRef.current) {
        const res = await socket.timeout(8000).emitWithAck("message:send", { conversationId: id, body, clientId });
        if (!res.ok) throw new Error(res.error);
        message = res.message;
      } else {
        message = await conversationsApi.send(id, body, clientId); // secours sans temps réel
      }
      setMessages((list) => mergeMessage(list, { ...message, clientId }));
    },
    [id]
  );

  const send = useCallback(
    async (text) => {
      const body = text.trim();
      if (!body) return;
      const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setMessages((list) => [
        ...list,
        { id: clientId, clientId, conversationId: id, senderType: sideRef.current, body, createdAt: new Date().toISOString(), pending: true },
      ]);
      stopTyping();
      try {
        await deliver(body, clientId);
      } catch {
        setMessages((list) => list.map((m) => (m.id === clientId ? { ...m, pending: false, failed: true } : m)));
      }
    },
    [id, deliver, stopTyping]
  );

  // Renvoyer un message en échec
  const retry = useCallback(
    async (failed) => {
      setMessages((list) => list.map((m) => (m.id === failed.id ? { ...m, pending: true, failed: false } : m)));
      try {
        await deliver(failed.body, failed.id);
      } catch {
        setMessages((list) => list.map((m) => (m.id === failed.id ? { ...m, pending: false, failed: true } : m)));
      }
    },
    [deliver]
  );

  /* ---------- Messages plus anciens ---------- */
  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => typeof m.id === "number");
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await conversationsApi.messages(id, { before: oldest.id, limit: 30 });
      setMessages((list) => [...page.items, ...list]);
      setHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }, [id, messages]);

  /* ---------- Statut de la réservation (le message système arrive par Socket.io) ---------- */
  const changeStatus = useCallback(
    async (status, note) => {
      const reservation = await conversationsApi.changeStatus(id, status, note);
      setDetail((d) => d && { ...d, reservation: { ...d.reservation, status: reservation.status } });
      return reservation;
    },
    [id]
  );

  return {
    detail,
    messages,
    hasMore,
    loading,
    loadingOlder,
    error,
    otherTyping,
    otherReadAt,
    send,
    retry,
    loadOlder,
    notifyTyping,
    changeStatus,
  };
}
