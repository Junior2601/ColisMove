import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MessageCircle } from "lucide-react";
import Layout from "../components/Layout";
import { Badge, ChipRow, ErrorState, FilterChip, LoadMore, Loader, Notice } from "../components/ui";
import { conversationsApi } from "../api/conversations";
import { layoutVariantFor, useAuth } from "../context/AuthContext";
import { usePaginated } from "../hooks/useApi";
import { useSocketEvent } from "../hooks/useSocketEvent";
import { listGuestAccess } from "../lib/guestAccess";
import { formatTripShortDate, ownerLabel, routeLabel, timeAgo } from "../lib/format";
import { paths } from "../lib/hashid";
import { RESERVATION_STATUS } from "../lib/status";

const ADMIN_SCOPES = [
  { key: "all", label: "Toutes les conversations" },
  { key: "mine", label: "Mes voyages" },
];

// Avec qui je parle, selon mon côté de la conversation
function counterpartLabel(c) {
  if (c.viewerSide === "CUSTOMER") return ownerLabel(c.owner);
  if (c.viewerSide === "OWNER") return `${c.reservation.clientName}${c.reservation.isGuest ? " (visiteur)" : ""}`;
  return `${c.reservation.clientName} ↔ ${ownerLabel(c.owner)}`; // admin observateur
}

function lastMessagePreview(c) {
  const last = c.lastMessage;
  if (!last) return "Aucun message";
  if (last.senderType === "SYSTEM") return last.body;
  return `${last.senderType === c.viewerSide ? "Vous : " : ""}${last.body}`;
}

function ConversationRow({ c }) {
  const status = RESERVATION_STATUS[c.reservation.status];
  const unread = c.unreadCount > 0;

  return (
    <Link
      to={paths.conversation(c.id)}
      className="flex items-center gap-3 px-4 py-3.5 border-b border-line-light last:border-0 hover:bg-surface transition"
    >
      <div className="w-10 h-10 rounded-full bg-ink text-white flex items-center justify-center font-bold shrink-0">
        {counterpartLabel(c).charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2">
          <span className={`text-[14.5px] truncate ${unread ? "font-extrabold" : "font-bold"}`}>{counterpartLabel(c)}</span>
          <span className="text-[11.5px] text-muted shrink-0">{c.lastMessage && timeAgo(c.lastMessage.createdAt)}</span>
        </div>
        <div className="text-xs text-muted truncate">
          {routeLabel(c.trip)} · {formatTripShortDate(c.trip.departureAt)} · {c.reservation.trackingCode}
        </div>
        <div className="flex justify-between items-center gap-2 mt-0.5">
          <span className={`text-[13px] truncate ${unread ? "text-ink font-semibold" : "text-muted"}`}>
            {lastMessagePreview(c)}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <Badge tone={status.tone}>{status.label}</Badge>
            {unread && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
                {c.unreadCount}
              </span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ===== Compte connecté : boîte de réception temps réel ===== */
function AccountInbox({ user }) {
  const [scope, setScope] = useState("all");
  const isAdmin = user.role === "ADMIN";
  const list = usePaginated(
    (page) => conversationsApi.list({ scope: isAdmin ? scope : undefined, ...page }),
    [scope, isAdmin]
  );

  // Nouveau message, nouvelle réservation ou lecture : on rafraîchit la liste (une fois le calme revenu)
  const timer = useRef(null);
  useSocketEvent("inbox:updated", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(list.reload, 500);
  });

  return (
    <>
      {isAdmin && (
        <ChipRow>
          {ADMIN_SCOPES.map((s) => (
            <FilterChip key={s.key} active={scope === s.key} onClick={() => setScope(s.key)}>
              {s.label}
            </FilterChip>
          ))}
        </ChipRow>
      )}

      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}

      {list.loading && list.items.length === 0 ? (
        <Loader />
      ) : list.items.length === 0 ? (
        <EmptyInbox role={user.role} />
      ) : (
        <>
          <div className="border border-line-light rounded-2xl bg-white overflow-hidden mb-4">
            {list.items.map((c) => (
              <ConversationRow key={c.id} c={c} />
            ))}
          </div>
          <LoadMore hasMore={list.hasMore} loading={list.loadingMore} onClick={list.loadMore} />
        </>
      )}
    </>
  );
}

function EmptyInbox({ role }) {
  return (
    <div className="text-center py-12 text-muted text-sm">
      <MessageCircle size={36} className="mx-auto mb-2 opacity-40" />
      {role === "CLIENT" ? (
        <>
          Aucune conversation pour l'instant.{" "}
          <Link to="/" className="font-bold underline text-ink">Réservez des kilos</Link> pour échanger avec un voyageur.
        </>
      ) : (
        "Aucune conversation pour l'instant. Elles apparaîtront ici dès qu'un client réservera sur vos voyages."
      )}
    </div>
  );
}

/* ===== Visiteur : conversations mémorisées sur cet appareil ===== */
function GuestInbox() {
  const accesses = listGuestAccess();

  if (accesses.length === 0) {
    return (
      <div className="text-center py-12 text-muted text-sm">
        <MessageCircle size={36} className="mx-auto mb-2 opacity-40" />
        Aucune conversation sur cet appareil.{" "}
        <Link to="/connexion" className="font-bold underline text-ink">Connectez-vous</Link> ou{" "}
        <Link to="/" className="font-bold underline text-ink">réservez des kilos</Link>.
      </div>
    );
  }

  return (
    <>
      <div className="border border-line-light rounded-2xl bg-white overflow-hidden">
        {accesses.map((a) => (
          <Link
            key={a.conversationId}
            to={paths.conversation(a.conversationId)}
            className="flex items-center gap-3 px-4 py-3.5 border-b border-line-light last:border-0 hover:bg-surface transition"
          >
            <MessageCircle size={20} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[14.5px] truncate">{a.route}</div>
              <div className="text-xs text-muted">
                {a.departureAt && `${formatTripShortDate(a.departureAt)} · `}
                <span className="font-mono">{a.trackingCode}</span>
              </div>
            </div>
            <ChevronRight size={17} className="text-muted" />
          </Link>
        ))}
      </div>
      <Notice>
        Ces conversations sont mémorisées sur cet appareil uniquement.{" "}
        <Link to="/inscription" className="font-bold underline">Créez un compte client</Link> pour les prochaines
        réservations : vous les retrouverez partout.
      </Notice>
    </>
  );
}

export default function Messages() {
  const { user, loading } = useAuth();

  return (
    <Layout variant={layoutVariantFor(user)}>
      <div className="max-w-2xl mx-auto pb-8">
        <h1 className="text-2xl font-extrabold tracking-tight mt-5 mb-1">Messages</h1>
        <p className="text-muted text-sm mb-4">
          Une conversation par réservation : c'est ici que se confirment et s'organisent les envois.
        </p>
        {loading ? <Loader /> : user ? <AccountInbox user={user} /> : <GuestInbox />}
      </div>
    </Layout>
  );
}
