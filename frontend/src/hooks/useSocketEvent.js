import { useEffect, useRef } from "react";
import { getSocket } from "../lib/socket";

/**
 * Écoute un événement Socket.io pendant la vie du composant.
 *   useSocketEvent("inbox:updated", () => list.reload());
 * Le dernier `handler` est toujours utilisé, sans réabonnement à chaque rendu.
 */
export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const socket = getSocket();
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event]);
}
