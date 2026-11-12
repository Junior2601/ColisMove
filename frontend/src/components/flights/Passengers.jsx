import { Field, inputClass } from "../ui";
import { PASSENGER_TYPE_LABELS, birthDateLimits, formatBirthDate } from "../../lib/flights";

const GENDERS = [
  { value: "M", label: "Masculin" },
  { value: "F", label: "Féminin" },
];

/**
 * Formulaire d'un passager, tel qu'écrit sur son passeport (page d'un billet).
 * errors : erreurs du serveur, clés "passengers.<index>.<champ>"
 */
export function PassengerFields({ index, passenger, departureAt, countries, errors, onChange }) {
  const error = (field) => errors[`passengers.${index}.${field}`];
  const set = (field) => (e) => onChange(field, e.target.value);
  const birth = birthDateLimits(passenger.type, departureAt);

  return (
    <fieldset className="border border-line-light rounded-xl px-3.5 pt-1 pb-0 mb-3">
      <legend className="text-[13px] font-extrabold px-1.5">
        Passager {index + 1} · {PASSENGER_TYPE_LABELS[passenger.type]}
      </legend>

      <Field label="Nom et prénoms" hint="Exactement comme sur le passeport." error={error("fullName")}>
        <input value={passenger.fullName} onChange={set("fullName")} required maxLength={120}
          autoComplete={index === 0 ? "name" : "off"} placeholder="Ex. KONÉ Awa Mariam" className={inputClass} />
      </Field>

      <Field label="Genre" error={error("gender")}>
        <div role="radiogroup" aria-label={`Genre du passager ${index + 1}`} className="grid grid-cols-2 gap-2">
          {GENDERS.map((gender) => (
            <label key={gender.value}
              className={`relative border rounded-lg py-2.5 text-center text-sm font-bold cursor-pointer transition has-focus-visible:ring-1 has-focus-visible:ring-ink ${
                passenger.gender === gender.value ? "border-ink bg-surface" : "border-line bg-white hover:border-ink"
              }`}>
              <input type="radio" name={`passenger-${index}-gender`} value={gender.value} required
                checked={passenger.gender === gender.value} onChange={set("gender")}
                className="absolute inset-0 opacity-0 cursor-pointer" />
              {gender.value} <span className="font-normal text-muted">({gender.label})</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Date de naissance" hint={birth.hint} error={error("birthDate")}>
        <input type="date" value={passenger.birthDate} onChange={set("birthDate")} required
          min={birth.min} max={birth.max} className={inputClass} />
      </Field>

      <Field label="Pays (nationalité)" error={error("nationality")}>
        <select value={passenger.nationality} onChange={set("nationality")} required className={inputClass}>
          <option value="">Choisir un pays</option>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>{country.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Numéro de passeport" error={error("passportNumber")}>
        <input value={passenger.passportNumber} onChange={(e) => onChange("passportNumber", e.target.value.toUpperCase())}
          required minLength={5} maxLength={20} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          placeholder="Ex. 20AB12345" className={`${inputClass} font-mono`} />
      </Field>
    </fieldset>
  );
}

/** Passagers d'une demande (admin, conversation) : "👤 KONÉ Awa · Adulte · F · né(e) le 12/03/1990 · Côte d'Ivoire · passeport 20AB12345" */
export function PassengerList({ passengers }) {
  if (!passengers?.length) return null;
  return (
    <ul className="text-[13px] text-muted flex flex-col gap-0.5">
      {passengers.map((p, i) => (
        <li key={`${i}-${p.passportNumber}`}>
          👤 <b className="text-ink">{p.fullName}</b> · {PASSENGER_TYPE_LABELS[p.type]} · {p.gender} · né(e) le{" "}
          {formatBirthDate(p.birthDate)} · {p.nationalityName ?? p.nationality} · passeport{" "}
          <span className="font-mono text-ink">{p.passportNumber}</span>
        </li>
      ))}
    </ul>
  );
}
