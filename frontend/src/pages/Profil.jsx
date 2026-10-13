import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  LogOut, ChevronRight, Package, Plane, LayoutDashboard, Settings, UserCircle, MessageCircle, KeyRound, Megaphone,
} from "lucide-react";
import Layout from "../components/Layout";
import AppSettings from "../components/AppSettings";
import PasswordInput from "../components/PasswordInput";
import MarketingSettings from "../components/MarketingSettings";
import { Badge, Field, Notice, Toast, inputClass, btnPrimary, btnOutline } from "../components/ui";
import { authApi } from "../api/auth";
import { errorMessage, fieldErrors, tokenStorage } from "../api/client";
import { layoutVariantFor, useAuth } from "../context/AuthContext";
import { useFlash } from "../hooks/useFlash";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { digitsOnly } from "../lib/format";

// Raccourcis affichés selon le rôle
const SHORTCUTS = {
  CLIENT: [{ to: "/client", icon: Package, label: "Mes envois et mon historique" }],
  VOYAGEUR: [
    { to: "/voyageur", icon: LayoutDashboard, label: "Mon tableau de bord" },
    { to: "/voyageur/voyages", icon: Plane, label: "Mes voyages publiés" },
    { to: "/voyageur/reservations", icon: Package, label: "Réservations reçues" },
  ],
  ADMIN: [
    { to: "/admin", icon: LayoutDashboard, label: "Administration" },
    { to: "/admin/approbations", icon: UserCircle, label: "Approbations voyageurs" },
    { to: "/admin/parametres", icon: Settings, label: "Paramètres de messagerie" },
    { to: "/admin/campagnes", icon: Megaphone, label: "Campagnes et notifications" },
  ],
};

const ROLE_LABEL = { CLIENT: "Client", VOYAGEUR: "Voyageur", ADMIN: "Administrateur" };

/* ===== Informations du compte ===== */
function ProfileForm({ user, onSaved }) {
  const { updateProfile } = useAuth();
  const isTraveler = user.role === "VOYAGEUR";
  const initial = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: `+${user.phone}`,
    city: user.city ?? "",
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((errs) => ({ ...errs, [k]: undefined }));
  };

  // N'envoie que les champs réellement modifiés
  function buildPatch() {
    const patch = {};
    for (const key of ["firstName", "lastName", "email"]) {
      if (form[key].trim() !== initial[key]) patch[key] = form[key].trim();
    }
    if (digitsOnly(form.phone) !== user.phone) patch.phone = form.phone;
    if (isTraveler && form.city.trim() !== initial.city) patch.city = form.city.trim();
    return patch;
  }

  const patch = buildPatch();
  const dirty = Object.keys(patch).length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await updateProfile(patch);
      onSaved("Informations enregistrées.");
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(Object.keys(byField).length ? null : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line rounded-2xl p-5 bg-white mb-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" error={errors.firstName}>
          <input value={form.firstName} onChange={set("firstName")} required autoComplete="given-name" className={inputClass} />
        </Field>
        <Field label="Nom" error={errors.lastName}>
          <input value={form.lastName} onChange={set("lastName")} required autoComplete="family-name" className={inputClass} />
        </Field>
      </div>
      <Field label="Adresse e-mail" error={errors.email}>
        <input value={form.email} onChange={set("email")} type="email" required autoComplete="email" className={inputClass} />
      </Field>
      <Field
        label="Numéro de téléphone (WhatsApp)"
        error={errors.phone}
        hint="Avec l'indicatif pays. Il sert aussi d'identifiant de connexion."
      >
        <input value={form.phone} onChange={set("phone")} type="tel" required autoComplete="tel" className={inputClass} />
      </Field>
      {isTraveler && (
        <Field label="Ville de résidence" error={errors.city}>
          <input value={form.city} onChange={set("city")} required autoComplete="address-level2" className={inputClass} />
        </Field>
      )}

      {formError && <Notice tone="danger">{formError}</Notice>}

      <button type="submit" disabled={!dirty || saving} className={`${btnPrimary} w-full`}>
        {saving ? "Enregistrement…" : "Enregistrer les modifications"}
      </button>
    </form>
  );
}

/* ===== Changement de mot de passe ===== */
const EMPTY_PASSWORDS = { currentPassword: "", newPassword: "", confirm: "" };

function PasswordForm({ onSaved }) {
  const [form, setForm] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((errs) => ({ ...errs, [k]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      setErrors({ confirm: "Les deux mots de passe ne correspondent pas." });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const { token } = await authApi.changePassword(form.currentPassword, form.newPassword);
      tokenStorage.set(token); // nouvelle session : l'ancienne n'est plus acceptée par le serveur
      setForm(EMPTY_PASSWORDS);
      onSaved("Mot de passe modifié. Vos autres appareils ont été déconnectés.");
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(Object.keys(byField).length ? byField : { currentPassword: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line rounded-2xl p-5 bg-white mb-5">
      <Field label="Mot de passe actuel" error={errors.currentPassword}>
        <PasswordInput value={form.currentPassword} onChange={set("currentPassword")} required
          autoComplete="current-password" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <Field label="Nouveau mot de passe" error={errors.newPassword}>
          <PasswordInput value={form.newPassword} onChange={set("newPassword")} required minLength={8}
            maxLength={72} autoComplete="new-password" placeholder="8 caractères minimum" />
        </Field>
        <Field label="Confirmation" error={errors.confirm}>
          <PasswordInput value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" />
        </Field>
      </div>
      <button type="submit" disabled={saving} className={`${btnOutline} w-full`}>
        <KeyRound size={17} /> {saving ? "Modification…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}

export default function Profil() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  // Lien /profil#notifications (depuis la page Notifications) : on fait défiler jusqu'à la section
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);
  const unread = useUnreadCount();
  const [flash, showFlash] = useFlash();

  function handleLogout() {
    logout(); // supprime le token et coupe la connexion temps réel
    navigate("/", { replace: true });
  }

  const shortcuts = [
    ...SHORTCUTS[user.role],
    { to: "/messages", icon: MessageCircle, label: "Messages", badge: unread },
  ];

  return (
    <Layout variant={layoutVariantFor(user)}>
      <div className="max-w-2xl mx-auto">
        {/* ===== En-tête profil ===== */}
        <div className="flex items-center gap-4 mt-6 mb-5">
          <div className="w-14 h-14 rounded-full bg-ink text-white flex items-center justify-center text-lg font-extrabold shrink-0">
            {user.firstName.charAt(0).toUpperCase()}
            {user.lastName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              {user.firstName} {user.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge tone={user.role === "ADMIN" ? "info" : "success"}>{ROLE_LABEL[user.role]}</Badge>
              {user.role === "VOYAGEUR" && <span className="text-xs text-muted">Compte approuvé</span>}
            </div>
          </div>
        </div>

        {/* ===== Raccourcis selon le rôle ===== */}
        <div className="border border-line-light rounded-2xl bg-white overflow-hidden mb-5">
          {shortcuts.map(({ to, icon: Icon, label, badge }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-line-light last:border-0 hover:bg-surface transition"
            >
              <Icon size={19} className="text-primary shrink-0" />
              <span className="flex-1 font-semibold text-sm">{label}</span>
              {badge > 0 && <Badge tone="pending">{badge} non lu{badge > 1 ? "s" : ""}</Badge>}
              <ChevronRight size={17} className="text-muted" />
            </Link>
          ))}
        </div>

        {/* ===== Infos du compte ===== */}
        <h2 className="text-[17px] font-extrabold mb-3">Mes informations</h2>
        {/* key : le formulaire repart des valeurs enregistrées après chaque modification */}
        <ProfileForm key={user.email + user.phone + user.firstName + user.lastName + (user.city ?? "")} user={user} onSaved={showFlash} />

        <h2 id="notifications" className="text-[17px] font-extrabold mb-3 scroll-mt-24">Application et notifications</h2>
        <AppSettings />

        {user.role !== "ADMIN" && (
          <>
            <h2 id="alertes" className="text-[17px] font-extrabold mb-3 scroll-mt-24">Mes alertes</h2>
            <MarketingSettings user={user} />
          </>
        )}

        <h2 className="text-[17px] font-extrabold mb-3">Mot de passe</h2>
        <PasswordForm onSaved={showFlash} />

        {/* ===== Déconnexion ===== */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg font-bold text-[15px] px-5 py-3 border border-danger text-danger bg-white hover:bg-[#FDECEA] active:scale-[.98] transition mb-8"
        >
          <LogOut size={18} /> Se déconnecter
        </button>
      </div>

      <Toast flash={flash} />
    </Layout>
  );
}
