import { useState } from "react";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import { ErrorState, Field, Notice, Toast, btnDanger, btnOutline, btnPrimary, btnSm, inputClass } from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage, fieldErrors } from "../../api/client";
import { useFlash } from "../../hooks/useFlash";
import { currencySymbol, formatMoney, formatNumber } from "../../lib/format";

const SOURCE_CURRENCIES = ["EUR", "RUB", "USD"];

// Réglages numériques : valeur du formulaire (texte) ↔ nombre envoyé à l'API
const NUMBER_FIELDS = [
  "exchangeRate", "childPercent", "infantPercent",
  "defaultCheckedBags", "defaultCabinKg", "checkedBagKg", "bagRefund", "cacheHours", "minHoursBeforeDeparture",
];
const toNumber = (value) => Number(String(value).replace(",", ".").replace(/\s/g, ""));

function toForm(settings) {
  return {
    enabled: settings.enabled,
    sourceCurrency: settings.sourceCurrency,
    currency: settings.currency,
    ...Object.fromEntries(NUMBER_FIELDS.map((key) => [key, String(settings[key])])),
  };
}

// Décimales de la devise : XOF → 0, EUR → 2 (même règle que le serveur)
function currencyDecimals(currency) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

// Même calcul que le serveur : prix Aviasales simplement converti (sans marge ni frais)
function examplePrice(form, sourcePrice) {
  const currency = form.currency.trim().toUpperCase();
  const rate = form.sourceCurrency === currency ? 1 : toNumber(form.exchangeRate);
  const factor = 10 ** currencyDecimals(currency);
  const price = Math.round(sourcePrice * rate * factor) / factor;
  return Number.isFinite(price) && price > 0 ? price : null;
}

function Section({ title, children }) {
  return (
    <fieldset className="border-t border-line-light pt-4 mt-4 first:border-0 first:pt-0 first:mt-0">
      <legend className="text-[15px] font-extrabold mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

/* ===== Une option proposée au client (bagage en plus, billet modifiable…) ===== */
function OptionEditor({ option, currency, onSaved, onDeleted, onCancel }) {
  const isNew = !option.id;
  const [form, setForm] = useState({
    label: option.label ?? "",
    description: option.description ?? "",
    price: String(option.price ?? ""),
    unit: option.unit ?? "BOOKING",
    maxQuantity: String(option.maxQuantity ?? 1),
    active: option.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const dirty =
    isNew ||
    form.label !== option.label ||
    form.description !== (option.description ?? "") ||
    toNumber(form.price) !== option.price ||
    form.unit !== option.unit ||
    toNumber(form.maxQuantity) !== option.maxQuantity ||
    form.active !== option.active;

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      label: form.label.trim(),
      description: form.description.trim() || null,
      price: toNumber(form.price),
      unit: form.unit,
      maxQuantity: toNumber(form.maxQuantity),
      active: form.active,
    };
    try {
      const saved = isNew ? await adminApi.createFlightOption(payload) : await adminApi.updateFlightOption(option.id, payload);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer l'option « ${option.label} » ? Les demandes déjà envoyées la gardent.`)) return;
    setSaving(true);
    try {
      await adminApi.deleteFlightOption(option.id);
      onDeleted(option.id);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className={`border border-line-light rounded-xl p-3.5 ${form.active ? "bg-white" : "bg-surface"}`}>
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Field label="Nom de l'option">
          <input value={form.label} onChange={set("label")} maxLength={80} placeholder="Ex. Bagage en soute supplémentaire" className={inputClass} />
        </Field>
        <Field label="Description (facultatif)">
          <input value={form.description} onChange={set("description")} maxLength={255} placeholder="Ex. Valise de 23 kg" className={inputClass} />
        </Field>
        <Field label={`Prix (${currencySymbol(currency)})`}>
          <input value={form.price} onChange={set("price")} inputMode="decimal" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix compté">
            <select value={form.unit} onChange={set("unit")} className={inputClass}>
              <option value="BOOKING">par demande</option>
              <option value="PASSENGER">par passager</option>
            </select>
          </Field>
          <Field label="Quantité max." hint="1 = case à cocher">
            <input value={form.maxQuantity} onChange={set("maxQuantity")} inputMode="numeric" className={inputClass} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={set("active")} className="w-4 h-4 accent-primary" />
          Proposée aux clients
        </label>
        <div className="flex gap-2">
          {isNew ? (
            <button type="button" onClick={onCancel} disabled={saving} className={`${btnOutline} ${btnSm}`}>Annuler</button>
          ) : (
            <button type="button" onClick={remove} disabled={saving} className={`${btnDanger} ${btnSm}`} aria-label={`Supprimer ${option.label}`}>
              <Trash2 size={14} />
            </button>
          )}
          <button type="button" onClick={save} disabled={saving || !dirty || !form.label.trim()} className={`${btnPrimary} ${btnSm}`}>
            <Save size={14} /> {saving ? "…" : isNew ? "Ajouter" : "Enregistrer"}
          </button>
        </div>
      </div>
      {error && <ErrorState message={error} />}
    </div>
  );
}

/* ===== Onglet « Réglages » ===== */
export default function FlightRulesAdmin({ data, onSaved }) {
  const [form, setForm] = useState(() => toForm(data.settings));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // Les options vivent dans les données de la page : elles restent à jour d'un onglet à l'autre
  const options = data.options;
  const setOptions = (update) => onSaved((d) => ({ ...d, options: update(d.options) }));
  const [adding, setAdding] = useState(false);
  const [flash, showFlash] = useFlash();

  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };
  const symbol = currencySymbol(form.currency || data.settings.currency);
  const sourceSymbol = currencySymbol(form.sourceCurrency);
  const sampleSource = form.sourceCurrency === "RUB" ? 40000 : 400;
  const sample = examplePrice(form, sampleSource);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        enabled: form.enabled,
        sourceCurrency: form.sourceCurrency,
        currency: form.currency.trim().toUpperCase(),
        ...Object.fromEntries(NUMBER_FIELDS.map((key) => [key, toNumber(form[key])])),
      };
      const updated = await adminApi.updateFlightSettings(payload);
      onSaved(updated);
      setForm(toForm(updated.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setErrors(fieldErrors(err));
      setSaveError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Champ numérique avec son libellé, son aide et son erreur
  const numberField = (key, label, hint) => (
    <Field label={label} hint={hint} error={errors[key]}>
      <input value={form[key]} onChange={set(key)} inputMode="decimal" className={inputClass} />
    </Field>
  );

  return (
    <>
      <form onSubmit={handleSave} className="border border-line rounded-2xl p-5 bg-white">
        <Section title="Vente de billets">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={set("enabled")} className="w-5 h-5 mt-0.5 accent-primary" />
            <span>
              <span className="block text-sm font-bold">Afficher l&apos;onglet « Billets d&apos;avion » sur l&apos;accueil</span>
              <span className="block text-xs text-muted">Désactivé : les clients ne voient ni la recherche ni les billets.</span>
            </span>
          </label>
          {form.enabled && !data.apiConfigured && (
            <Notice tone="warn">
              La clé API Aviasales (TRAVELPAYOUTS_TOKEN) n&apos;est pas configurée sur le serveur : l&apos;onglet restera
              caché tant qu&apos;elle manque.
            </Notice>
          )}
        </Section>

        <Section title="Prix">
          <p className="text-xs text-muted -mt-1 mb-3">
            Les clients voient le prix exact d&apos;Aviasales, simplement converti dans la devise affichée, sans marge
            ni frais.
          </p>
          <div className="grid sm:grid-cols-3 gap-x-3">
            <Field label="Devise des prix Aviasales" hint="Changer de devise redemande tous les prix." error={errors.sourceCurrency}>
              <select value={form.sourceCurrency} onChange={set("sourceCurrency")} className={inputClass}>
                {SOURCE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Devise affichée aux clients" hint="Code sur 3 lettres : XOF, XAF, RUB…" error={errors.currency}>
              <input value={form.currency} onChange={set("currency")} maxLength={3} className={`${inputClass} uppercase`} />
            </Field>
            {numberField("exchangeRate", `Taux : 1 ${form.sourceCurrency} =`, `en ${form.currency || "devise affichée"}`)}
          </div>
          {sample !== null && (
            <div className="bg-surface rounded-xl px-4 py-3 text-sm mb-1">
              Exemple : un billet à <b>{formatNumber(sampleSource)} {sourceSymbol}</b> sur Aviasales sera affiché{" "}
              <b>{formatMoney(sample, form.currency || data.settings.currency)}</b> par adulte.
            </div>
          )}
        </Section>

        <Section title="Enfants et bébés">
          <div className="grid grid-cols-2 gap-x-3">
            {numberField("childPercent", "Enfant 2-11 ans (% du prix adulte)")}
            {numberField("infantPercent", "Bébé < 2 ans (% du prix adulte)")}
          </div>
        </Section>

        <Section title="Bagages si Aviasales ne les précise pas">
          <p className="text-xs text-muted -mt-1 mb-3">
            Aviasales indique les bagages de chaque billet (nombre de valises, poids, bagage cabine) : ce sont eux que
            voient les clients. Ces valeurs ne servent que s&apos;il manque une information, par exemple le poids des
            valises.
          </p>
          <div className="grid grid-cols-3 gap-x-3">
            {numberField("defaultCheckedBags", "Valises en soute par passager")}
            {numberField("checkedBagKg", "Poids d'une valise (kg)")}
            {numberField("defaultCabinKg", "Bagage cabine (kg)")}
          </div>
        </Section>

        <Section title="Valises retirées par le client">
          <p className="text-xs text-muted -mt-1 mb-3">
            Le client peut garder moins de valises que celles incluses : chaque valise retirée baisse le prix de son
            billet, et ses kilos apparaissent dans l&apos;onglet « Kilos disponibles », prêts à être publiés.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-3">
            {numberField("bagRefund", `Réduction par valise retirée (${symbol})`, "0 = le client ne peut pas retirer de valise")}
          </div>
        </Section>

        <Section title="Recherche">
          <div className="grid grid-cols-2 gap-x-3">
            {numberField("cacheHours", "Prix redemandés à Aviasales toutes les (heures)", "Entre 1 et 72")}
            {numberField("minHoursBeforeDeparture", "Départ au plus tôt dans (heures)", "Le temps d'encaisser et d'acheter le billet")}
          </div>
        </Section>

        {saveError && <ErrorState message={saveError} />}
        <button type="submit" disabled={saving} className={`${btnPrimary} w-full mt-2`}>
          {saved ? <><Check size={18} /> Réglages enregistrés</> : <><Save size={18} /> {saving ? "Enregistrement…" : "Enregistrer les réglages"}</>}
        </button>
      </form>

      {/* ===== Options ===== */}
      <div className="border border-line rounded-2xl p-5 bg-white mt-5 mb-8">
        <h2 className="text-[15px] font-extrabold mb-1">Options proposées aux clients</h2>
        <p className="text-xs text-muted mb-4">
          Le client les ajoute à son billet et le total se met à jour. « Par passager » : prix multiplié par le nombre
          de passagers (bébés compris).
        </p>
        <div className="flex flex-col gap-3">
          {options.map((option) => (
            <OptionEditor
              key={option.id}
              option={option}
              currency={data.settings.currency}
              onSaved={(saved) => {
                setOptions((list) => list.map((o) => (o.id === saved.id ? saved : o)));
                showFlash("Option enregistrée.");
              }}
              onDeleted={(id) => {
                setOptions((list) => list.filter((o) => o.id !== id));
                showFlash("Option supprimée.");
              }}
            />
          ))}
          {adding ? (
            <OptionEditor
              option={{}}
              currency={data.settings.currency}
              onCancel={() => setAdding(false)}
              onSaved={(saved) => {
                setOptions((list) => [...list, saved]);
                setAdding(false);
                showFlash("Option ajoutée.");
              }}
            />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className={`${btnOutline} ${btnSm} self-start`}>
              <Plus size={15} /> Ajouter une option
            </button>
          )}
        </div>
      </div>
      <Toast flash={flash} />
    </>
  );
}
