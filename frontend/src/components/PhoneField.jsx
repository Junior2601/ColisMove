import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { inputClass } from "./ui";
import { useApi } from "../hooks/useApi";
import { DEFAULT_PHONE_COUNTRY, joinPhone, loadCountries, splitPhone } from "../lib/countries";

/**
 * Téléphone avec choix de l'indicatif : [🇨🇮 +225 ▾] [07 00 00 00 00]
 *   <PhoneField value={form.phone} onChange={(phone) => …} required />
 * value / onChange : numéro complet en texte ("+225 07 00 00 00 00", "" si vide), comme un champ classique.
 * Un numéro fixé par le parent (pré-remplissage depuis le compte) est découpé en indicatif + numéro.
 * L'indicatif est un vrai <select> (recherche au clavier, liste native sur mobile) posé, invisible, sur son affichage.
 * Liste des pays indisponible : simple champ où l'on tape le numéro avec l'indicatif.
 */
export default function PhoneField({ value, onChange, placeholder = "07 00 00 00 00", ...inputProps }) {
  const { data: countries } = useApi(loadCountries, []);
  const withDialCode = useMemo(() => (countries ?? []).filter((c) => c.dialCode), [countries]);
  const [parts, setParts] = useState({ country: DEFAULT_PHONE_COUNTRY, number: "" });
  const [syncedValue, setSyncedValue] = useState(null); // valeur qui correspond à `parts`

  // Valeur changée par le parent (ou saisie avant le chargement des pays) : on retrouve indicatif et numéro
  if (countries && value !== syncedValue) {
    setSyncedValue(value);
    setParts((p) => (value ? splitPhone(value, countries) ?? { ...p, number: value } : { ...p, number: "" }));
  }

  if (!countries) {
    return (
      <input type="tel" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="tel"
        placeholder="+225 07 00 00 00 00" className={inputClass} {...inputProps} />
    );
  }

  const update = (next) => {
    const phone = joinPhone(next, countries);
    // Numéro tapé ou collé avec son indicatif (+33 6…) : le sélecteur passe sur ce pays
    const withCode = /^(\+|00)/.test(next.number.trim()) && splitPhone(phone, countries);
    setParts(withCode || next);
    setSyncedValue(phone);
    onChange(phone);
  };
  const selected = withDialCode.find((c) => c.code === parts.country);

  return (
    <div className="flex gap-2">
      <div className="relative shrink-0">
        <select
          aria-label="Indicatif du pays"
          value={parts.country}
          onChange={(e) => update({ ...parts, country: e.target.value })}
          className="peer absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer"
        >
          {withDialCode.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} (+{c.dialCode})
            </option>
          ))}
        </select>
        <div
          aria-hidden="true"
          className={`${inputClass} w-auto! flex items-center gap-1.5 pr-8 whitespace-nowrap peer-focus-visible:border-ink peer-focus-visible:ring-1 peer-focus-visible:ring-ink`}
        >
          {selected ? (
            <>
              <span>{selected.flag}</span> +{selected.dialCode}
            </>
          ) : (
            "Indicatif"
          )}
          <ChevronDown size={16} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      </div>
      <input
        type="tel"
        value={parts.number}
        onChange={(e) => update({ ...parts, number: e.target.value })}
        autoComplete="tel-national"
        placeholder={placeholder}
        className={`${inputClass} min-w-0`}
        {...inputProps}
      />
    </div>
  );
}
