import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, Check, MapPin, SendHorizontal, X } from "lucide-react";
import Layout from "../components/Layout";
import ReservationStatusModal from "../components/ReservationStatusModal";
import { Badge, ErrorState, Loader, Notice, btnDanger, btnOutline, btnPrimary, btnSm } from "../components/ui";
import { layoutVariantFor, useAuth } from "../context/AuthContext";
import { useConversation } from "../hooks/useConversation";
import {
  dayLabel, formatClock, formatKg, formatMoney, formatPhone, formatTripDate, ownerLabel, routeLabel,
} from "../lib/format";
import { decodeId } from "../lib/hashid";
import { CANCELLABLE_RESERVATION_STATUSES, NEXT_RESERVATION_STEP, RESERVATION_STATUS } from "../lib/status";

/* ===== Qui a écrit ce message, vu par le lecteur ===== */
function senderName(message, detail) {
  switch (message.senderType) {
    case "OWNER":
      return ownerLabel(detail.owner);
    case "CUSTOMER":
      return detail.reservation.clientName;
    case "ADMIN":
      return "Équipe MoveColis";
    default:
      return null;
  }
}

/* ===== En-tête : réservation, interlocuteur, actions ===== */
function ConversationHeader({ detail, onAction }) {
  const { reservation, trip, owner, viewerSide } = detail;
  const status = RESERVATION_STATUS[reservation.status];
  const next = NEXT_RESERVATION_STEP[reservation.status];
  const canManage = viewerSide === "OWNER" || viewerSide === "ADMIN";
  const canCancel = canManage
    ? CANCELLABLE_RESERVATION_STATUSES.includes(reservation.status)
    : reservation.status === "PENDING"; // le client annule seulement avant confirmation

  const counterpart = {
    CUSTOMER: (
      <>
        Avec <b className="text-ink">{ownerLabel(owner)}</b>
        {owner.role === "ADMIN" ? " (vérifié)" : ""} · propriétaire du voyage
      </>
    ),
    OWNER: (
      <>
        Avec <b className="text-ink">{reservation.clientName}</b>
        {reservation.isGuest ? " (visiteur)" : ""} · {formatPhone(reservation.clientPhone)}
      </>
    ),
    ADMIN: (
      <>
        Client <b className="text-ink">{reservation.clientName}</b> · voyage de{" "}
        <b className="text-ink">{ownerLabel(owner)}</b>
      </>
    ),
  }[viewerSide];

  return (
    <div className="border border-line-light rounded-2xl bg-white px-4 py-3.5 flex flex-col gap-1.5">
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0">
          <div className="font-extrabold text-[15.5px]">
            {routeLabel(trip)} · {formatTripDate(trip.departureAt)}
          </div>
          <div className="text-[13px] text-muted">
            <span className="font-mono font-bold text-ink">{reservation.trackingCode}</span> ·{" "}
            {formatKg(reservation.kilos)} · {formatMoney(reservation.totalAmount, reservation.currency)}
          </div>
          <div className="text-[13px] text-muted">{counterpart}</div>
          {reservation.parcelDescription && (
            <div className="text-[13px] text-muted">📦 {reservation.parcelDescription}</div>
          )}
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex gap-2 flex-wrap mt-1.5">
        {canManage && next && (
          <button type="button" onClick={() => onAction(next.status)} className={`${btnPrimary} ${btnSm}`}>
            <Check size={15} /> {next.action}
          </button>
        )}
        <Link to={`/suivi?code=${reservation.trackingCode}`} className={`${btnOutline} ${btnSm}`}>
          <MapPin size={15} /> Suivi
        </Link>
        {canCancel && (
          <button type="button" onClick={() => onAction("CANCELLED")} className={`${btnDanger} ${btnSm}`}>
            <X size={15} /> {canManage ? "Annuler" : "Annuler ma réservation"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ===== Bulle de message ===== */
function MessageBubble({ message, mine, showName, name, seen, onRetry }) {
  if (message.senderType === "SYSTEM") {
    return (
      <div className="flex justify-center my-1">
        <div className="bg-surface text-muted text-xs font-semibold rounded-full px-3 py-1.5 text-center max-w-[90%]">
          {message.body}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {showName && !mine && <div className="text-[11.5px] font-bold text-muted mb-0.5 ml-1">{name}</div>}
      <div
        className={`px-3.5 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words ${
          mine
            ? "bg-primary text-white rounded-2xl rounded-br-md"
            : message.senderType === "ADMIN"
              ? "bg-[#E3F2FD] text-ink rounded-2xl rounded-bl-md"
              : "bg-white border border-line-light text-ink rounded-2xl rounded-bl-md"
        } ${message.pending ? "opacity-60" : ""}`}
      >
        {message.body}
      </div>
      <div className="text-[10.5px] text-muted mt-0.5 mx-1">
        {message.failed ? (
          <button type="button" onClick={() => onRetry(message)} className="text-danger font-bold underline">
            Échec de l'envoi · Réessayer
          </button>
        ) : message.pending ? (
          "Envoi…"
        ) : (
          <>
            {formatClock(message.createdAt)}
            {seen && " · Vu"}
          </>
        )}
      </div>
    </div>
  );
}

/* ===== Zone de saisie ===== */
function Composer({ onSend, onTyping }) {
  const [text, setText] = useState("");

  function submit(e) {
    e?.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-line-light p-2.5 bg-white">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTyping();
        }}
        onKeyDown={(e) => {
          // Entrée = envoyer, Maj+Entrée = retour à la ligne
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
        rows={1}
        maxLength={2000}
        placeholder="Écrire un message…"
        aria-label="Votre message"
        className="flex-1 min-w-0 resize-none max-h-32 border border-line rounded-2xl px-3.5 py-2.5 text-sm outline-none focus:border-ink transition [field-sizing:content]"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        aria-label="Envoyer"
        className="w-10 h-10 shrink-0 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition disabled:opacity-40"
      >
        <SendHorizontal size={18} />
      </button>
    </form>
  );
}

export default function Conversation() {
  const id = decodeId(useParams().id); // /messages/Xk9mP2qA → 12 (null si le lien est invalide)
  const { user } = useAuth();
  const location = useLocation();
  const justReserved = location.state?.justReserved; // { trackingCode } après une réservation
  const chat = useConversation(id);
  const [pendingStatus, setPendingStatus] = useState(null);

  const listRef = useRef(null);
  const stickToBottom = useRef(true); // l'utilisateur est en bas de la conversation ?
  const previousHeight = useRef(null); // pour garder la position en chargeant l'historique

  // Défilement : on reste en bas quand un message arrive, sauf si l'utilisateur relit plus haut
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (previousHeight.current !== null) {
      el.scrollTop = el.scrollHeight - previousHeight.current; // historique ajouté au-dessus
      previousHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chat.messages, chat.otherTyping]);

  function handleScroll() {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function loadOlder() {
    previousHeight.current = listRef.current?.scrollHeight ?? null;
    chat.loadOlder();
  }

  function handleSend(text) {
    stickToBottom.current = true;
    chat.send(text);
  }

  const backLink = (
    <Link to="/messages" className="inline-flex items-center gap-1.5 font-semibold underline text-sm mt-3 p-2 -ml-2">
      <ArrowLeft size={16} /> Mes conversations
    </Link>
  );

  /* ===== Lien invalide (code modifié à la main, lien tronqué…) ===== */
  if (!id) {
    return (
      <Layout variant={layoutVariantFor(user)}>
        <div className="max-w-2xl mx-auto">
          {backLink}
          <Notice tone="warn">Ce lien de conversation n'est pas valide.</Notice>
        </div>
      </Layout>
    );
  }

  /* ===== Erreurs d'accès ===== */
  if (chat.error) {
    const denied = chat.error.status === 401 || chat.error.status === 403;
    return (
      <Layout variant={layoutVariantFor(user)}>
        <div className="max-w-2xl mx-auto">
          {backLink}
          {denied ? (
            <Notice tone="warn">
              Cette conversation est privée. Si vous avez réservé sans compte, ouvrez-la depuis l'appareil
              utilisé pour la réservation{user ? "." : <> ou <Link to="/connexion" className="font-bold underline">connectez-vous</Link>.</>}
            </Notice>
          ) : (
            <ErrorState error={chat.error} />
          )}
        </div>
      </Layout>
    );
  }

  const detail = chat.detail;
  const viewerSide = detail?.viewerSide;
  const lastMine = [...chat.messages].reverse().find((m) => m.senderType === viewerSide && !m.pending && !m.failed);
  const otherName = detail && (viewerSide === "CUSTOMER" ? ownerLabel(detail.owner) : detail.reservation.clientName);

  return (
    <Layout variant={layoutVariantFor(user)}>
      <div className="max-w-2xl mx-auto pb-6">
        {backLink}

        {justReserved && (
          <Notice tone="success">
            <b>Réservation enregistrée !</b> Code de suivi : <b className="font-mono">{justReserved.trackingCode}</b>.
            Le propriétaire du voyage va vous répondre ici pour confirmer.
            {!user && " Sans compte, cette conversation reste accessible depuis cet appareil : notez bien votre code."}
          </Notice>
        )}

        {chat.loading && !detail ? (
          <Loader />
        ) : (
          <>
            <ConversationHeader detail={detail} onAction={setPendingStatus} />

            {/* ===== Fil de discussion ===== */}
            <div className="border border-line-light rounded-2xl bg-surface mt-3 overflow-hidden flex flex-col">
              <div
                ref={listRef}
                onScroll={handleScroll}
                className="h-[52vh] lg:h-[58vh] overflow-y-auto px-3.5 py-3 flex flex-col gap-2"
                aria-live="polite"
              >
                {chat.hasMore && (
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={chat.loadingOlder}
                    className="self-center text-xs font-bold underline text-muted py-1"
                  >
                    {chat.loadingOlder ? "Chargement…" : "Voir les messages précédents"}
                  </button>
                )}

                {chat.messages.map((message, index) => {
                  const previous = chat.messages[index - 1];
                  const newDay =
                    !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                  const mine = message.senderType === viewerSide;
                  return (
                    <Fragment key={message.id}>
                      {newDay && (
                        <div className="text-center text-[11px] font-bold text-muted uppercase tracking-wide my-1.5">
                          {dayLabel(message.createdAt)}
                        </div>
                      )}
                      <MessageBubble
                        message={message}
                        mine={mine}
                        name={senderName(message, detail)}
                        showName={!previous || previous.senderType !== message.senderType || newDay}
                        seen={
                          viewerSide !== "ADMIN" &&
                          message === lastMine &&
                          chat.otherReadAt &&
                          new Date(chat.otherReadAt) >= new Date(message.createdAt)
                        }
                        onRetry={chat.retry}
                      />
                    </Fragment>
                  );
                })}

                {chat.otherTyping && (
                  <div className="text-xs text-muted italic ml-1">{otherName} est en train d'écrire…</div>
                )}
              </div>

              <Composer onSend={handleSend} onTyping={chat.notifyTyping} />
            </div>

            {!user && (
              <p className="text-xs text-muted text-center mt-3">
                <Link to="/inscription" className="font-bold underline">Créez un compte client</Link> pour
                retrouver vos conversations sur tous vos appareils.
              </p>
            )}
          </>
        )}
      </div>

      {pendingStatus && detail && (
        <ReservationStatusModal
          nextStatus={pendingStatus}
          title={pendingStatus === "CANCELLED" && viewerSide === "CUSTOMER" ? "Annuler ma réservation" : undefined}
          summary={`${detail.reservation.clientName} · ${formatKg(detail.reservation.kilos)} · ${routeLabel(detail.trip)} (${detail.reservation.trackingCode}).`}
          onClose={() => setPendingStatus(null)}
          onConfirm={async (note) => {
            await chat.changeStatus(pendingStatus, note);
            setPendingStatus(null);
          }}
        />
      )}
    </Layout>
  );
}
