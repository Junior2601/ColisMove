import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/auth";
import { tokenStorage } from "../api/client";
import { reconnectSocket } from "../lib/socket";
import { detachPushFromAccount } from "../lib/push";
import { setAppBadge } from "../lib/pwa";

const AuthContext = createContext(null);

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Un token existe déjà ? On vérifie la session avant d'afficher les pages protégées
  const [loading, setLoading] = useState(() => Boolean(tokenStorage.get()));

  useEffect(() => {
    if (!tokenStorage.get()) return;
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null)) // le client HTTP efface le token si 401
      .finally(() => setLoading(false));
  }, []);

  // Un appel API a renvoyé 401 (token expiré, compte supprimé…) → déconnexion
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("movecolis:unauthorized", onUnauthorized);
    return () => window.removeEventListener("movecolis:unauthorized", onUnauthorized);
  }, []);

  // identifier = email ou numéro de téléphone
  // Connexion / déconnexion : la connexion temps réel change d'identité
  useEffect(() => {
    reconnectSocket();
  }, [user?.id]);

  const login = useCallback(async (identifier, password) => {
    const { token, user: loggedUser } = await authApi.login(identifier, password);
    tokenStorage.set(token);
    setUser(loggedUser);
    return loggedUser;
  }, []);

  // Client : connecté directement. Voyageur : pas de token, compte en attente d'approbation.
  const register = useCallback(async (data) => {
    const result = await authApi.register(data);
    if (result.token) {
      tokenStorage.set(result.token);
      setUser(result.user);
    }
    return result; // { user, token?, pendingApproval }
  }, []);

  // Profil modifié : on remplace l'utilisateur en mémoire par la version enregistrée
  const updateProfile = useCallback(async (data) => {
    const updated = await authApi.updateMe(data);
    setUser(updated);
    return updated;
  }, []);

  const logout = useCallback(() => {
    detachPushFromAccount().catch(() => {}); // plus de notifications de ce compte sur cet appareil
    setAppBadge(0);
    tokenStorage.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), login, register, updateProfile, logout }),
    [user, loading, login, register, updateProfile, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth() doit être utilisé à l'intérieur de <AuthProvider>.");
  return context;
}
