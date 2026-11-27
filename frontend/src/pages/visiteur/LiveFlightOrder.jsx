import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowLeftRight, CheckCircle2, ClipboardPaste, Info, MessageCircle } from "lucide-react";
import Layout from "../../components/Layout";
import CityInput from "../../components/flights/CityInput";
import { PassengerFields } from "../../components/flights/Passengers";
import Stepper from "../../components/flights/Stepper";
import PhoneField from "../../components/PhoneField";
import { ErrorState, Field, Loader, Notice, btnPrimary, inputClass } from "../../components/ui";
import { flightsApi } from "../../api/flights";
import { errorMessage, fieldErrors } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { loadCountries } from "../../lib/countries";
import { saveGuestAccess } from "../../lib/guestAccess";
import { paths } from "../../lib/hashid";
import { EMPTY_PASSENGER, addDays, flightRouteLabel, passengerSlots, todayIso } from "../../lib/flights";
import { liveFlightsHref, parseFlightSearch, parseShareLink } from "../../lib/liveFlights";

const TRIP_TYPES = [
  { key: "ONE_WAY", label: "Aller simple" },
  { key: "ROUND_TRIP", label: "Aller-retour" },
];

// Départ proposé sans recherche : dans 2 semaines · retour 2 semaines après
const DEFAULT_DAYS_AHEAD = 14;

const canPaste = () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

// Encadré d'une étape du formulaire
function Card({ title, hint, children }) {
  return (
    <section className="border border-line rounded-2xl p-5 bg-white mb-4">
      <h2 className="text-[16px] font-extrabold">{title}</h2>
      {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Trajet, dates et passagers d'une recherche du widget ("MOW1112YAO1"), pour pré-remplir le formulaire
function tripFrom(search) {
  const date = search?.date ?? addDays(todayIso(), DEFAULT_DAYS_AHEAD);
  return {
    origin: search ? { code: search.origin, name: search.origin } : null,
    destination: search ? { code: search.destination, name: search.destination } : null,
    tripType: search?.returnDate ? "ROUND_TRIP" : "ONE_WAY",
    date,
    returnDate: search?.returnDate ?? addDays(date, DEFAULT_DAYS_AHEAD),
  };
}

/**
 * « Payer ce vol avec MoveColis » : le client décrit le vol trouvé dans la recherche en direct (lien « Partager »,
 * compagnie, heures, prix vu) et ses passagers. Une conversation s'ouvre : l'équipe retrouve le vol, confirme son
 * prix, puis le client paie en Mobile Money et reçoit son billet par e-mail.
 * Pré-rempli depuis l'adresse : ?flightSearch=MOW1112YAO1&ticketId=… (recherche en cours dans l'onglet « Billets d'avion »).
 */
export default function LiveFlightOrder() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: config, error: configError, reload: reloadConfig } = useApi(flightsApi.config, []);
  const { data: countries, error: countriesError, reload: reloadCountries } = useApi(loadCountries, []);

  const fromSearch = parseFlightSearch(params.get("flightSearch"));
  const [trip, setTrip] = useState(() => tripFrom(fromSearch));
  const [passengers, setPassengers] = useState(() => ({
    adults: fromSearch?.adults ?? 1,
    children: fromSearch?.children ?? 0,
    infants: Math.min(fromSearch?.infants ?? 0, fromSearch?.adults ?? 1),
  }));
  // Lien du billet partagé (ouvert depuis un lien « Partager » : déjà connu)
  const [flight, setFlight] = useState(() => {
    const shared = parseShareLink(`${window.location.origin}${liveFlightsHref(params.get("flightSearch"), params.get("ticketId"))}`);
    return {
      shareLink: shared?.ticketId ? `${window.location.origin}${liveFlightsHref(shared.search, shared.ticketId)}` : "",
      airline: "",
      departureTime: "",
      returnDepartureTime: "",
      seenPrice: "",
    };
  });
  const [linkStatus, setLinkStatus] = useState(null); // "ok" : trajet rempli d'après le lien · "invalid"
  // Infos de chaque passager par type : gardées si on change le nombre d'adultes, d'enfants ou de bébés
  const [travellers, setTravellers] = useState({ ADULT: [], CHILD: [], INFANT: [] });
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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

  // Villes reçues en code (recherche du widget) : on retrouve leur nom
  const originCode = trip.origin?.name === trip.origin?.code ? trip.origin?.code : null;
  const destinationCode = trip.destination?.name === trip.destination?.code ? trip.destination?.code : null;
  useEffect(() => {
    let active = true;
    for (const [key, code] of [["origin", originCode], ["destination", destinationCode]]) {
      if (!code) continue;
      flightsApi
        .places(code)
        .then(({ items }) => {
          const city = items.find((c) => c.code === code);
          if (active && city) setTrip((t) => (t[key]?.code === code ? { ...t, [key]: city } : t));
        })
        .catch(() => {}); // le code reste affiché : le client peut choisir la ville dans la liste
    }
    return () => {
      active = false;
    };
  }, [originCode, destinationCode]);

  const roundTrip = trip.tripType === "ROUND_TRIP";
  const firstDay = todayIso();
  const departureAt = `${trip.date || firstDay}T00:00`; // âge des passagers le jour du vol

  const clearError = (...keys) => setErrors((errs) => ({ ...errs, ...Object.fromEntries(keys.map((k) => [k, undefined])) }));
  const setTripValue = (key) => (value) => {
    setTrip((t) => ({ ...t, [key]: value }));
    clearError(key);
  };
  const setFlightValue = (key) => (e) => {
    setFlight((f) => ({ ...f, [key]: e.target.value }));
    clearError(key);
  };
  const setFormValue = (key, apiField) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(apiField);
  };
  const bindForm = (key, apiField) => (e) => setFormValue(key, apiField)(e.target.value);

  // Lien « Partager » collé : trajet, dates et passagers repris du billet
  function applyShareLink(value) {
    setFlight((f) => ({ ...f, shareLink: value }));
    clearError("shareLink");
    if (!value.trim()) {
      setLinkStatus(null);
      return;
    }
    const link = parseShareLink(value);
    const search = link && parseFlightSearch(link.search);
    if (!link) {
      setLinkStatus("invalid");
      return;
    }
    if (search) {
      setTrip((t) => ({ ...tripFrom(search), returnDate: search.returnDate ?? t.returnDate }));
      setPassengers({ adults: search.adults, children: search.children, infants: Math.min(search.infants, search.adults) });
    }
    setLinkStatus("ok");
  }

  async function pasteLink() {
    try {
      applyShareLink(await navigator.clipboard.readText());
    } catch {
      setLinkStatus("paste-denied");
    }
  }

  const passengerList = passengerSlots(passengers).map(([type, slot]) => ({
    ...EMPTY_PASSENGER,
    ...travellers[type][slot],
    type,
    slot,
  }));
  const setTraveller = (index, { type, slot }) => (field, value) => {
    setTravellers((t) => {
      const list = [...t[type]];
      list[slot] = { ...EMPTY_PASSENGER, ...list[slot], [field]: value };
      return { ...t, [type]: list };
    });
    clearError(`passengers.${index}.${field}`);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const missing = {
      ...(!trip.origin && { origin: "Choisissez la ville de départ dans la liste." }),
      ...(!trip.destination && { destination: "Choisissez la ville d'arrivée dans la liste." }),
    };
    if (Object.keys(missing).length) {
      setErrors(missing);
      setFormError("Vérifiez les champs signalés en rouge.");
      return;
    }
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const result = await flightsApi.createLiveOrder({
        origin: trip.origin.code,
        destination: trip.destination.code,
        date: trip.date,
        returnDate: roundTrip ? trip.returnDate : null,
        airline: flight.airline.trim(),
        departureTime: flight.departureTime || null,
        returnDepartureTime: roundTrip ? flight.returnDepartureTime || null : null,
        seenPrice: flight.seenPrice.trim() || null,
        shareLink: flight.shareLink.trim() || null,
        clientName: form.name.trim(),
        clientPhone: form.phone,
        clientEmail: form.email.trim(),
        note: form.note.trim() || null,
        ...passengers,
        passengers: passengerList.map(({ type, fullName, gender, birthDate, nationality, passportNumber }) => ({
          type, fullName: fullName.trim(), gender, birthDate, nationality, passportNumber: passportNumber.trim(),
        })),
      });
      const route = flightRouteLabel(trip.origin.name, trip.destination.name, roundTrip);
      // Visiteur : on garde sur cet appareil le jeton qui ouvre sa conversation
      if (result.guestToken) {
        saveGuestAccess({
          conversationId: result.conversationId,
          guestToken: result.guestToken,
          trackingCode: result.flightOrder.reference,
          route: `✈️ ${route}`,
          departureAt,
        });
      }
      navigate(paths.conversation(result.conversationId), {
        state: { justOrdered: { reference: result.flightOrder.reference } },
      });
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
      requestAnimationFrame(() => document.querySelector('form [role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" }));
      setSubmitting(false);
    }
  }

  const backLink = (
    <Link to={liveFlightsHref(params.get("flightSearch"), params.get("ticketId"))}
      className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
      <ArrowLeft size={16} /> Retour à la recherche
    </Link>
  );

  // Formulaire réservé aux clients et aux visiteurs ; la liste des pays sert aux passagers et au téléphone
  let blocker = null;
  if (configError) blocker = <ErrorState error={configError} onRetry={reloadConfig} />;
  else if (!config) blocker = <Loader />;
  else if (!config.enabled) {
    blocker = (
      <Notice tone="warn">
        L&apos;achat de billets par MoveColis n&apos;est pas disponible pour le moment. Réessayez un peu plus tard.
      </Notice>
    );
  } else if (user && user.role !== "CLIENT") {
    blocker = (
      <Notice tone="warn">
        Vous êtes connecté avec un compte administrateur ou voyageur : les billets s&apos;achètent avec un compte client ou sans compte.
      </Notice>
    );
  } else if (!countries) {
    blocker = countriesError ? <ErrorState error={countriesError} onRetry={reloadCountries} /> : <Loader />;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-8">
        {backLink}
        <h1 className="text-2xl font-extrabold mt-2">Payer ce vol avec MoveColis</h1>
        <p className="text-sm text-muted mt-1 mb-4">
          Paiement en Mobile Money. L&apos;équipe MoveColis retrouve votre vol, vous confirme son prix dans la messagerie,
          puis vous envoie votre billet par e-mail.
        </p>

        {blocker ?? (
          <form onSubmit={handleSubmit}>
            <Card title="Le vol choisi" hint="Tel qu'affiché dans la recherche de billets.">
              <Field
                label="Lien du billet (conseillé)"
                error={errors.shareLink}
                hint="Dans la recherche : « Sélectionner », puis « Partager » pour copier le lien, et collez-le ici. L'équipe retrouve ainsi exactement votre billet."
              >
                <div className="flex gap-2">
                  <input value={flight.shareLink} onChange={(e) => applyShareLink(e.target.value)} inputMode="url"
                    placeholder="https://movecolis.com/vols-en-direct?…" className={`${inputClass} min-w-0`} />
                  {canPaste() && (
                    <button type="button" onClick={pasteLink}
                      className="shrink-0 border border-line rounded-xl px-3 text-sm font-bold bg-white hover:border-ink transition inline-flex items-center gap-1.5">
                      <ClipboardPaste size={16} /> Coller
                    </button>
                  )}
                </div>
              </Field>
              {linkStatus === "ok" && (
                <p className="text-xs text-success font-semibold -mt-2 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 size={14} /> Lien reconnu : trajet, dates et passagers remplis d&apos;après le billet.
                </p>
              )}
              {linkStatus === "invalid" && !errors.shareLink && (
                <p className="text-xs text-danger font-semibold -mt-2 mb-3">
                  Ce n&apos;est pas un lien copié avec « Partager » dans la recherche de billets de MoveColis.
                </p>
              )}
              {linkStatus === "paste-denied" && (
                <p className="text-xs text-muted -mt-2 mb-3">Collez le lien dans le champ (appui long, puis « Coller »).</p>
              )}

              <div role="radiogroup" aria-label="Type de billet" className="inline-flex rounded-full bg-surface p-1 mb-3">
                {TRIP_TYPES.map((type) => (
                  <button key={type.key} type="button" role="radio" aria-checked={trip.tripType === type.key}
                    onClick={() => setTrip((t) => ({ ...t, tripType: type.key }))}
                    className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
                      trip.tripType === type.key ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink"
                    }`}>
                    {type.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 mb-3">
                <CityInput label="Départ" value={trip.origin} onChange={setTripValue("origin")} placeholder="Ex. Moscou" error={errors.origin} />
                <button type="button" aria-label="Inverser départ et arrivée"
                  onClick={() => setTrip((t) => ({ ...t, origin: t.destination, destination: t.origin }))}
                  className="self-center sm:mt-7 w-9 h-9 shrink-0 rounded-full border border-line bg-white flex items-center justify-center hover:border-ink transition rotate-90 sm:rotate-0">
                  <ArrowLeftRight size={16} />
                </button>
                <CityInput label="Arrivée" value={trip.destination} onChange={setTripValue("destination")} placeholder="Ex. Yaoundé" error={errors.destination} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={roundTrip ? "Aller le" : "Date de départ"} error={errors.date}>
                  <input type="date" value={trip.date} min={firstDay} required
                    onChange={(e) => {
                      const date = e.target.value;
                      setTrip((t) => ({ ...t, date, returnDate: date && t.returnDate < date ? addDays(date, DEFAULT_DAYS_AHEAD) : t.returnDate }));
                      clearError("date", "returnDate");
                    }}
                    className={inputClass} />
                </Field>
                <Field label="Heure de départ" hint="Facultatif." error={errors.departureTime}>
                  <input type="time" value={flight.departureTime} onChange={setFlightValue("departureTime")} className={inputClass} />
                </Field>
                {roundTrip && (
                  <>
                    <Field label="Retour le" error={errors.returnDate}>
                      <input type="date" value={trip.returnDate} min={trip.date || firstDay} required
                        onChange={(e) => setTripValue("returnDate")(e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Heure du retour" hint="Facultatif." error={errors.returnDepartureTime}>
                      <input type="time" value={flight.returnDepartureTime} onChange={setFlightValue("returnDepartureTime")} className={inputClass} />
                    </Field>
                  </>
                )}
              </div>

              <Field label="Compagnie" error={errors.airline}>
                <input value={flight.airline} onChange={setFlightValue("airline")} required maxLength={80}
                  placeholder="Ex. Ethiopian Airlines" className={inputClass} />
              </Field>
              <Field label="Prix affiché (facultatif)" error={errors.seenPrice} hint="Tel que vu dans la recherche, ex. 479 277 Fr.">
                <input value={flight.seenPrice} onChange={setFlightValue("seenPrice")} maxLength={40} placeholder="Ex. 479 277 Fr"
                  className={inputClass} />
              </Field>
            </Card>

            <Card title="Passagers" hint="Les informations de chaque passeport, pour émettre les billets.">
              <div className="border-b border-line-light pb-2 mb-3">
                <Stepper label="Adultes" hint="12 ans et plus" value={passengers.adults} min={1}
                  max={config.maxPassengers - passengers.children - passengers.infants}
                  onChange={(adults) => setPassengers((p) => ({ ...p, adults, infants: Math.min(p.infants, adults) }))} />
                <Stepper label="Enfants" hint="2 à 11 ans" value={passengers.children} min={0}
                  max={config.maxPassengers - passengers.adults - passengers.infants}
                  onChange={(children) => setPassengers((p) => ({ ...p, children }))} />
                <Stepper label="Bébés" hint="Moins de 2 ans, sur les genoux" value={passengers.infants} min={0}
                  max={Math.min(passengers.adults, config.maxPassengers - passengers.adults - passengers.children)}
                  onChange={(infants) => setPassengers((p) => ({ ...p, infants }))} />
              </div>
              {passengerList.map((passenger, index) => (
                <PassengerFields key={`${passenger.type}-${passenger.slot}`} index={index} passenger={passenger}
                  departureAt={departureAt} countries={countries} errors={errors}
                  onChange={setTraveller(index, passenger)} />
              ))}
            </Card>

            <Card title="Vos coordonnées">
              <Field label="Votre nom complet" error={errors.clientName}>
                <input value={form.name} onChange={bindForm("name", "clientName")} required autoComplete="name"
                  placeholder="Ex. Koné Awa" className={inputClass} />
              </Field>
              <Field label="Numéro de téléphone (WhatsApp)" error={errors.clientPhone}
                hint="Choisissez l'indicatif du pays. L'équipe MoveColis vous répond dans la messagerie.">
                <PhoneField value={form.phone} onChange={setFormValue("phone", "clientPhone")} required />
              </Field>
              <Field label="Adresse e-mail" error={errors.clientEmail} hint="Votre billet et votre reçu y seront envoyés.">
                <input value={form.email} onChange={bindForm("email", "clientEmail")} type="email" required
                  autoComplete="email" placeholder="Ex. awa.kone@gmail.com" className={inputClass} />
              </Field>
              <Field label="Précisions (facultatif)" error={errors.note}>
                <textarea value={form.note} onChange={bindForm("note", "note")} rows={2} maxLength={500}
                  placeholder="Ex. escale à Addis Abeba, bagage en soute, préférence de siège…" className={inputClass} />
              </Field>

              {formError && <Notice tone="danger">{formError}</Notice>}

              <button type="submit" disabled={submitting} className={`${btnPrimary} w-full`}>
                <MessageCircle size={18} /> {submitting ? "Envoi…" : "Envoyer ma demande"}
              </button>
              <p className="text-[12.5px] text-muted text-center mt-2.5 flex gap-1.5 items-start">
                <Info size={15} className="shrink-0 mt-0.5" />
                <span>
                  Rien à payer maintenant. L&apos;équipe MoveColis vous confirme le vol et son prix dans la messagerie, puis
                  vous envoie le numéro de paiement.
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
            </Card>
          </form>
        )}
      </div>
    </Layout>
  );
}
