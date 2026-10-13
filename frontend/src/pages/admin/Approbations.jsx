import { useState } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import Layout from "../../components/Layout";
import {
  Badge, ErrorState, LoadMore, Loader, Toast, btnDanger, btnOutline, btnPrimary, btnSm, btnWhatsApp,
} from "../../components/ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { usePaginated } from "../../hooks/useApi";
import { useFlash } from "../../hooks/useFlash";
import { whatsappLink } from "../../lib/whatsapp";
import { formatDayMonth, fullName, plural, timeAgo } from "../../lib/format";
import { TRAVELER_STATUS } from "../../lib/status";

const TAB_DEFS = [
  { key: "PENDING", label: "En attente" },
  { key: "APPROVED", label: "Approuvés" },
  { key: "REJECTED", label: "Refusés" },
];

const EMPTY_COUNTS = { PENDING: 0, APPROVED: 0, REJECTED: 0 };

function describeDate(t) {
  if (t.status === "PENDING") return `Inscription ${timeAgo(t.createdAt)}`;
  const verb = t.status === "APPROVED" ? "Approuvé" : "Refusé";
  return t.statusChangedAt ? `${verb} le ${formatDayMonth(t.statusChangedAt)}` : verb;
}

function TravelerCard({ t, busy, onUpdate }) {
  const status = TRAVELER_STATUS[t.status];

  return (
    <div className="border border-line-light rounded-xl px-4 py-3.5 bg-white flex flex-col gap-2">
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0">
          <div className="font-bold text-[14.5px]">{fullName(t)}</div>
          <div className="text-[13px] text-muted break-words">
            {t.city ?? "Ville non renseignée"} · {t.email} · +{t.phone}
          </div>
          <div className="text-[13px] text-muted">
            {describeDate(t)}
            {t.status === "APPROVED" && ` · ${plural(t.tripsCount, "voyage")}`}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex gap-2 flex-wrap mt-1">
        {/* Le candidat n'a pas encore de conversation : l'admin peut le joindre sur WhatsApp avant de décider */}
        <a
          href={whatsappLink(t.phone, `Bonjour ${t.firstName}, c'est l'équipe MoveColis au sujet de votre demande de compte voyageur.`)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnWhatsApp} ${btnSm}`}
        >
          <MessageCircle size={16} /> WhatsApp
        </a>

        {t.status === "PENDING" && (
          <>
            <button type="button" disabled={busy} onClick={() => onUpdate(t, "APPROVED")} className={`${btnPrimary} ${btnSm}`}>
              <Check size={15} /> Approuver
            </button>
            <button type="button" disabled={busy} onClick={() => onUpdate(t, "REJECTED")} className={`${btnDanger} ${btnSm}`}>
              <X size={15} /> Refuser
            </button>
          </>
        )}

        {/* Possibilité de revenir sur une décision */}
        {t.status === "REJECTED" && (
          <button type="button" disabled={busy} onClick={() => onUpdate(t, "APPROVED")} className={`${btnOutline} ${btnSm}`}>
            Finalement approuver
          </button>
        )}
        {t.status === "APPROVED" && (
          <button type="button" disabled={busy} onClick={() => onUpdate(t, "REJECTED")} className={`${btnDanger} ${btnSm}`}>
            Révoquer l'accès
          </button>
        )}
      </div>
    </div>
  );
}

export default function Approbations() {
  const [tab, setTab] = useState("PENDING");
  const [busyId, setBusyId] = useState(null);
  const [flash, showFlash] = useFlash();

  const travelers = usePaginated((page) => adminApi.listTravelers({ status: tab, ...page }), [tab]);
  const counts = travelers.meta?.counts ?? EMPTY_COUNTS;

  async function updateStatus(traveler, status) {
    const snapshot = { items: travelers.items, total: travelers.total, meta: travelers.meta };

    // Mise à jour optimiste : la carte quitte l'onglet et les compteurs bougent tout de suite…
    setBusyId(traveler.id);
    travelers.setItems((items) => items.filter((t) => t.id !== traveler.id));
    travelers.setTotal((total) => total - 1);
    travelers.setMeta((meta) => ({
      ...meta,
      counts: { ...meta.counts, [traveler.status]: meta.counts[traveler.status] - 1, [status]: meta.counts[status] + 1 },
    }));

    try {
      await adminApi.updateTravelerStatus(traveler.id, status);
      const action =
        status === "APPROVED"
          ? "compte approuvé, il peut publier des voyages"
          : traveler.status === "APPROVED"
            ? "accès révoqué"
            : "demande refusée";
      showFlash(`${fullName(traveler)} : ${action}.`);
    } catch (err) {
      // …et on annule si le serveur refuse
      travelers.setItems(snapshot.items);
      travelers.setTotal(snapshot.total);
      travelers.setMeta(snapshot.meta);
      showFlash(errorMessage(err), "danger");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout variant="admin">
      <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Approbations voyageurs</h1>
      <p className="text-muted text-sm mb-4">
        Vérifiez les demandes de compte voyageur avant de leur donner accès à la publication.
      </p>

      {/* ===== Onglets par statut (compteurs venant du serveur) ===== */}
      <div className="flex gap-1 border-b border-line-light mb-4 overflow-x-auto" role="tablist">
        {TAB_DEFS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t.key ? "text-ink border-ink" : "text-muted border-transparent"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {/* ===== Liste ===== */}
      {travelers.error && <ErrorState error={travelers.error} onRetry={travelers.reload} />}

      {travelers.loading && travelers.items.length === 0 ? (
        <Loader />
      ) : (
        <div className={`transition-opacity ${travelers.loading ? "opacity-60" : ""}`}>
          <div className="flex flex-col gap-3 pb-6">
            {travelers.items.map((t) => (
              <TravelerCard key={t.id} t={t} busy={busyId === t.id} onUpdate={updateStatus} />
            ))}
          </div>

          {!travelers.loading && !travelers.error && travelers.items.length === 0 && (
            <p className="text-muted text-sm text-center py-10">
              {tab === "PENDING" ? "🎉 Aucune demande en attente." : "Aucun compte dans cette catégorie."}
            </p>
          )}

          <LoadMore hasMore={travelers.hasMore} loading={travelers.loadingMore} onClick={travelers.loadMore} />
        </div>
      )}

      <Toast flash={flash} />
    </Layout>
  );
}
