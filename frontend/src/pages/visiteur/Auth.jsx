import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { CircleCheck, Package, Plane } from "lucide-react";
import Layout from "../../components/Layout";
import PasswordInput from "../../components/PasswordInput";
import { Field, inputClass, btnPrimary, btnOutline, Notice } from "../../components/ui";
import { homePathFor, useAuth } from "../../context/AuthContext";
import { errorMessage, fieldErrors } from "../../api/client";

// Après connexion : la page demandée avant la redirection vers /connexion, sinon l'espace du rôle
function useRedirectAfterLogin() {
  const location = useLocation();
  const from = location.state?.from;
  return (user) => (from ? `${from.pathname}${from.search ?? ""}` : homePathFor(user));
}

/* ============ CONNEXION ============ */
export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const redirectPath = useRedirectAfterLogin();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null); // { message, blocked }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Déjà connecté → directement vers son espace
  if (user && !submitting) return <Navigate to={redirectPath(user)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const loggedUser = await login(form.identifier.trim(), form.password);
      navigate(redirectPath(loggedUser), { replace: true });
    } catch (err) {
      // 403 = identifiants corrects mais compte voyageur en attente ou refusé
      setError({ message: errorMessage(err), blocked: err.status === 403 });
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto pt-7 pb-14">
        <h1 className="text-[21px] font-extrabold text-center mb-1">Bon retour !</h1>
        <p className="text-center text-muted text-[13.5px] mb-5">
          Connectez-vous pour gérer vos voyages et vos colis.
        </p>

        <form onSubmit={handleSubmit} className="border border-line rounded-2xl p-5 bg-white">
          <Field label="Adresse e-mail ou téléphone" hint="Téléphone avec l'indicatif pays, ex. +225 07 12 34 56 78.">
            <input
              value={form.identifier}
              onChange={set("identifier")}
              required
              autoComplete="username"
              placeholder="vous@exemple.com"
              className={inputClass}
            />
          </Field>
          <Field
            label="Mot de passe"
            hint={
              // L'e-mail ou le téléphone déjà saisi est repris sur la page suivante
              <Link to="/mot-de-passe-oublie" state={{ identifier: form.identifier }} className="underline">
                Mot de passe oublié ?
              </Link>
            }
          >
            <PasswordInput
              value={form.password}
              onChange={set("password")}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>

          {error && <Notice tone={error.blocked ? "warn" : "danger"}>{error.message}</Notice>}

          <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
            {submitting ? "Connexion…" : "Se connecter"}
          </button>

          {/* Séparateur "ou" */}
          <div className="flex items-center gap-3 text-muted text-xs my-4 before:content-[''] before:flex-1 before:border-t before:border-line-light after:content-[''] after:flex-1 after:border-t after:border-line-light">
            ou
          </div>

          <Link to="/inscription" className={`${btnOutline} w-full`}>Créer un compte</Link>
        </form>

        <Notice>
          Compte <b>voyageur</b> ? Vous pourrez vous connecter dès que l'administrateur aura
          approuvé votre profil.
        </Notice>
      </div>
    </Layout>
  );
}

/* ============ INSCRIPTION ============ */
const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", city: "", password: "", acceptTerms: false };

export function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState("client");
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({}); // erreurs affichées sous chaque champ
  const [formError, setFormError] = useState(null);
  const [pendingTraveler, setPendingTraveler] = useState(null); // voyageur inscrit, en attente
  const isTraveler = role === "voyageur";

  // Modifier un champ efface son message d'erreur
  const set = (k) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    setErrors((errs) => ({ ...errs, [k]: undefined }));
  };

  // Déjà connecté → directement vers son espace
  if (user && !submitting) return <Navigate to={homePathFor(user)} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await register({
        role: isTraveler ? "VOYAGEUR" : "CLIENT",
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        city: isTraveler ? form.city : undefined,
        password: form.password,
        acceptTerms: form.acceptTerms, // preuve d'acceptation enregistrée par le serveur (date + version)
      });

      if (result.pendingApproval) {
        setPendingTraveler(result.user);
        setSubmitting(false);
        return;
      }
      navigate(homePathFor(result.user), { replace: true }); // client : connecté directement
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
      setSubmitting(false);
    }
  }

  // Carte de sélection de rôle : bordure noire + ring quand active
  const roleBtn = (active) =>
    `border rounded-xl px-3 py-3.5 text-center cursor-pointer transition bg-white ${
      active ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink"
    }`;

  /* ===== Écran de confirmation (voyageur) ===== */
  if (pendingTraveler) {
    return (
      <Layout>
        <div className="max-w-md mx-auto pt-10 pb-14 text-center">
          <CircleCheck size={44} className="mx-auto text-success mb-3" />
          <h1 className="text-[21px] font-extrabold mb-1">Demande envoyée !</h1>
          <p className="text-muted text-[13.5px] mb-6">
            Merci {pendingTraveler.firstName}. L'administrateur MoveColis va vérifier votre profil
            voyageur. Vous pourrez vous connecter et publier vos voyages dès qu'il sera approuvé.
          </p>
          <Link to="/" className={`${btnPrimary} w-full`}>
            Retour aux voyages
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto pt-7 pb-14">
        <h1 className="text-[21px] font-extrabold text-center mb-1">Créer un compte</h1>
        <p className="text-center text-muted text-[13.5px] mb-5">
          Choisissez votre profil pour commencer.
        </p>

        {/* ===== Choix du rôle ===== */}
        <div className="grid grid-cols-2 gap-2.5 mb-4" role="radiogroup" aria-label="Type de compte">
          <button type="button" role="radio" aria-checked={!isTraveler}
            onClick={() => setRole("client")} className={roleBtn(!isTraveler)}>
            <Package size={22} className="mx-auto" />
            <div className="font-bold text-sm mt-1">Client</div>
            <div className="text-[11.5px] text-muted mt-0.5">J'envoie des colis</div>
          </button>
          <button type="button" role="radio" aria-checked={isTraveler}
            onClick={() => setRole("voyageur")} className={roleBtn(isTraveler)}>
            <Plane size={22} className="mx-auto" />
            <div className="font-bold text-sm mt-1">Voyageur</div>
            <div className="text-[11.5px] text-muted mt-0.5">Je vends mes kilos</div>
          </button>
        </div>

        {/* Avertissement approbation — uniquement pour le rôle voyageur */}
        {isTraveler && (
          <Notice tone="warn">
            <b>Approbation requise.</b> Les comptes voyageur sont vérifiés par
            l'administrateur avant activation. Vous pourrez vous connecter dès que
            votre compte sera actif.
          </Notice>
        )}

        <form onSubmit={handleSubmit} className="border border-line rounded-2xl p-5 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" error={errors.firstName}>
              <input value={form.firstName} onChange={set("firstName")} required
                autoComplete="given-name" placeholder="Awa" className={inputClass} />
            </Field>
            <Field label="Nom" error={errors.lastName}>
              <input value={form.lastName} onChange={set("lastName")} required
                autoComplete="family-name" placeholder="Koné" className={inputClass} />
            </Field>
          </div>

          <Field label="Adresse e-mail" error={errors.email}>
            <input value={form.email} onChange={set("email")} type="email" required
              autoComplete="email" placeholder="vous@exemple.com" className={inputClass} />
          </Field>

          <Field
            label="Numéro de téléphone (WhatsApp)"
            error={errors.phone}
            hint={isTraveler
              ? "Avec l'indicatif pays. L'administrateur l'utilisera pour vérifier votre profil."
              : "Avec l'indicatif pays. Vous pourrez aussi vous connecter avec ce numéro."}
          >
            <input value={form.phone} onChange={set("phone")} type="tel" required
              autoComplete="tel" placeholder="+225 07 00 00 00 00" className={inputClass} />
          </Field>

          {/* Champ ville — uniquement pour le voyageur */}
          {isTraveler && (
            <Field label="Ville de résidence" error={errors.city}>
              <input value={form.city} onChange={set("city")} required
                autoComplete="address-level2" placeholder="Ex. Moscou" className={inputClass} />
            </Field>
          )}

          <Field label="Mot de passe" error={errors.password}>
            <PasswordInput value={form.password} onChange={set("password")} required
              minLength={8} maxLength={72} autoComplete="new-password"
              placeholder="8 caractères minimum" />
          </Field>

          {/* Acceptation expresse des CGU et de la politique de confidentialité (obligatoire) */}
          <label className="flex items-start gap-2.5 text-[13px] mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.acceptTerms}
              onChange={set("acceptTerms")}
              required
              className="mt-0.5 w-4 h-4 accent-primary shrink-0"
            />
            <span>
              J'ai lu et j'accepte les{" "}
              <Link to="/cgu" target="_blank" className="font-bold underline">Conditions Générales d'Utilisation</Link> et la{" "}
              <Link to="/confidentialite" target="_blank" className="font-bold underline">Politique de confidentialité</Link>.
            </span>
          </label>
          {errors.acceptTerms && <p className="text-xs text-danger font-semibold -mt-3 mb-3">{errors.acceptTerms}</p>}

          {formError && <Notice tone="danger">{formError}</Notice>}

          <button type="submit" disabled={submitting} className={`${btnPrimary} w-full mt-1`}>
            {submitting
              ? "Envoi…"
              : isTraveler ? "Demander mon compte voyageur" : "Créer mon compte client"}
          </button>
        </form>

        <p className="text-center mt-4 text-sm">
          Déjà inscrit ?{" "}
          <Link to="/connexion" className="font-bold underline">Se connecter</Link>
        </p>
      </div>
    </Layout>
  );
}
