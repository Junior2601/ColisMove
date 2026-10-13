import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Minus, Plus, MessageCircle } from "lucide-react";
import Layout from "../../components/Layout";
import { RouteLine } from "../../components/TripCard";
import { ErrorState, Field, Loader, Notice, btnPrimary, inputClass } from "../../components/ui";
import { publicApi } from "../../api/public";
import { errorMessage, fieldErrors } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { saveGuestAccess } from "../../lib/guestAccess";
import { decodeId, paths } from "../../lib/hashid";
import {
  coverClassFor, formatKg, formatMoney, formatTripDate, formatTripTime, ownerLabel, routeLabel,
} from "../../lib/format";

// Ligne clé/valeur du récapitulatif
function Row({ k, v }) {
  return (
    <div className="flex justify-between text-sm py-2.5 border-b border-line-light last:border-0 gap-4">
      <span className="text-muted shrink-0">{k}</span>
      <span className="font-bold text-right">{v}</span>
    </div>
  );
}

// Pourquoi le formulaire n'est pas proposé (ou null s'il l'est)
function bookingBlocker(trip, user) {
  if (trip.hasDeparted || trip.status === "COMPLETED") return "Ce voyage est déjà parti.";
  if (trip.kilosAvailable <= 0) return "Ce voyage est complet.";
  if (user && user.id === trip.ownerId) return "C'est votre voyage : les réservations des clients arrivent dans votre messagerie.";
  if (user && user.role !== "CLIENT") {
    return "Vous êtes connecté avec un compte administrateur ou voyageur : les réservations se font avec un compte client ou sans compte.";
  }
  return null;
}

export default function TripDetail() {
  const tripId = decodeId(useParams().id); // /voyage/Xk9mP2qA → 12
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: trip, loading, error, reload } = useApi(
    () =>
      tripId
        ? publicApi.getTrip(tripId)
        : Promise.reject(Object.assign(new Error("Ce voyage n'existe pas ou n'est plus disponible."), { status: 404 })),
    [tripId]
  );

  const [form, setForm] = useState({ name: "", phone: "", desc: "" });
  const [kg, setKg] = useState(5);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  const set = (k, apiField) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((errs) => ({ ...errs, [apiField]: undefined }));
  };

  // Client connecté : nom et téléphone pré-remplis depuis son compte
  useEffect(() => {
    if (user?.role !== "CLIENT") return;
    setForm((f) => ({
      ...f,
      name: f.name || `${user.firstName} ${user.lastName}`,
      phone: f.phone || `+${user.phone}`,
    }));
  }, [user]);

  // La quantité ne dépasse jamais les kilos restants (même après un rafraîchissement)
  useEffect(() => {
    if (trip) setKg((k) => Math.min(Math.max(k, 1), trip.kilosAvailable));
  }, [trip]);

  if (loading && !trip) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Link to="/" className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
          <ArrowLeft size={16} /> Retour aux voyages
        </Link>
        {error.status === 404 ? (
          <Notice tone="warn">{error.message}</Notice>
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )}
      </Layout>
    );
  }

  const total = kg * trip.pricePerKilo;
  const blocker = bookingBlocker(trip, user);
  // Garde toujours kg entre 1 et le stock disponible
  const clamp = (v) => Math.min(trip.kilosAvailable, Math.max(1, Number.isFinite(v) ? v : 1));

  async function handleReserve(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      nameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await publicApi.createReservation({
        tripId: trip.id,
        clientName: form.name.trim(),
        clientPhone: form.phone,
        parcelDescription: form.desc.trim() || null,
        kilos: kg,
      });

      // Visiteur : on garde sur cet appareil le jeton qui ouvre sa conversation
      if (result.guestToken) {
        saveGuestAccess({
          conversationId: result.conversationId,
          guestToken: result.guestToken,
          trackingCode: result.reservation.trackingCode,
          route: routeLabel(trip),
          departureAt: trip.departureAt,
        });
      }

      // Direction la messagerie : le propriétaire confirme la réservation dans la conversation
      navigate(paths.conversation(result.conversationId), {
        state: { justReserved: { trackingCode: result.reservation.trackingCode } },
      });
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
      if (err.status === 409) reload(); // kilos pris entre-temps : on rafraîchit le stock affiché
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <Link to="/" className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
        <ArrowLeft size={16} /> Retour aux voyages
      </Link>

      {/* Mobile : une colonne · Desktop : détails 2/3 + réservation 1/3 */}
      <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-7 lg:items-start">

        {/* ===== Colonne détails ===== */}
        <div>
          {/* Couverture */}
          <div className={`rounded-2xl bg-gradient-to-br ${coverClassFor(trip)} text-white px-5 py-6 mt-4`}>
            <span className="inline-block bg-white text-ink text-xs font-bold rounded-full px-3 py-1.5 shadow-card mb-2.5">
              {formatKg(trip.kilosAvailable)} encore disponibles
            </span>
            <div className="text-2xl font-extrabold">{routeLabel(trip)}</div>
            <div className="opacity-90 text-[13.5px] mt-1">
              Publié par {trip.owner.role === "ADMIN" ? "MoveColis (vérifié)" : ownerLabel(trip.owner)}
              {trip.stopCity && ` · Escale à ${trip.stopCity}`}
            </div>
          </div>

          {/* Route de vol (codes aéroport) */}
          <div className="border border-line-light rounded-xl px-4 py-4 my-4">
            <RouteLine trip={trip} compact />
          </div>

          {/* Récapitulatif complet (heures locales de chaque ville) */}
          <div className="border border-line rounded-2xl p-5 bg-white mb-4">
            <Row k="Ville de départ" v={trip.departureCity} />
            <Row k="Date · heure de départ" v={`${formatTripDate(trip.departureAt)} · ${formatTripTime(trip.departureAt)}`} />
            {trip.stopCity && <Row k="Ville d'escale" v={`${trip.stopCity} · ${trip.stopDuration}`} />}
            <Row k="Ville d'arrivée" v={trip.arrivalCity} />
            <Row k="Date · heure d'arrivée" v={`${formatTripDate(trip.arrivalAt)} · ${formatTripTime(trip.arrivalAt)}`} />
            <Row k="Prix par kilo" v={formatMoney(trip.pricePerKilo, trip.currency)} />
            <Row k="Kilos disponibles" v={formatKg(trip.kilosAvailable)} />
          </div>
        </div>

        {/* ===== Colonne réservation ===== */}
        <div className="border border-line rounded-2xl p-5 bg-white mb-8">
          <h2 className="text-[17px] font-extrabold mb-3.5">Réserver des kilos</h2>

          {blocker ? (
            <Notice tone="warn">{blocker}</Notice>
          ) : (
            <form onSubmit={handleReserve}>
              <Field label="Nom complet" error={errors.clientName}>
                <input ref={nameRef} value={form.name} onChange={set("name", "clientName")} required
                  autoComplete="name" placeholder="Ex. Koné Awa" className={inputClass} />
              </Field>

              <Field
                label="Numéro de téléphone (WhatsApp)"
                error={errors.clientPhone}
                hint="Avec l'indicatif pays. Le propriétaire du voyage vous répondra dans la messagerie MoveColis."
              >
                <input value={form.phone} onChange={set("phone", "clientPhone")} type="tel" required
                  autoComplete="tel" placeholder="+225 07 00 00 00 00" className={inputClass} />
              </Field>

              <Field label="Description du colis" error={errors.parcelDescription}>
                <textarea value={form.desc} onChange={set("desc", "parcelDescription")} rows={2} maxLength={500}
                  placeholder="Ex. Vêtements et documents" className={inputClass} />
              </Field>

              {/* Compteur de kilos */}
              <Field label="Nombre de kilos" error={errors.kilos}>
                <div className="flex items-center gap-3.5">
                  <button type="button" aria-label="Réduire" onClick={() => setKg((v) => clamp(v - 1))}
                    className="w-9 h-9 rounded-full border border-line bg-white flex items-center justify-center hover:border-ink transition">
                    <Minus size={17} />
                  </button>
                  <input type="number" value={kg} min={1} max={trip.kilosAvailable}
                    onChange={(e) => setKg(clamp(parseFloat(e.target.value)))}
                    aria-label="Nombre de kilos"
                    className="w-16 text-center text-lg font-extrabold outline-none" />
                  <button type="button" aria-label="Augmenter" onClick={() => setKg((v) => clamp(v + 1))}
                    className="w-9 h-9 rounded-full border border-line bg-white flex items-center justify-center hover:border-ink transition">
                    <Plus size={17} />
                  </button>
                </div>
              </Field>

              {/* Total en direct */}
              <div className="flex justify-between text-[15px] py-1.5">
                <span>{formatMoney(trip.pricePerKilo, trip.currency)} × {formatKg(kg)}</span>
                <span>{formatMoney(total, trip.currency)}</span>
              </div>
              <div className="flex justify-between text-[17px] font-extrabold border-t border-line-light pt-3 mt-1.5">
                <span>Total estimé</span>
                <span>{formatMoney(total, trip.currency)}</span>
              </div>

              {formError && <Notice tone="danger">{formError}</Notice>}

              <button type="submit" disabled={submitting} className={`${btnPrimary} w-full mt-3.5`}>
                <MessageCircle size={18} /> {submitting ? "Réservation…" : "Réserver et écrire au voyageur"}
              </button>

              <p className="text-[12.5px] text-muted text-center mt-2.5">
                Étape 1 : réservez · Étape 2 : échangez avec le propriétaire du voyage dans la messagerie
                MoveColis pour confirmer.
              </p>
              <p className="text-xs text-muted text-center mt-2">
                En réservant, vous acceptez les{" "}
                <Link to="/cgu" className="font-bold underline">CGU</Link> (notamment la liste des objets interdits) et la{" "}
                <Link to="/confidentialite" className="font-bold underline">Politique de confidentialité</Link>.
              </p>
              {!user && (
                <p className="text-xs text-muted text-center mt-2">
                  Sans compte, votre conversation reste accessible depuis cet appareil.{" "}
                  <Link to="/inscription" className="font-bold underline">Créer un compte</Link>
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
}
