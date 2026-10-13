import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsContext";
import { ConsentProvider } from "./context/ConsentContext";
import { registerServiceWorker } from "./lib/pwa";
import RequireRole from "./components/RequireRole";
// Visiteur
import Home from "./pages/visiteur/Home";
import TripDetail from "./pages/visiteur/TripDetail";
import Tracking from "./pages/visiteur/Tracking";
import { Login, Register } from "./pages/visiteur/Auth";
import ForgotPassword from "./pages/visiteur/ForgotPassword";
import ResetPassword from "./pages/visiteur/ResetPassword";
// Partagé
import Profil from "./pages/Profil";
import Messages from "./pages/Messages";
import Conversation from "./pages/Conversation";
import Notifications from "./pages/Notifications";
import InstallApp from "./pages/InstallApp";
// Pages légales
import MentionsLegales from "./pages/legal/MentionsLegales";
import Confidentialite from "./pages/legal/Confidentialite";
import Cookies from "./pages/legal/Cookies";
import CGU from "./pages/legal/CGU";
// Client
import ClientDashboard from "./pages/client/ClientDashboard";
// Voyageur
import TravelerDashboard from "./pages/voyageur/TravelerDashboard";
import MesVoyages from "./pages/voyageur/MesVoyages";
import MesReservations from "./pages/voyageur/MesReservations";
import CreateTrip from "./pages/voyageur/CreateTrip";
// Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminVoyages from "./pages/admin/AdminVoyages";
import AdminReservations from "./pages/admin/AdminReservations";
import Approbations from "./pages/admin/Approbations";
import Parametres from "./pages/admin/Parametres";
import Campagnes from "./pages/admin/Campagnes";

export default function App() {
  // PWA : installation sur l'écran d'accueil + notifications push
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <BrowserRouter>
      <ConsentProvider>
        <AuthProvider>
          <NotificationsProvider>
            <Routes>
              {/* ===== Visiteur (public) ===== */}
              <Route path="/" element={<Home />} />
              <Route path="/voyage/:id" element={<TripDetail />} />
              <Route path="/suivi" element={<Tracking />} />
              <Route path="/connexion" element={<Login />} />
              <Route path="/inscription" element={<Register />} />
              <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
              <Route path="/mot-de-passe/reinitialiser" element={<ResetPassword />} />

              {/* ===== Pages légales et guide d'installation (publiques) ===== */}
              <Route path="/mentions-legales" element={<MentionsLegales />} />
              <Route path="/confidentialite" element={<Confidentialite />} />
              <Route path="/cookies" element={<Cookies />} />
              <Route path="/cgu" element={<CGU />} />
              <Route path="/application" element={<InstallApp />} />

              {/* ===== Messagerie : comptes ET visiteurs (accès vérifié par l'API) ===== */}
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:id" element={<Conversation />} />

              {/* ===== Partagé (tout utilisateur connecté) ===== */}
              <Route element={<RequireRole />}>
                <Route path="/profil" element={<Profil />} />
                <Route path="/notifications" element={<Notifications />} />
              </Route>

              {/* ===== Client ===== */}
              <Route element={<RequireRole roles={["CLIENT"]} />}>
                <Route path="/client" element={<ClientDashboard />} />
              </Route>

              {/* ===== Voyageur ===== */}
              <Route element={<RequireRole roles={["VOYAGEUR"]} />}>
                <Route path="/voyageur" element={<TravelerDashboard />} />
                <Route path="/voyageur/voyages" element={<MesVoyages />} />
                <Route path="/voyageur/reservations" element={<MesReservations />} />
              </Route>

              {/* ===== Publication d'un voyage : admin et voyageur ===== */}
              <Route element={<RequireRole roles={["ADMIN", "VOYAGEUR"]} />}>
                <Route path="/publier" element={<CreateTrip />} />
              </Route>

              {/* ===== Admin ===== */}
              <Route element={<RequireRole roles={["ADMIN"]} />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/voyages" element={<AdminVoyages />} />
                <Route path="/admin/reservations" element={<AdminReservations />} />
                <Route path="/admin/approbations" element={<Approbations />} />
                <Route path="/admin/parametres" element={<Parametres />} />
              <Route path="/admin/campagnes" element={<Campagnes />} />
              </Route>

              {/* URL inconnue → accueil */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </NotificationsProvider>
        </AuthProvider>
      </ConsentProvider>
    </BrowserRouter>
  );
}
