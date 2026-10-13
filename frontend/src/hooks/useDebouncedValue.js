import { useEffect, useState } from "react";

// Renvoie `value` seulement après `delay` ms sans changement (évite une requête par touche tapée)
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
