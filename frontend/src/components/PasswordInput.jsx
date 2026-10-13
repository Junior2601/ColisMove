import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClass } from "./ui";

/**
 * Champ mot de passe avec bouton "afficher / masquer".
 * Accepte toutes les propriétés d'un <input> (value, onChange, autoComplete, minLength…).
 */
export default function PasswordInput({ className = "", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-12 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Garde le curseur dans le champ (sinon le clavier se ferme sur mobile)
        onMouseDown={(e) => e.preventDefault()}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        className="absolute inset-y-0 right-0 px-3.5 flex items-center text-muted hover:text-ink transition"
      >
        {visible ? <EyeOff size={19} /> : <Eye size={19} />}
      </button>
    </div>
  );
}
