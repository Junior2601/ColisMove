import { useState } from "react";
import { airlineLogoUrl } from "../../lib/flights";

// Logo de la compagnie ; à défaut (logo introuvable), son code dans une pastille
export default function AirlineLogo({ code, name, className = "h-6" }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-surface text-xs font-extrabold font-mono">
        {code}
      </span>
    );
  }
  return <img src={airlineLogoUrl(code)} alt={name} className={`${className} w-auto max-w-28 object-contain`} onError={() => setFailed(true)} />;
}
