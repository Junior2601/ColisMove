import { useEffect } from "react";
import { CircleCheck, Info, LoaderCircle, RotateCw, TriangleAlert, X } from "lucide-react";

/* ===== Champ de formulaire avec label + texte d'aide (remplacé par l'erreur s'il y en a une) ===== */
export function Field({ label, hint, error, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[13px] font-bold mb-1.5">{label}</label>
      {children}
      {error ? (
        <div role="alert" className="text-xs text-danger font-semibold mt-1.5">{error}</div>
      ) : (
        hint && <div className="text-xs text-muted mt-1.5">{hint}</div>
      )}
    </div>
  );
}

export const inputClass =
  "w-full border border-line rounded-lg px-3.5 py-3 outline-none bg-white transition focus:border-ink focus:ring-1 focus:ring-ink";

/* ===== Styles de boutons ===== */
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-bold text-[15px] px-5 py-3 active:scale-[.98] transition disabled:opacity-50 disabled:pointer-events-none";
export const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary-dark`;
export const btnOutline = `${btnBase} bg-white text-ink border border-ink hover:bg-surface`;
export const btnWhatsApp = `${btnBase} bg-whatsapp text-white hover:bg-whatsapp-dark`;
export const btnDanger = `${btnBase} bg-white text-danger border border-danger hover:bg-[#FDECEA]`;
// Variante compacte, à combiner : `${btnPrimary} ${btnSm}`
export const btnSm = "px-3.5! py-2! text-[13px]!";

/* ===== Bannière : info (bleue), warn (jaune), success (verte), danger (rouge) ===== */
const NOTICE_STYLES = {
  info: { className: "bg-[#F0F7FF] text-[#1565C0]", Icon: Info },
  warn: { className: "bg-[#FFF8E1] text-[#8D6E00]", Icon: TriangleAlert },
  success: { className: "bg-[#E8F5E9] text-success", Icon: CircleCheck },
  danger: { className: "bg-[#FDECEA] text-danger", Icon: TriangleAlert },
};

export function Notice({ tone = "info", children }) {
  const { className, Icon } = NOTICE_STYLES[tone] ?? NOTICE_STYLES.info;
  return (
    <div className={`rounded-xl px-4 py-3.5 text-[13.5px] flex gap-2.5 items-start my-3.5 ${className}`}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

/* ===== Chargement ===== */
export function Loader({ label = "Chargement…", className = "" }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 text-muted text-sm py-10 ${className}`}>
      <LoaderCircle size={18} className="animate-spin" /> {label}
    </div>
  );
}

/* ===== Erreur (avec bouton "Réessayer" optionnel) ===== */
export function ErrorState({ error, message, onRetry }) {
  return (
    <div className="rounded-xl bg-[#FDECEA] text-danger px-4 py-3.5 text-[13.5px] flex gap-2.5 items-start my-3.5">
      <TriangleAlert size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1">{message ?? error?.message ?? "Une erreur est survenue."}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 inline-flex items-center gap-1 font-bold underline">
          <RotateCw size={14} /> Réessayer
        </button>
      )}
    </div>
  );
}

/* ===== Toast de confirmation (au-dessus de la nav basse) — à utiliser avec useFlash() ===== */
export function Toast({ flash }) {
  if (!flash) return null;
  const danger = flash.tone === "danger";
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 lg:bottom-6 z-[55] flex justify-center px-5 pointer-events-none"
    >
      <div
        key={flash.id}
        className={`pointer-events-auto rounded-xl px-4 py-3 text-[13.5px] font-semibold shadow-card flex items-center gap-2 text-white ${
          danger ? "bg-danger" : "bg-ink"
        }`}
      >
        {danger ? <TriangleAlert size={17} /> : <CircleCheck size={17} />}
        {flash.text}
      </div>
    </div>
  );
}

/* ===== Filtres en pastilles (ligne défilante horizontalement) ===== */
export function ChipRow({ children }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

export function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition ${
        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ===== Bouton "Voir plus" des listes paginées ===== */
export function LoadMore({ hasMore, loading, onClick }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pb-8">
      <button type="button" onClick={onClick} disabled={loading} className={`${btnOutline} ${btnSm}`}>
        {loading && <LoaderCircle size={15} className="animate-spin" />} Voir plus
      </button>
    </div>
  );
}

/* ===== Fenêtre modale (feuille en bas sur mobile, centrée sur desktop) ===== */
export function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    const previousOverflow = document.body.style.overflow;
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden"; // bloque le défilement de la page derrière
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center gap-3 mb-3">
          <h2 className="text-[17px] font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!onClose}
            aria-label="Fermer"
            className="p-1.5 rounded-full hover:bg-surface disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ===== Badge de statut ===== */
const BADGE_STYLES = {
  success: "bg-[#E8F5E9] text-success", // Livré / Confirmé / Actif
  pending: "bg-[#FFF3E0] text-[#B26A00]", // À confirmer / En attente
  info: "bg-[#E3F2FD] text-[#1565C0]", // En transit / Publié
  danger: "bg-[#FDECEA] text-danger", // Annulé / Refusé
};

export function Badge({ tone = "info", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${BADGE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ===== Carte de statistique ===== */
export function StatCard({ label, value, trend, trendDown = false }) {
  return (
    <div className="border border-line-light rounded-xl p-4 bg-white shadow-card">
      <div className="text-xs text-muted font-semibold">{label}</div>
      <div className="text-2xl font-extrabold tracking-tight mt-0.5">{value}</div>
      {trend && (
        <div className={`text-xs font-bold mt-0.5 ${trendDown ? "text-danger" : "text-success"}`}>{trend}</div>
      )}
    </div>
  );
}

/* ===== Barre de progression (remplissage, stats) ===== */
export function BarRow({ label, value, percent, color = "bg-primary" }) {
  const width = Math.min(100, Math.max(0, percent || 0));
  return (
    <div className="flex items-center gap-2.5 mb-2.5 last:mb-0 text-[13px]">
      <span className="min-w-24 font-semibold">{label}</span>
      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="min-w-10 text-right text-muted font-bold text-xs">{value}</span>
    </div>
  );
}
