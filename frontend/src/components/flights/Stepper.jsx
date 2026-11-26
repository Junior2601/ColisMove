import { Minus, Plus } from "lucide-react";

// Compteur − n + (passagers, valises, options à plusieurs exemplaires)
export default function Stepper({ label, hint, value, min, max, onChange }) {
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
