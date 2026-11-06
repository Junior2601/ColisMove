import { useEffect, useId, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { flightsApi } from "../../api/flights";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { inputClass } from "../ui";

/**
 * Champ ville avec suggestions (villes ayant un aéroport, via Aviasales).
 * value = { code: "MOW", name: "Moscou" } ou null ; onChange(ville | null).
 * Taper du texte annule la ville choisie : seule une ville de la liste est valide.
 */
export default function CityInput({ label, value, onChange, placeholder, error }) {
  const listId = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState({ term: "", items: [] }); // dernières suggestions reçues
  const items = found.items;
  const [active, setActive] = useState(0);
  const term = useDebouncedValue(text.trim(), 250);

  // Ville choisie ailleurs (inversion départ/arrivée, nom reçu avec les résultats…) : le texte suit
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (value) setText(value.name);
  }

  useEffect(() => {
    if (!open || term.length < 2) return undefined;
    let current = true;
    flightsApi
      .places(term)
      .then((result) => {
        if (!current) return;
        setFound({ term, items: result.items });
        setActive(0);
      })
      .catch(() => current && setFound({ term, items: [] }));
    return () => {
      current = false;
    };
  }, [term, open]);

  function choose(city) {
    onChange(city);
    setText(city.name);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const loading = open && text.trim().length >= 2 && found.term !== text.trim(); // suggestions en route
  const showList = open && term.length >= 2 && (items.length > 0 || !loading);

  return (
    <div className="relative flex-1 min-w-0">
      <label className="block text-[13px] font-bold mb-1.5">{label}</label>
      <div className="relative">
        <MapPin size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className={`${inputClass} pl-9! ${error ? "border-danger!" : ""}`}
        />
        {loading && <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" />}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white border border-line rounded-xl shadow-card overflow-hidden"
        >
          {items.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">Aucune ville avec aéroport ne correspond.</li>
          ) : (
            items.map((city, i) => (
              <li
                key={city.code}
                role="option"
                aria-selected={i === active}
                // mousedown (et non click) : sinon le champ perd le focus et la liste se ferme avant le choix
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(city);
                }}
                onMouseEnter={() => setActive(i)}
                className={`px-4 py-2.5 cursor-pointer flex justify-between gap-3 text-sm ${i === active ? "bg-surface" : ""}`}
              >
                <span className="font-semibold truncate">
                  {city.name}
                  {city.countryName && <span className="font-normal text-muted">, {city.countryName}</span>}
                </span>
                <span className="font-mono text-xs text-muted shrink-0 mt-0.5">{city.code}</span>
              </li>
            ))
          )}
        </ul>
      )}
      {error && <div role="alert" className="text-xs text-danger font-semibold mt-1.5">{error}</div>}
    </div>
  );
}
