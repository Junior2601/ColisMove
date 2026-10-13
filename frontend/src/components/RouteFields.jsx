import { POPULAR_CITIES } from "../config/cities";
import { inputClass } from "./ui";

/** Liste de villes suggérées, à utiliser une seule fois par page (attribut list="movecolis-cities") */
export function CitySuggestions() {
  return (
    <datalist id="movecolis-cities">
      {POPULAR_CITIES.map((city) => (
        <option key={city} value={city} />
      ))}
    </datalist>
  );
}

/** Deux champs "D'où ?" (facultatif) / "Vers où ?" (obligatoire) avec suggestions de villes */
export default function RouteFields({ value, onChange, autoFocus = false }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        value={value.departureCity}
        onChange={set("departureCity")}
        list="movecolis-cities"
        placeholder="De (facultatif)"
        aria-label="Ville de départ (facultatif)"
        className={inputClass}
      />
      <input
        value={value.arrivalCity}
        onChange={set("arrivalCity")}
        list="movecolis-cities"
        placeholder="Vers (ex. Abidjan)"
        aria-label="Ville de destination"
        autoFocus={autoFocus}
        className={inputClass}
      />
    </div>
  );
}
