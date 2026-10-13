import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import Layout from "../../components/Layout";
import { Badge, ErrorState, btnPrimary, btnSm } from "../../components/ui";
import { publicApi } from "../../api/public";
import { errorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { findGuestAccessByCode } from "../../lib/guestAccess";
import { formatDateTime, formatKg, formatMoney, formatTripDate, routeLabel } from "../../lib/format";
import { paths } from "../../lib/hashid";
import { RESERVATION_FLOW, RESERVATION_STATUS, TRACKING_STEPS } from "../../lib/status";

/**
 * Une étape de la timeline.
 * - done      → pastille verte pleine
 * - current   → pastille blanche bordée corail + halo (ring)
 * - todo      → pastille grise
 * - cancelled → pastille rouge
 * La ligne verticale relie chaque étape à la suivante (sauf la dernière).
 */
function TimelineItem({ step, isLast }) {
  const dot = {
    done: "bg-success border-success",
    current: "bg-white border-primary ring-4 ring-primary/15",
    todo: "bg-surface border-line",
    cancelled: "bg-danger border-danger",
  }[step.state];

  return (
    <li className="relative pl-7 pb-5 last:pb-0">
      {!isLast && <span className="absolute left-2 top-5 bottom-0 border-l-2 border-line-light" />}
      <span className={`absolute left-0 top-0.5 w-4.5 h-4.5 rounded-full border-2 ${dot}`} />
      <div
        className={`font-bold text-sm ${step.state === "current" ? "text-primary" : ""} ${
          step.state === "cancelled" ? "text-danger" : ""
        }`}
      >
        {step.title}
      </div>
      {step.sub && <div className="text-[12.5px] text-muted">{step.sub}</div>}
    </li>
  );
}

// Historique de l'API → étapes de la timeline (les étapes à venir sont affichées en gris)
function buildSteps(tracking) {
  const describe = (event) =>
    event ? `${formatDateTime(event.createdAt)}${event.note ? ` · ${event.note}` : ""}` : "";

  if (tracking.status === "CANCELLED") {
    return tracking.history.map((event) => ({
      key: `${event.status}-${event.createdAt}`,
      title: TRACKING_STEPS[event.status],
      sub: describe(event),
      state: event.status === "CANCELLED" ? "cancelled" : "done",
    }));
  }

  const currentIndex = RESERVATION_FLOW.indexOf(tracking.status);
  return RESERVATION_FLOW.map((status, i) => ({
    key: status,
    title: TRACKING_STEPS[status],
    sub: i <= currentIndex ? describe(tracking.history.find((e) => e.status === status)) : "À venir",
    state:
      i < currentIndex || (i === currentIndex && status === "DELIVERED")
        ? "done"
        : i === currentIndex
          ? "current"
          : "todo",
  }));
}

export default function Tracking() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function track(value) {
    const clean = value.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      // Le token est envoyé s'il existe : client concerné, propriétaire ou admin → suivi détaillé
      setResult(await publicApi.getTracking(clean));
      setSearchParams({ code: clean }, { replace: true }); // lien partageable /suivi?code=…
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // Arrivée avec ?code=… (depuis l'espace client ou la messagerie) → recherche automatique
  useEffect(() => {
    const initial = searchParams.get("code");
    if (initial) track(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTrack(e) {
    e.preventDefault();
    track(code);
  }

  const steps = result ? buildSteps(result) : [];
  const status = result ? RESERVATION_STATUS[result.status] : null;
  // Conversation : via le compte (suivi détaillé) ou via l'accès visiteur mémorisé sur cet appareil
  const conversationId =
    result && (result.conversationId ?? findGuestAccessByCode(result.trackingCode)?.conversationId);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Suivre un colis</h1>
        <p className="text-muted text-sm mb-4">
          Entrez le code de suivi reçu lors de votre réservation.
        </p>

        {/* ===== Champ code + bouton ===== */}
        <form onSubmit={handleTrack} className="border border-line rounded-2xl p-5 bg-white">
          <label htmlFor="code" className="block text-[13px] font-bold mb-1.5">
            Code de suivi
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MC-20260725-AB3D"
              className="flex-1 min-w-0 border border-line rounded-lg px-3.5 py-3 outline-none font-bold tracking-wide uppercase focus:border-ink focus:ring-1 focus:ring-ink transition"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary hover:bg-primary-dark text-white font-bold px-5 transition active:scale-[.98] disabled:opacity-50"
            >
              {loading ? "…" : "Suivre"}
            </button>
          </div>
        </form>

        {error && <ErrorState message={error} />}

        {/* ===== Résultat ===== */}
        {result && (
          <>
            <div className="border border-line-light rounded-xl px-4 py-4 mt-4 bg-white">
              <div className="flex justify-between items-start gap-2.5 mb-2">
                <div>
                  <div className="font-bold text-[14.5px]">
                    Colis <span className="font-mono">{result.trackingCode}</span> · {formatKg(result.kilos)}
                  </div>
                  <div className="text-[13px] text-muted">
                    {routeLabel(result.trip)} · Voyage du {formatTripDate(result.trip.departureAt)}
                    {result.trip.stopCity && ` · escale à ${result.trip.stopCity}`}
                  </div>
                  {result.detailed && (
                    <div className="text-[13px] text-muted">
                      {result.parcelDescription && `📦 ${result.parcelDescription} · `}
                      {formatMoney(result.totalAmount, result.currency)}
                    </div>
                  )}
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>

              <ul className="mt-2.5">
                {steps.map((s, i) => (
                  <TimelineItem key={s.key} step={s} isLast={i === steps.length - 1} />
                ))}
              </ul>

              {conversationId && (
                <Link to={paths.conversation(conversationId)} className={`${btnPrimary} ${btnSm} mt-4`}>
                  <MessageCircle size={15} /> Ouvrir la conversation
                </Link>
              )}
            </div>

            {/* Bannière visiteur : suivi limité sans compte */}
            {!result.detailed && !user && (
              <div className="rounded-xl px-4 py-3.5 text-[13.5px] bg-[#F0F7FF] text-[#1565C0] my-3.5">
                Vous suivez ce colis en tant que <b>visiteur</b> : seules les grandes étapes sont
                visibles.{" "}
                <Link to="/inscription" className="font-bold underline">
                  Créez un compte client
                </Link>{" "}
                pour un suivi détaillé et l'historique complet de vos envois.
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
