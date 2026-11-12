import { createContext, useContext } from "react";

// Le fournisseur (<ConsentProvider>, bandeau et préférences) est dans ConsentProvider.jsx
export const ConsentContext = createContext(null);

export function useConsent() {
  const context = useContext(ConsentContext);
  if (!context) throw new Error("useConsent() doit être utilisé à l'intérieur de <ConsentProvider>.");
  return context;
}
