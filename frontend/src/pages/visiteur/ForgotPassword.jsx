import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MailCheck } from "lucide-react";
import Layout from "../../components/Layout";
import { Field, Notice, btnOutline, btnPrimary, inputClass } from "../../components/ui";
import { authApi } from "../../api/auth";
import { errorMessage } from "../../api/client";
import { LEGAL } from "../../config/legal";

const RESEND_DELAY = 60; // secondes avant de pouvoir redemander un e-mail

/** Étape 1 : l'utilisateur indique son e-mail ou son téléphone, il reçoit un lien par e-mail */
export default function ForgotPassword() {
  const location = useLocation();
  // Pré-rempli avec ce qui était saisi sur la page de connexion
  const [identifier, setIdentifier] = useState(location.state?.identifier ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function send(e) {
    e?.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await authApi.forgotPassword(identifier.trim());
      setSent(true);
      setCountdown(RESEND_DELAY);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto pt-7 pb-14">
        {sent ? (
          <div className="text-center">
            <MailCheck size={44} className="mx-auto text-success mb-3" />
            <h1 className="text-[21px] font-extrabold mb-2">Vérifiez votre boîte mail</h1>
            <p className="text-muted text-[13.5px] mb-5">
              Si un compte MoveColis correspond à <b className="text-ink">{identifier.trim()}</b>, vous allez recevoir
              un e-mail avec un lien pour choisir un nouveau mot de passe. Le lien est valable 30 minutes.
            </p>
            <Notice>Rien reçu ? Regardez dans les courriers indésirables (spam), puis réessayez.</Notice>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={send} disabled={countdown > 0 || submitting} className={`${btnOutline} w-full`}>
                {countdown > 0 ? `Renvoyer l'e-mail (${countdown} s)` : "Renvoyer l'e-mail"}
              </button>
              <Link to="/connexion" className={`${btnPrimary} w-full`}>Retour à la connexion</Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-[21px] font-extrabold text-center mb-1">Mot de passe oublié ?</h1>
            <p className="text-center text-muted text-[13.5px] mb-5">
              Indiquez l'adresse e-mail ou le téléphone de votre compte : nous vous envoyons un lien par e-mail pour en
              choisir un nouveau.
            </p>
            <form onSubmit={send} className="border border-line rounded-2xl p-5 bg-white">
              <Field label="Adresse e-mail ou téléphone" hint="Téléphone avec l'indicatif pays, ex. +225 07 12 34 56 78.">
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="vous@exemple.com"
                  className={inputClass}
                />
              </Field>
              {error && <Notice tone="danger">{error}</Notice>}
              <button type="submit" disabled={submitting || identifier.trim().length < 3} className={`${btnPrimary} w-full`}>
                {submitting ? "Envoi…" : "Recevoir le lien"}
              </button>
            </form>
            <p className="text-center mt-4 text-sm">
              <Link to="/connexion" className="font-bold underline">Retour à la connexion</Link>
            </p>
          </>
        )}
        {LEGAL.email && (
          <p className="text-center text-xs text-muted mt-5">
            Plus accès à votre e-mail ? Écrivez-nous : <a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a>
          </p>
        )}
      </div>
    </Layout>
  );
}
