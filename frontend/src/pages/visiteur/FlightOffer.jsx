import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info, MessageCircle, Minus, Plus } from "lucide-react";
import Layout from "../../components/Layout";
import { AirlineLogo, FlightLine } from "../../components/flights/FlightOfferCard";
import { ErrorState, Field, Loader, Notice, btnPrimary, inputClass } from "../../components/ui";
import { flightsApi } from "../../api/flights";
import { errorMessage, fieldErrors } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { saveGuestAccess } from "../../lib/guestAccess";
import { decodeId, paths } from "../../lib/hashid";
import { formatKg, formatMoney, formatTripDate, formatTripTime, plural } from "../../lib/format";
import { baggageLabel, computeTotal, formatDuration, includedBags, stopsDetail } from "../../lib/flights";

// Ligne clé/valeur du récapitulatif
function Row({ k, v }) {
  return (
    <div className="flex justify-between text-sm py-2.5 border-b border-line-light last:border-0 gap-4">
      <span className="text-muted shrink-0">{k}</span>
      <span className="font-bold text-right">{v}</span>
    </div>
  );
}

// Compteur − n + (passagers, options à plusieurs exemplaires)
function Stepper({ label, hint, value, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-bold">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <button type="button" aria-label={`${label} : un de moins`} disabled={value <= min} onClick={() => onChange(value - 1)}
          className="w-8 h-8 rounded-full border border-line bg-white flex items-center justify-center hover:border-ink transition disabled:opacity-30">
          <Minus size={15} />
        </button>
        <span className="w-5 text-center font-extrabold" aria-live="polite">{value}</span>
        <button type="button" aria-label={`${label} : un de plus`} disabled={value >= max} onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full border border-line bg-white flex items-center justify-center hover:border-ink transition disabled:opacity-30">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}

// Pourquoi le formulaire n'est pas proposé (ou null s'il l'est)
function orderBlocker(user) {
  if (user && user.role !== "CLIENT") {
    return "Vous êtes connecté avec un compte administrateur ou voyageur : les billets s'achètent avec un compte client ou sans compte.";
  }
  return null;
}

export default function FlightOffer() {
  const offerId = decodeId(useParams().id); // /billet/Xk9mP2qA → 12
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(
    () =>
      offerId
        ? flightsApi.getOffer(offerId)
        : Promise.reject(Object.assign(new Error("Ce billet n'existe pas ou n'est plus disponible."), { status: 404 })),
    [offerId]
  );

  const [passengers, setPassengers] = useState({ adults: 1, children: 0, infants: 0 });
  const [quantities, setQuantities] = useState({}); // { [optionId]: quantité }
  const [removedBags, setRemovedBags] = useState(0); // valises en soute retirées (réduction sur le billet)
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  // Client connecté : nom, téléphone et e-mail pré-remplis depuis son compte (une fois le compte chargé)
  const [prefilledFor, setPrefilledFor] = useState(null);
  if (user?.role === "CLIENT" && prefilledFor !== user.id) {
    setPrefilledFor(user.id);
    setForm((f) => ({
      ...f,
      name: f.name || `${user.firstName} ${user.lastName}`,
      phone: f.phone || `+${user.phone}`,
      email: f.email || user.email || "",
    }));
  }

  if (loading && !data) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Link to="/?onglet=billets" className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
          <ArrowLeft size={16} /> Rechercher un billet
        </Link>
        {error.status === 404 ? <Notice tone="warn">{error.message}</Notice> : <ErrorState error={error} onRetry={reload} />}
      </Layout>
    );
  }

  const { offer, config } = data;
  const money = (amount) => formatMoney(amount, offer.currency);
  const seats = passengers.adults + passengers.children + passengers.infants;
  // Valises en soute : incluses pour tous les passagers (hors bébés), le client peut en retirer si l'admin l'autorise
  const bagsIncluded = includedBags(offer, passengers);
  const canRemoveBags = offer.bagRefund > 0;
  const bagsKept = bagsIncluded - (canRemoveBags ? Math.min(removedBags, bagsIncluded) : 0);
  const { lines, total, freedKilos } = computeTotal(offer, passengers, quantities, config.options, money, bagsKept);
  const blocker = orderBlocker(user);
  const route = `${offer.origin.name} → ${offer.destination.name}`;
  // Retour à la recherche de ce trajet et de ce mois (même depuis un lien partagé)
  const searchLink = `/?onglet=billets&origine=${offer.origin.code}&destination=${offer.destination.code}&mois=${offer.departureAt.slice(0, 7)}`;

  const setCount = (key) => (value) => setPassengers((p) => ({ ...p, [key]: value }));
  const set = (key, apiField) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [apiField]: undefined }));
  };

  async function handleOrder(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      nameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await flightsApi.createOrder({
        offerId: offer.id,
        clientName: form.name.trim(),
        clientPhone: form.phone,
        clientEmail: form.email.trim(),
        note: form.note.trim() || null,
        ...passengers,
        checkedBags: bagsKept,
        options: Object.entries(quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([id, quantity]) => ({ id: Number(id), quantity })),
        expectedTotal: total, // si le prix a changé entre-temps, le serveur refuse et on affiche le nouveau
      });

      // Visiteur : on garde sur cet appareil le jeton qui ouvre sa conversation
      if (result.guestToken) {
        saveGuestAccess({
          conversationId: result.conversationId,
          guestToken: result.guestToken,
          trackingCode: result.flightOrder.reference,
          route: `✈️ ${route}`,
          departureAt: offer.departureAt,
        });
      }
      navigate(paths.conversation(result.conversationId), {
        state: { justOrdered: { reference: result.flightOrder.reference } },
      });
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
      if (err.status === 409 || err.status === 404) reload(); // prix ou disponibilité changés : on rafraîchit
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <Link to={searchLink} className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
        <ArrowLeft size={16} /> Retour aux billets {route}
      </Link>

      {/* Mobile : une colonne · Desktop : détails 2/3 + configuration 1/3 */}
      <div className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-7 lg:items-start">
        {/* ===== Colonne détails ===== */}
        <div>
          <div className="rounded-2xl bg-gradient-to-br from-[#FF385C] to-[#B3123F] text-white px-5 py-6 mt-4">
            <span className="inline-block bg-white text-ink text-xs font-bold rounded-full px-3 py-1.5 shadow-card mb-2.5">
              À partir de {money(offer.adultPrice)} par adulte
            </span>
            <div className="text-2xl font-extrabold">{route}</div>
            <div className="opacity-90 text-[13.5px] mt-1">
              {formatTripDate(offer.departureAt)} · départ {formatTripTime(offer.departureAt)} (heure locale)
            </div>
          </div>

          <div className="border border-line-light rounded-xl px-4 py-4 my-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <AirlineLogo code={offer.airline} name={offer.airlineName} className="h-7" />
              <span className="text-sm font-semibold text-muted">
                {offer.airlineName} · vol {offer.airline} {offer.flightNumber}
              </span>
            </div>
            <FlightLine offer={offer} />
          </div>

          <div className="border border-line rounded-2xl p-5 bg-white mb-4">
            <Row k="Compagnie" v={`${offer.airlineName} (${offer.airline} ${offer.flightNumber})`} />
            <Row k="Départ" v={`${offer.origin.name}${offer.originAirport ? ` · ${offer.originAirport}` : ""}`} />
            <Row k="Date · heure de départ" v={`${formatTripDate(offer.departureAt)} · ${formatTripTime(offer.departureAt)}`} />
            <Row k="Arrivée" v={`${offer.destination.name}${offer.destinationAirport ? ` · ${offer.destinationAirport}` : ""}`} />
            {offer.arrivalAt && (
              <Row k="Date · heure d'arrivée" v={`${formatTripDate(offer.arrivalAt)} · ${formatTripTime(offer.arrivalAt)}`} />
            )}
            <Row k={offer.transfers > 1 ? "Escales" : "Escale"} v={stopsDetail(offer.transfers, offer.stops)} />
            {offer.durationMinutes && <Row k="Durée totale" v={formatDuration(offer.durationMinutes)} />}
            <Row k="Bagages inclus" v={baggageLabel(offer)} />
            <Row k="Prix enfant (2-11 ans)" v={money(offer.childPrice)} />
            <Row k="Prix bébé (moins de 2 ans)" v={money(offer.infantPrice)} />
          </div>

          {offer.info && (
            <Notice>
              <b>À savoir :</b> {offer.info}
            </Notice>
          )}
        </div>

        {/* ===== Colonne configuration et demande ===== */}
        <div className="border border-line rounded-2xl p-5 bg-white mb-8">
          <h2 className="text-[17px] font-extrabold mb-1">Configurer mon billet</h2>
          <p className="text-xs text-muted mb-2">Le prix se met à jour selon vos choix.</p>

          {blocker ? (
            <Notice tone="warn">{blocker}</Notice>
          ) : (
            <form onSubmit={handleOrder}>
              {/* Passagers */}
              <div className="border-b border-line-light pb-2 mb-3">
                <Stepper label="Adultes" hint="12 ans et plus" value={passengers.adults} min={1}
                  max={config.maxPassengers - passengers.children - passengers.infants}
                  onChange={(adults) => setPassengers((p) => ({ ...p, adults, infants: Math.min(p.infants, adults) }))} />
                <Stepper label="Enfants" hint="2 à 11 ans" value={passengers.children} min={0}
                  max={config.maxPassengers - passengers.adults - passengers.infants} onChange={setCount("children")} />
                <Stepper label="Bébés" hint="Moins de 2 ans, sur les genoux" value={passengers.infants} min={0}
                  max={Math.min(passengers.adults, config.maxPassengers - passengers.adults - passengers.children)}
                  onChange={setCount("infants")} />
              </div>

              {/* Valises en soute : en retirer réduit le prix */}
              {bagsIncluded > 0 && (
                <div className="border-b border-line-light pb-2 mb-3">
                  {canRemoveBags ? (
                    <>
                      <Stepper
                        label={`Valises en soute (${offer.checkedBagKg} kg)`}
                        hint={`${plural(offer.checkedBags, "valise")} incluse${offer.checkedBags > 1 ? "s" : ""} par passager (hors bébés) · −${money(offer.bagRefund)} par valise retirée`}
                        value={bagsKept} min={0} max={bagsIncluded}
                        onChange={(kept) => setRemovedBags(bagsIncluded - kept)}
                      />
                      {freedKilos > 0 && (
                        <p className="text-xs text-muted pb-1">
                          {formatKg(freedKilos)} libérés : cette place en soute revient à MoveColis.
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-sm py-2">
                      <b>Valises en soute :</b> {bagsIncluded} × {offer.checkedBagKg} kg incluses
                    </div>
                  )}
                </div>
              )}

              {/* Options définies par l'admin */}
              {config.options.length > 0 && (
                <div className="border-b border-line-light pb-2 mb-3">
                  <div className="text-[13px] font-bold mb-1">Options</div>
                  {config.options.map((option) => {
                    const quantity = quantities[option.id] ?? 0;
                    const price = `+${money(option.price)}${option.unit === "PASSENGER" ? " par passager" : ""}`;
                    const setQuantity = (value) => setQuantities((q) => ({ ...q, [option.id]: value }));
                    return option.maxQuantity > 1 ? (
                      <Stepper key={option.id} label={option.label} hint={[option.description, price].filter(Boolean).join(" · ")}
                        value={quantity} min={0} max={option.maxQuantity} onChange={setQuantity} />
                    ) : (
                      <label key={option.id} className="flex items-start gap-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={quantity > 0} onChange={(e) => setQuantity(e.target.checked ? 1 : 0)}
                          className="w-4 h-4 mt-0.5 accent-primary shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{option.label}</span>
                          <span className="block text-xs text-muted">{[option.description, price].filter(Boolean).join(" · ")}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Détail du prix en direct */}
              <div className="mb-4">
                {lines.map((line, i) => (
                  <div key={`${i}-${line.label}`} className="flex justify-between gap-3 text-[13.5px] py-1">
                    <span className="min-w-0">
                      {line.label} <span className="text-muted">{line.detail}</span>
                    </span>
                    {/* Réduction (valises retirées) en vert */}
                    <span className={`shrink-0 ${line.amount < 0 ? "text-success font-bold" : ""}`}>
                      {line.amount < 0 ? `−${money(-line.amount)}` : money(line.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-[17px] font-extrabold border-t border-line-light pt-3 mt-1.5">
                  <span>Total ({seats} {seats > 1 ? "passagers" : "passager"})</span>
                  <span>{money(total)}</span>
                </div>
              </div>

              {/* Coordonnées */}
              <Field label="Nom complet" error={errors.clientName}>
                <input ref={nameRef} value={form.name} onChange={set("name", "clientName")} required
                  autoComplete="name" placeholder="Ex. Koné Awa" className={inputClass} />
              </Field>
              <Field label="Numéro de téléphone (WhatsApp)" error={errors.clientPhone}
                hint="Avec l'indicatif pays. L'équipe MoveColis vous répond dans la messagerie.">
                <input value={form.phone} onChange={set("phone", "clientPhone")} type="tel" required
                  autoComplete="tel" placeholder="+225 07 00 00 00 00" className={inputClass} />
              </Field>
              <Field label="Adresse e-mail" error={errors.clientEmail} hint="Votre billet et votre reçu y seront envoyés.">
                <input value={form.email} onChange={set("email", "clientEmail")} type="email" required
                  autoComplete="email" placeholder="Ex. awa.kone@gmail.com" className={inputClass} />
              </Field>
              <Field label="Précisions (facultatif)" error={errors.note}>
                <textarea value={form.note} onChange={set("note", "note")} rows={2} maxLength={500}
                  placeholder="Ex. noms des passagers, préférence de siège…" className={inputClass} />
              </Field>

              {formError && <Notice tone="danger">{formError}</Notice>}

              <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
                <MessageCircle size={18} /> {submitting ? "Envoi…" : "Envoyer ma demande d'achat"}
              </button>

              <p className="text-[12.5px] text-muted text-center mt-2.5 flex gap-1.5 items-start">
                <Info size={15} className="shrink-0 mt-0.5" />
                <span>
                  Rien à payer maintenant. L'équipe MoveColis confirme le prix et le mode de paiement dans la messagerie,
                  puis vous envoie votre billet et votre reçu par e-mail.
                </span>
              </p>
              <p className="text-xs text-muted text-center mt-2">
                En envoyant votre demande, vous acceptez les{" "}
                <Link to="/cgu" className="font-bold underline">CGU</Link> et la{" "}
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
