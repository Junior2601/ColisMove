import { useEffect, useRef, useState } from "react";
import { CalendarClock, Megaphone, Pencil, Send, Users, X } from "lucide-react";
import Layout from "../../components/Layout";
import { CitySuggestions } from "../../components/RouteFields";
import {
  Badge, ErrorState, Field, Loader, Notice, StatCard, Toast, btnOutline, btnPrimary, btnSm, inputClass,
} from "../../components/ui";
import { adminApi } from "../../api/admin";
import { errorMessage, fieldErrors } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFlash } from "../../hooks/useFlash";
import { PREPARATION_WINDOW, SEASONAL_MOMENTS } from "../../config/seasonalMoments";
import { formatDayMonth, formatNumber } from "../../lib/format";

const AUDIENCES = { CLIENTS: "Clients", VOYAGEURS: "Voyageurs", ALL: "Clients et voyageurs" };

const KIND_LABELS = {
  ROUTE_ALERT: "Alertes trajets",
  DEPARTURE_SOON: "Départs imminents",
  WEEKLY_DIGEST: "Sélection de la semaine",
  CAMPAIGN: "Campagnes",
};

const STATUS = {
  DRAFT: { tone: "info", label: "Brouillon" },
  SCHEDULED: { tone: "pending", label: "Programmée" },
  SENDING: { tone: "pending", label: "En cours d'envoi" },
  SENT: { tone: "success", label: "Envoyée" },
  CANCELLED: { tone: "danger", label: "Annulée" },
};

const DAY = 86400000;
const startOfToday = () => new Date(new Date().toDateString()).getTime();
const percent = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// "2026-12-20" → fenêtre d'envoi recommandée (3 à 2 semaines avant)
function momentWindow(moment) {
  const date = new Date(`${moment.date}T00:00:00`).getTime();
  return {
    date,
    start: date - PREPARATION_WINDOW.startDaysBefore * DAY,
    end: date - PREPARATION_WINDOW.endDaysBefore * DAY,
  };
}

function momentStatus(moment) {
  const today = startOfToday();
  const { date, start, end } = momentWindow(moment);
  if (today < start) return { tone: "info", label: `Dans ${Math.round((start - today) / DAY)} j` };
  if (today <= end) return { tone: "success", label: "C'est le moment" };
  if (today < date) return { tone: "pending", label: "Encore possible" };
  return null; // passé
}

// Date pour <input type="datetime-local"> (heure du navigateur) ↔ ISO pour l'API
const toInputDate = (date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const EMPTY_FORM = {
  id: null,
  moment: "",
  title: "",
  body: "",
  audience: "CLIENTS",
  destinationCity: "",
  linkPreset: "home",
  customLink: "",
  scheduledAt: "",
};

// Lien ouvert au clic sur la notification (toujours une page du site)
function buildLink(form) {
  if (form.linkPreset === "destination" && form.destinationCity.trim()) {
    return `/?vers=${encodeURIComponent(form.destinationCity.trim())}`;
  }
  return { home: "/", install: "/application", publish: "/publier", custom: form.customLink.trim() || "/" }[form.linkPreset] ?? "/";
}

function presetFromLink(link) {
  if (link === "/") return { linkPreset: "home" };
  if (link === "/application") return { linkPreset: "install" };
  if (link === "/publier") return { linkPreset: "publish" };
  if (link?.startsWith("/?vers=")) return { linkPreset: "destination" };
  return { linkPreset: "custom", customLink: link };
}

/* ===== Aperçu de la notification telle qu'elle s'affichera sur un téléphone ===== */
function PushPreview({ title, body }) {
  return (
    <div className="bg-[#1F2A30] rounded-2xl p-3">
      <div className="bg-white/95 rounded-xl px-3.5 py-3 flex gap-3">
        <img src="/icons/icon-192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
        <div className="min-w-0 text-[13px]">
          <div className="flex justify-between text-[11px] text-muted">
            <span>MoveColis</span>
            <span>maintenant</span>
          </div>
          <div className="font-bold text-ink truncate">{title || "Titre de la notification"}</div>
          <div className="text-ink/80 line-clamp-2">{body || "Message de la notification"}</div>
        </div>
      </div>
    </div>
  );
}

/* ===== Formulaire de campagne ===== */
function CampaignForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);

  useEffect(() => {
    setForm(initial);
    setErrors({});
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initial]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  // Estimation de l'audience (personnes ayant accepté les campagnes)
  const destination = useDebouncedValue(form.destinationCity.trim(), 400);
  const audience = useApi(
    () => adminApi.campaignAudience({ audience: form.audience, destinationCity: destination || undefined }),
    [form.audience, destination]
  );

  async function save(status) {
    setSaving(true);
    setErrors({});
    setFormError(null);
    const payload = {
      title: form.title,
      body: form.body,
      link: buildLink(form),
      audience: form.audience,
      destinationCity: form.destinationCity.trim() || null,
      moment: form.moment.trim() || null,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
      status,
    };
    try {
      const saved = form.id ? await adminApi.updateCampaign(form.id, payload) : await adminApi.createCampaign(payload);
      onSaved(saved);
    } catch (err) {
      const byField = fieldErrors(err);
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Vérifiez les champs signalés en rouge." : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const sendNow = !form.scheduledAt || new Date(form.scheduledAt) <= new Date();

  return (
    <div ref={formRef} className="border border-line rounded-2xl bg-white p-5 scroll-mt-24">
      <CitySuggestions />
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-[17px] font-extrabold">{form.id ? "Modifier la campagne" : "Nouvelle campagne"}</h2>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="Fermer" className="text-muted p-1">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div>
          <Field label="Moment fort (repère interne)" error={errors.moment}>
            <input value={form.moment} onChange={set("moment")} placeholder="Ex. Tabaski 2027" className={inputClass} />
          </Field>
          <Field label="Titre de la notification" error={errors.title} hint={`${form.title.length}/80 · court et concret, idéalement moins de 50 caractères`}>
            <input value={form.title} onChange={set("title")} maxLength={80} required className={inputClass} />
          </Field>
          <Field label="Message" error={errors.body} hint={`${form.body.length}/200 · les téléphones affichent environ 2 lignes`}>
            <textarea value={form.body} onChange={set("body")} maxLength={200} rows={3} required className={inputClass} />
          </Field>

          <div className="grid sm:grid-cols-2 gap-x-3">
            <Field label="Audience" error={errors.audience}>
              <select value={form.audience} onChange={set("audience")} className={inputClass}>
                {Object.entries(AUDIENCES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Destination (facultatif)" error={errors.destinationCity} hint="Seulement les personnes intéressées par cette destination">
              <input value={form.destinationCity} onChange={set("destinationCity")} list="movecolis-cities" placeholder="Toutes" className={inputClass} />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-x-3">
            <Field label="Page ouverte au clic" error={errors.link}>
              <select value={form.linkPreset} onChange={set("linkPreset")} className={inputClass}>
                <option value="home">Tous les voyages</option>
                <option value="destination" disabled={!form.destinationCity.trim()}>Voyages vers la destination</option>
                <option value="publish">Publier un voyage (voyageurs)</option>
                <option value="install">Guide d'installation de l'appli</option>
                <option value="custom">Autre page du site…</option>
              </select>
            </Field>
            {form.linkPreset === "custom" ? (
              <Field label="Adresse de la page" hint="Commence par /, ex. /suivi">
                <input value={form.customLink} onChange={set("customLink")} placeholder="/…" className={inputClass} />
              </Field>
            ) : (
              <Field label="Date d'envoi" error={errors.scheduledAt} hint="Vide = dès que vous programmez">
                <input type="datetime-local" value={form.scheduledAt} onChange={set("scheduledAt")} className={inputClass} />
              </Field>
            )}
          </div>
          {form.linkPreset === "custom" && (
            <Field label="Date d'envoi" error={errors.scheduledAt} hint="Vide = dès que vous programmez">
              <input type="datetime-local" value={form.scheduledAt} onChange={set("scheduledAt")} className={inputClass} />
            </Field>
          )}
        </div>

        {/* Aperçu + audience */}
        <div className="flex flex-col gap-3">
          <PushPreview title={form.title} body={form.body} />
          <div className="flex items-center gap-2 bg-surface rounded-xl px-3.5 py-3 text-[13px]">
            <Users size={16} className="text-primary shrink-0" />
            {audience.loading && !audience.data ? (
              "Calcul de l'audience…"
            ) : audience.data ? (
              <span>
                <b>{formatNumber(audience.data.count)}</b> personne{audience.data.count > 1 ? "s" : ""} (ayant accepté les campagnes)
              </span>
            ) : (
              "Audience indisponible"
            )}
          </div>
          <p className="text-xs text-muted">
            Distribution sur 72 h au plus, en respectant les plafonds (1 par jour, 3 par semaine) et les heures calmes de chacun.
          </p>
        </div>
      </div>

      {formError && <Notice tone="danger">{formError}</Notice>}

      <div className="flex flex-wrap gap-2 justify-end mt-2">
        <button type="button" onClick={() => save("DRAFT")} disabled={saving} className={`${btnOutline} ${btnSm}`}>
          Enregistrer le brouillon
        </button>
        <button type="button" onClick={() => save("SCHEDULED")} disabled={saving || !form.title || !form.body} className={`${btnPrimary} ${btnSm}`}>
          {sendNow ? <Send size={15} /> : <CalendarClock size={15} />} {sendNow ? "Envoyer maintenant" : "Programmer"}
        </button>
      </div>
    </div>
  );
}

/* ===== Page ===== */
export default function Campagnes() {
  const stats = useApi(() => adminApi.marketingStats(), []);
  const campaigns = useApi(() => adminApi.listCampaigns(), []);
  const [formInitial, setFormInitial] = useState(null);
  const [flash, showFlash] = useFlash();

  // Moments forts à venir (les passés sont masqués)
  const upcoming = SEASONAL_MOMENTS.map((m) => ({ ...m, status: momentStatus(m) })).filter((m) => m.status).slice(0, 6);

  function prepare(moment) {
    const { start } = momentWindow(moment);
    const sendAt = Math.max(start, Date.now() + 3600000); // début de fenêtre (ou dans 1 h si elle est déjà ouverte)
    const at = new Date(sendAt);
    if (sendAt === start) at.setHours(10, 0, 0, 0); // 10 h, heure de votre navigateur
    setFormInitial({
      ...EMPTY_FORM,
      moment: `${moment.label} ${moment.date.slice(0, 4)}`,
      title: moment.title,
      body: moment.body,
      audience: moment.audience,
      ...presetFromLink(moment.link ?? "/"),
      scheduledAt: toInputDate(at),
    });
  }

  function edit(campaign) {
    setFormInitial({
      ...EMPTY_FORM,
      id: campaign.id,
      moment: campaign.moment ?? "",
      title: campaign.title,
      body: campaign.body,
      audience: campaign.audience,
      destinationCity: campaign.destinationCity ?? "",
      ...presetFromLink(campaign.link),
      scheduledAt: campaign.scheduledAt ? toInputDate(campaign.scheduledAt) : "",
    });
  }

  async function cancel(campaign) {
    try {
      await adminApi.cancelCampaign(campaign.id);
      campaigns.reload();
      showFlash("Campagne annulée.");
    } catch (err) {
      showFlash(errorMessage(err), "danger");
    }
  }

  const byKind = Object.fromEntries((stats.data ?? []).map((s) => [s.kind, s]));

  return (
    <Layout variant="admin">
      <div className="flex justify-between items-center flex-wrap gap-2.5 mt-5 mb-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Campagnes et notifications</h1>
        <button type="button" onClick={() => setFormInitial({ ...EMPTY_FORM })} className={`${btnPrimary} ${btnSm} px-4.5! py-3!`}>
          <Megaphone size={16} /> Nouvelle campagne
        </button>
      </div>
      <p className="text-muted text-sm mb-4">
        Les alertes trajets, rappels de départ et sélections de la semaine partent automatiquement. Les campagnes des
        moments forts se préparent ici, 2 à 3 semaines à l'avance.
      </p>

      {/* ===== Statistiques des 30 derniers jours ===== */}
      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(KIND_LABELS).map(([kind, label]) => {
          const s = byKind[kind] ?? { sent: 0, opened: 0 };
          return (
            <StatCard
              key={kind}
              label={`${label} (30 j)`}
              value={formatNumber(s.sent)}
              trend={s.sent ? `${percent(s.opened, s.sent)} % ouvertes` : "Aucun envoi"}
            />
          );
        })}
      </div>

      {/* ===== Formulaire ===== */}
      {formInitial && (
        <div className="mt-6">
          <CampaignForm
            initial={formInitial}
            onCancel={() => setFormInitial(null)}
            onSaved={(saved) => {
              setFormInitial(null);
              campaigns.reload();
              showFlash(saved.status === "SCHEDULED" ? "Campagne programmée." : "Brouillon enregistré.");
            }}
          />
        </div>
      )}

      {/* ===== Moments forts à venir ===== */}
      <h2 className="text-[17px] font-extrabold mt-6 mb-3">Moments forts à venir</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {upcoming.map((m) => {
          const { start, end } = momentWindow(m);
          return (
            <div key={m.key} className="border border-line-light rounded-2xl bg-white p-4 flex flex-col gap-1.5">
              <div className="flex justify-between items-start gap-2">
                <div className="font-bold text-sm">{m.label}</div>
                <Badge tone={m.status.tone}>{m.status.label}</Badge>
              </div>
              <div className="text-xs text-muted">
                {formatDayMonth(`${m.date}T12:00:00`)} {m.date.slice(0, 4)}
                {m.lunar && " · date indicative (calendrier lunaire)"} · {AUDIENCES[m.audience]}
              </div>
              <div className="text-[13px]">{m.why}</div>
              <div className="text-xs font-semibold text-ink">
                À envoyer entre le {formatDayMonth(start)} et le {formatDayMonth(end)}
              </div>
              <button type="button" onClick={() => prepare(m)} className={`${btnOutline} ${btnSm} mt-1 self-start`}>
                Préparer la campagne
              </button>
            </div>
          );
        })}
      </div>

      {/* ===== Campagnes ===== */}
      <h2 className="text-[17px] font-extrabold mt-6 mb-3">Campagnes</h2>
      {campaigns.error && <ErrorState error={campaigns.error} onRetry={campaigns.reload} />}
      {campaigns.loading && !campaigns.data ? (
        <Loader />
      ) : campaigns.data?.length ? (
        <div className="flex flex-col gap-3 pb-8">
          {campaigns.data.map((c) => {
            const status = STATUS[c.status];
            const editable = c.status === "DRAFT" || c.status === "SCHEDULED";
            const s = c.stats ?? { sent: 0, pending: 0, skipped: 0, opened: 0 };
            return (
              <div key={c.id} className="border border-line-light rounded-xl px-4 py-3.5 bg-white flex flex-col gap-1.5">
                <div className="flex justify-between items-start gap-2.5">
                  <div className="min-w-0">
                    <div className="font-bold text-[14.5px]">{c.title}</div>
                    <div className="text-[13px] text-muted line-clamp-2">{c.body}</div>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <div className="text-xs text-muted">
                  {[c.moment, AUDIENCES[c.audience], c.destinationCity && `vers ${c.destinationCity}`, c.link]
                    .filter(Boolean)
                    .join(" · ")}
                  {c.scheduledAt && ` · ${c.status === "SENT" ? "envoyée" : "prévue"} le ${new Date(c.sentAt ?? c.scheduledAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}`}
                </div>
                {c.status === "SENT" && (
                  <div className="text-[13px]">
                    <b>{formatNumber(c.recipientsCount)}</b> destinataires · <b>{formatNumber(s.sent)}</b> reçues ·{" "}
                    <b>{percent(s.opened, s.sent)} %</b> ouvertes
                    {s.pending > 0 && ` · ${formatNumber(s.pending)} en attente (heures calmes, plafonds)`}
                  </div>
                )}
                {editable && (
                  <div className="flex gap-2 mt-1">
                    <button type="button" onClick={() => edit(c)} className={`${btnOutline} ${btnSm}`}>
                      <Pencil size={14} /> Modifier
                    </button>
                    <button type="button" onClick={() => cancel(c)} className={`${btnOutline} ${btnSm} border-line!`}>
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted text-sm text-center py-8">Aucune campagne pour l'instant.</p>
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
