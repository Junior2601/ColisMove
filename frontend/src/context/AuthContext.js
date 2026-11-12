import { createContext, useContext } from "react";

// Le fournisseur (<AuthProvider>) est dans AuthProvider.jsx : un fichier de composants à part
// garde le rechargement à chaud de React (Fast Refresh) fonctionnel.
export const AuthContext = createContext(null);

// Page d'arrivée de chaque rôle après connexion
export function homePathFor(user) {
  switch (user?.role) {
    case "ADMIN":
      return "/admin";
    case "VOYAGEUR":
      return "/voyageur";
    case "CLIENT":
      return "/client";
    default:
      return "/";
  }
}

/**
 * Destination du logo et de l'ouverture de l'appli installée (PWA) :
 *  - admin et voyageur → leur tableau de bord (c'est là qu'ils travaillent)
 *  - client et visiteur → la liste des voyages (pour réserver)
 */
export function landingPathFor(user) {
  if (user?.role === "ADMIN") return "/admin";
  if (user?.role === "VOYAGEUR") return "/voyageur";
  return "/";
}

// Navigation basse à afficher sur les pages partagées (messagerie…) selon le rôle
export function layoutVariantFor(user) {
  switch (user?.role) {
    case "ADMIN":
      return "admin";
    case "VOYAGEUR":
      return "traveler";
    case "CLIENT":
      return "client";
    default:
      return "public";
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth() doit être utilisé à l'intérieur de <AuthProvider>.");
  return context;
}
