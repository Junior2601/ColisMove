import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { Badge, ErrorState, Field, Loader, Notice, btnOutline, inputClass } from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { timeAgo } from "../../lib/format";

/**
 * Paramètres → E-mails : état de l'envoi (SMTP, réglé dans .env.api sur le serveur) et e-mail de test.
 * Les e-mails servent au mot de passe oublié et à l'envoi des billets d'avion avec leur reçu.
 */
export default function MailSettings() {
  const { user } = useAuth();
  const status = useApi(() => adminApi.getMailStatus(), []);
  const [to, setTo] = useState(user?.email ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  async function sendTest(e) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const response = await adminApi.sendTestMail(to.trim() || null);
      status.setData(response.status);
      setResult({
        ok: true,
        message: response.sent
          ? `E-mail de test envoyé à ${response.to}. Vérifiez la boîte de réception, et les indésirables s'il n'arrive pas d'ici 2 minutes.`
          : `SMTP absent (développement) : l'e-mail pour ${response.to} est affiché dans la console du serveur.`,
      });
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
      status.reload(); // dernier contrôle mis à jour avec l'erreur
    } finally {
      setSending(false);
    }
  }

  const data = status.data;
  const check = data?.lastCheck;
  const badge = !data?.configured
    ? { tone: "danger", label: "Non configuré" }
    : check?.ok === false
      ? { tone: "danger", label: "En erreur" }
      : check?.ok
        ? { tone: "success", label: "Fonctionne" }
        : { tone: "pending", label: "Pas encore testé" };

  return (
    <section className="border border-line rounded-2xl p-5 bg-white mt-6" aria-labelledby="mail-settings-title">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 id="mail-settings-title" className="text-lg font-extrabold flex items-center gap-2">
          <Mail size={19} /> E-mails
        </h2>
        {data && <Badge tone={badge.tone}>{badge.label}</Badge>}
      </div>
      <p className="text-muted text-sm mb-3">
        Mot de passe oublié, alertes de sécurité et billets d'avion avec leur reçu partent par e-mail.
      </p>

      {status.error && <ErrorState error={status.error} onRetry={status.reload} />}
      {status.loading && !data && <Loader className="py-4" />}

      {data && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm mb-3">
            <dt className="text-muted">Serveur</dt>
            <dd className="font-semibold break-all">{data.host ? `${data.host}:${data.port}` : "—"}</dd>
            <dt className="text-muted">Expéditeur</dt>
            <dd className="font-semibold break-all">{data.from}</dd>
            <dt className="text-muted">Réponses des clients</dt>
            <dd className="font-semibold break-all">{data.replyTo ?? `à l'expéditeur`}</dd>
            {check && (
              <>
                <dt className="text-muted">Dernier contrôle</dt>
                <dd className="font-semibold">{timeAgo(check.at)}</dd>
              </>
            )}
          </dl>

          {!data.configured && (
            <Notice tone="danger">
              Aucun e-mail ne part : les billets d'avion ne peuvent pas être envoyés. Renseignez <b>SMTP_HOST</b>,{" "}
              <b>SMTP_USER</b>, <b>SMTP_PASS</b> et <b>MAIL_FROM</b> dans <code>.env.api</code> sur le serveur, puis
              redémarrez l'API.
            </Notice>
          )}
          {data.configured && check?.ok === false && <ErrorState message={check.error} />}
        </>
      )}

      <form onSubmit={sendTest} className="mt-2">
        <Field label="Envoyer un e-mail de test à" hint="Un vrai e-mail part : c'est le seul moyen de vérifier qu'il arrive bien (et pas dans les indésirables).">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="email"
              className={inputClass}
            />
            <button type="submit" disabled={sending || !to.trim()} className={`${btnOutline} shrink-0`}>
              <Send size={16} /> {sending ? "Envoi…" : "Envoyer le test"}
            </button>
          </div>
        </Field>
        {result && (result.ok ? <Notice tone="success">{result.message}</Notice> : <ErrorState message={result.message} />)}
      </form>
    </section>
  );
}
