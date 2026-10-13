import { Navigate, Outlet, useLocation } from "react-router-dom";
import { homePathFor, useAuth } from "../context/AuthContext";
import { Loader } from "./ui";

/**
 * Garde de routes, à utiliser comme route "parente" :
 *   <Route element={<RequireRole roles={["ADMIN"]} />}>
 *     <Route path="/admin" element={<AdminDashboard />} />
 *   </Route>
 * Sans `roles` : il suffit d'être connecté.
 */
export default function RequireRole({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  // Non connecté → page de connexion, en mémorisant la page demandée
  if (!user) return <Navigate to="/connexion" replace state={{ from: location }} />;

  // Connecté mais mauvais rôle → retour à son propre espace
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;

  return <Outlet />;
}
