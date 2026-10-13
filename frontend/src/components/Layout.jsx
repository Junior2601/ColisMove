import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Plane, Search, Package, House, User, LayoutDashboard, PlusCircle, UserCheck, LogIn, LogOut, MessageCircle, Bell,
} from "lucide-react";
import { homePathFor, landingPathFor, useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import NotificationPrompt from "./NotificationPrompt";
import InstallAppPrompt from "./InstallAppPrompt";
import { useConsent } from "../context/ConsentContext";
import { listGuestAccess } from "../lib/guestAccess";

// Admin et voyageur → leur tableau de bord ; client et visiteur → la liste des voyages
function Logo({ to }) {
  return (
    <Link to={to} className="flex items-center shrink-0" aria-label={to === "/" ? "MoveColis — accueil" : "MoveColis — tableau de bord"}>
      {/* Logo horizontal (marges retirées). Plus petit sur mobile pour laisser la place aux icônes. */}
      <img src="/brand/logo-horizontal.png" alt="MoveColis" className="h-7 sm:h-9 lg:h-10 w-auto" />
    </Link>
  );
}

// Style d'un onglet de la nav basse : corail si actif, gris sinon
const navItemClass = ({ isActive }) =>
  `flex flex-col items-center gap-0.5 min-w-12 py-0.5 text-[10px] font-semibold ${
    isActive ? "text-primary" : "text-muted"
  }`;

const topLinkClass = "hidden lg:inline-block font-semibold text-sm px-3.5 py-2.5 rounded-3xl hover:bg-surface";

/**
 * variant="public"   → Explorer · Suivi · Connexion (ou Mon espace si connecté)
 * variant="client"   → Explorer · Suivi · Historique · Profil
 * variant="traveler" → Tableau · Voyages · Publier · Réservations · Profil
 * variant="admin"    → Tableau · Voyages · Réservations · Approbations · Profil
 */
export default function Layout({ children, variant = "public" }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const home = homePathFor(user);
  const { unreadMessages: unread, unreadNotifications } = useNotifications();
  const { openPreferences } = useConsent();
  // Visiteur ayant déjà réservé depuis cet appareil : accès à ses conversations
  const showMessages = Boolean(user) || listGuestAccess().length > 0;

  function handleLogout() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      {/* ===== Barre du haut ===== */}
      <header className="sticky top-0 z-50 bg-white border-b border-line-light">
        <div className="max-w-6xl mx-auto px-5 h-15 lg:h-19 flex items-center justify-between">
          <Logo to={landingPathFor(user)} />
          <nav className="flex items-center gap-2.5">
            {/* Liens visibles uniquement sur desktop */}
            <NavLink to="/" end className={topLinkClass}>
              Voyages
            </NavLink>
            <NavLink to="/suivi" className={topLinkClass}>
              Suivre un colis
            </NavLink>
            {user ? (
              <NavLink to={home} className={topLinkClass}>
                Mon espace
              </NavLink>
            ) : (
              <NavLink to="/connexion" className={topLinkClass}>
                Connexion
              </NavLink>
            )}

            {/* Messagerie + badge des messages non lus (visible aussi sur mobile) */}
            {showMessages && (
              <Link
                to="/messages"
                aria-label={unread > 0 ? `Messages (${unread} non lus)` : "Messages"}
                className="relative p-2 rounded-full text-ink hover:bg-surface transition"
              >
                <MessageCircle size={20} />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-white text-[10.5px] font-bold flex items-center justify-center">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            )}

            {/* Centre de notifications : messages, réservations, étapes des colis */}
            {user && (
              <Link
                to="/notifications"
                aria-label={unreadNotifications > 0 ? `Notifications (${unreadNotifications} non lues)` : "Notifications"}
                className="relative p-2 rounded-full text-ink hover:bg-surface transition"
              >
                <Bell size={20} />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-white text-[10.5px] font-bold flex items-center justify-center">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </Link>
            )}

            {/* Bouton profil style Airbnb (burger + avatar) */}
            <Link
              to={user ? home : "/inscription"}
              aria-label={user ? "Mon espace" : "Créer un compte"}
              className="flex items-center gap-2 border border-line rounded-3xl py-1.5 pl-3 pr-1.5 transition-shadow hover:shadow-card"
            >
              <span className="flex flex-col gap-[3px]">
                <span className="block w-3.5 h-0.5 bg-ink rounded" />
                <span className="block w-3.5 h-0.5 bg-ink rounded" />
                <span className="block w-3.5 h-0.5 bg-ink rounded" />
              </span>
              <span className="w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center text-xs font-bold">
                {user ? user.firstName.charAt(0).toUpperCase() : <User size={15} />}
              </span>
            </Link>

            {user && (
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="hidden lg:inline-flex p-2 rounded-full text-muted hover:bg-surface hover:text-ink transition"
              >
                <LogOut size={18} />
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* ===== Contenu de la page ===== */}
      <main className="max-w-6xl mx-auto px-5">
        {/* Invitation à activer les notifications (une fois, comptes connectés) */}
        <NotificationPrompt />
        {children}
      </main>

      {/* ===== Pied de page ===== */}
      <footer className="border-t border-line-light bg-surface py-6 mt-5 text-center text-[12.5px] text-muted">
        <nav aria-label="Informations légales" className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-5 mb-3 font-semibold">
          <Link to="/application" className="hover:text-ink hover:underline">Installer l'application</Link>
          <Link to="/cgu" className="hover:text-ink hover:underline">CGU</Link>
          <Link to="/confidentialite" className="hover:text-ink hover:underline">Confidentialité</Link>
          <Link to="/cookies" className="hover:text-ink hover:underline">Cookies</Link>
          <button type="button" onClick={openPreferences} className="font-semibold hover:text-ink hover:underline">
            Gérer les cookies
          </button>
          <Link to="/mentions-legales" className="hover:text-ink hover:underline">Mentions légales</Link>
        </nav>
        MoveColis · Voyage &amp; expédition de colis. © 2026
      </footer>

      {/* Invitation à installer l'appli (téléphone, hors appli installée) */}
      <InstallAppPrompt />

      {/* ===== Navigation basse (mobile uniquement) ===== */}
      <nav
        aria-label="Navigation principale"
        className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-line-light flex justify-around px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden"
      >
        {variant === "public" && (
          <>
            <NavLink to="/" end className={navItemClass}>
              <Search size={23} strokeWidth={1.8} /> Explorer
            </NavLink>
            <NavLink to="/suivi" className={navItemClass}>
              <Package size={23} strokeWidth={1.8} /> Suivi
            </NavLink>
            {user ? (
              <NavLink to={home} className={navItemClass}>
                <LayoutDashboard size={23} strokeWidth={1.8} /> Mon espace
              </NavLink>
            ) : (
              <NavLink to="/connexion" className={navItemClass}>
                <LogIn size={23} strokeWidth={1.8} /> Connexion
              </NavLink>
            )}
          </>
        )}

        {variant === "client" && (
          <>
            <NavLink to="/" end className={navItemClass}>
              <Search size={23} strokeWidth={1.8} /> Explorer
            </NavLink>
            <NavLink to="/suivi" className={navItemClass}>
              <Package size={23} strokeWidth={1.8} /> Suivi
            </NavLink>
            <NavLink to="/client" className={navItemClass}>
              <House size={23} strokeWidth={1.8} /> Historique
            </NavLink>
            <NavLink to="/profil" className={navItemClass}>
              <User size={23} strokeWidth={1.8} /> Profil
            </NavLink>
          </>
        )}

        {variant === "traveler" && (
          <>
            <NavLink to="/voyageur" end className={navItemClass}>
              <LayoutDashboard size={23} strokeWidth={1.8} /> Tableau
            </NavLink>
            <NavLink to="/voyageur/voyages" className={navItemClass}>
              <Plane size={23} strokeWidth={1.8} /> Voyages
            </NavLink>
            <NavLink to="/publier" className={navItemClass}>
              <PlusCircle size={23} strokeWidth={1.8} /> Publier
            </NavLink>
            <NavLink to="/voyageur/reservations" className={navItemClass}>
              <Package size={23} strokeWidth={1.8} /> Réservations
            </NavLink>
            <NavLink to="/profil" className={navItemClass}>
              <User size={23} strokeWidth={1.8} /> Profil
            </NavLink>
          </>
        )}

        {variant === "admin" && (
          <>
            <NavLink to="/admin" end className={navItemClass}>
              <LayoutDashboard size={23} strokeWidth={1.8} /> Tableau
            </NavLink>
            <NavLink to="/admin/voyages" className={navItemClass}>
              <Plane size={23} strokeWidth={1.8} /> Voyages
            </NavLink>
            <NavLink to="/admin/reservations" className={navItemClass}>
              <Package size={23} strokeWidth={1.8} /> Réservations
            </NavLink>
            <NavLink to="/admin/approbations" className={navItemClass}>
              <UserCheck size={23} strokeWidth={1.8} /> Approbations
            </NavLink>
            <NavLink to="/profil" className={navItemClass}>
              <User size={23} strokeWidth={1.8} /> Profil
            </NavLink>
          </>
        )}
      </nav>
    </div>
  );
}
