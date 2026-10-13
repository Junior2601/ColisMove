import { useCallback, useEffect, useState } from "react";

/**
 * Message de confirmation temporaire, à afficher avec <Toast flash={flash} />.
 *   const [flash, showFlash] = useFlash();
 *   showFlash("Voyage modifié.");            // succès
 *   showFlash("Échec de l'envoi", "danger"); // erreur
 */
export function useFlash(duration = 3500) {
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), duration);
    return () => clearTimeout(timer);
  }, [flash, duration]);

  const show = useCallback((text, tone = "success") => setFlash({ text, tone, id: Date.now() }), []);
  return [flash, show];
}
