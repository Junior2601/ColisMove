import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CircleCheck, KeyRound, LinkIcon } from "lucide-react";
import Layout from "../../components/Layout";
import PasswordInput from "../../components/PasswordInput";
import { Field, Loader, Notice, btnPrimary } from "../../components/ui";
import { authApi } from "../../api/auth";
import { errorMessage, fieldErrors } from "../../api/client";
import { useApi } from "../../hooks/useApi";

/**
 * Étape 2 : lien reçu par e-mail → /mot-de-passe/reinitialiser#<jeton>
 * Le jeton est dans l'ancre (#) : il n'est jamais envoyé aux serveurs ni enregistré dans leurs journaux.
 */
export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => location.hash.slice(1));
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Le lien est-il encore valable ? (expiré, déjà utilisé…)
  const check = useApi(
    () => (token ? authApi.checkResetToken(token) : Promise.reject(new Error("Lien incomplet."))),
    [token]
  );

  // On retire le jeton de la barre d'adresse (historique, captures d'écran)
  useEffect(() => {
    if (location.hash) navigate(location.pathname, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return setErrors({ confirm: "Les deux mots de passe ne correspondent pas." });
    setSubmitting(true);
    setErrors({});
    try {
      await authApi.resetPassword(token, form.password);
      setDone(true);
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(Object.keys(byField).length ? byField : { form: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto pt-7 pb-14">
        {done ? (
          /* ===== Succès ===== */
          <div className="text-center">
            <CircleCheck size={44} className="mx-auto text-success mb-3" />
            <h1 className="text-[21px] font-extrabold mb-2">Mot de passe modifié</h1>
            <p className="text-muted text-[13.5px] mb-6">
              Vous pouvez maintenant vous connecter avec votre nouveau mot de passe. Par sécurité, vos autres sessions
              ont été déconnectées.
            </p>
            <Link to="/connexion" className={`${btnPrimary} w-full`}>Se connecter</Link>
          </div>
        ) : check.loading && !check.data ? (
          <Loader label="Vérification du lien…" />
        ) : check.error ? (
          /* ===== Lien expiré, déjà utilisé ou incomplet ===== */
          <div className="text-center">
            <LinkIcon size={40} className="mx-auto text-muted mb-3" />
            <h1 className="text-[21px] font-extrabold mb-2">Lien plus valable</h1>
            <p className="text-muted text-[13.5px] mb-6">
              {check.error.message} Les liens sont valables 30 minutes et ne servent qu'une fois.
            </p>
            <Link to="/mot-de-passe-oublie" className={`${btnPrimary} w-full`}>Recevoir un nouveau lien</Link>
          </div>
        ) : (
          /* ===== Formulaire ===== */
          <>
            <h1 className="text-[21px] font-extrabold text-center mb-1">Nouveau mot de passe</h1>
            <p className="text-center text-muted text-[13.5px] mb-5">
              Pour le compte <b className="text-ink">{check.data.email}</b>.
            </p>
            <form onSubmit={handleSubmit} className="border border-line rounded-2xl p-5 bg-white">
              <Field label="Nouveau mot de passe" error={errors.password} hint="8 caractères minimum.">
                <PasswordInput
                  value={form.password}
                  onChange={set("password")}
                  required
                  minLength={8}
                  maxLength={72}
                  autoFocus
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirmation" error={errors.confirm}>
                <PasswordInput value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" />
              </Field>
              {errors.form && <Notice tone="danger">{errors.form}</Notice>}
              <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
                <KeyRound size={17} /> {submitting ? "Enregistrement…" : "Enregistrer le mot de passe"}
              </button>
            </form>
          </>
        )}
      </div>
    </Layout>
  );
}
