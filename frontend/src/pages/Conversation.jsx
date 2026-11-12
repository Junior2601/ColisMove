import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft, Camera, Check, CreditCard, Download, ExternalLink, Mail, MapPin, SendHorizontal, X,
} from "lucide-react";
import Layout from "../components/Layout";
import ReservationStatusModal from "../components/ReservationStatusModal";
import ReservationPaymentButtons, { PaidBadge } from "../components/ReservationPayment";
import SendTicketModal from "../components/admin/SendTicketModal";
import { PassengerList } from "../components/flights/Passengers";
import { Badge, ErrorState, Loader, Notice, Toast, btnDanger, btnOutline, btnPrimary, btnSm } from "../components/ui";
import { adminApi } from "../api/admin";
import { errorMessage } from "../api/client";
import { conversationsApi } from "../api/conversations";
import { layoutVariantFor, useAuth } from "../context/AuthContext";
import { useConversation } from "../hooks/useConversation";
import { useFlash } from "../hooks/useFlash";
import {
  dayLabel, formatClock, formatDateTime, formatKg, formatMoney, formatPhone, formatTripDate, formatTripTime, ownerLabel,
  routeLabel,
} from "../lib/format";
import { decodeId } from "../lib/hashid";
import {
  CANCELLABLE_FLIGHT_ORDER_STATUSES, CANCELLABLE_RESERVATION_STATUSES, FLIGHT_ORDER_STATUS, NEXT_FLIGHT_ORDER_STEP,
  NEXT_RESERVATION_STEP, RESERVATION_STATUS,
} from "../lib/status";
import { arrivalTimeLabel, orderBaggageLabel, passengersLabel, removedBagsLabel, stopsLabel } from "../lib/flights";

// La conversation porte sur une réservation de kilos ou sur une demande de billet d'avion
const subjectOf = (detail) => (detail.kind === "FLIGHT" ? detail.flightOrder : detail.reservation);

/* ===== Qui a écrit ce message, vu par le lecteur ===== */
function senderName(message, detail) {
  switch (message.senderType) {
    case "OWNER":
      return ownerLabel(detail.owner);
    case "CUSTOMER":
      return subjectOf(detail).clientName;
    case "ADMIN":
      return "Équipe MoveColis";
    default:
      return null;
  }
}

/* ===== En-tête : réservation, interlocuteur, actions =====
 * Paiement (indépendant des étapes du colis) : le propriétaire envoie ses numéros de paiement,
 * le client envoie la capture de son paiement, puis le propriétaire clique sur « Paiement reçu ».
 */
function ConversationHeader({ detail, onAction, onPickImage, onPaymentUpdated, onFlash }) {
  const { reservation, trip, owner, viewerSide } = detail;
  const status = RESERVATION_STATUS[reservation.status];
  const next = NEXT_RESERVATION_STEP[reservation.status];
  const canManage = viewerSide === "OWNER" || viewerSide === "ADMIN";
  const canCancel = canManage
    ? CANCELLABLE_RESERVATION_STATUSES.includes(reservation.status)
    : reservation.status === "PENDING"; // le client annule seulement avant confirmation
  const awaitingPayment = !reservation.paidAt && reservation.status !== "CANCELLED";

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
          {reservation.paidAt ? (
            <div className="text-[13px] text-success font-semibold">
              💰 Paiement reçu le {formatDateTime(reservation.paidAt)}
            </div>
          ) : (
            awaitingPayment && reservation.paymentInfoSentAt && (
              <div className="text-[13px] text-ink font-semibold">
                {canManage
                  ? `💳 Numéros de paiement envoyés au client le ${formatDateTime(reservation.paymentInfoSentAt)}`
                  : "💳 Payez avec les numéros ci-dessous, puis envoyez la capture de votre paiement."}
              </div>
            )
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge tone={status.tone}>{status.label}</Badge>
          <PaidBadge reservation={reservation} />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mt-1.5">
        {canManage && next && (
          <button type="button" onClick={() => onAction(next.status)} className={`${btnPrimary} ${btnSm}`}>
            <Check size={15} /> {next.action}
          </button>
        )}
        {canManage && (
          <ReservationPaymentButtons reservation={reservation} trip={trip} conversationId={detail.id}
            onUpdated={onPaymentUpdated} onFlash={onFlash} />
        )}
        {viewerSide === "CUSTOMER" && awaitingPayment && reservation.paymentInfoSentAt && (
          <button type="button" onClick={() => onPickImage("📷 Capture du paiement")} className={`${btnPrimary} ${btnSm}`}>
            <Camera size={15} /> Envoyer la capture du paiement
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

/* ===== En-tête d'une demande de billet d'avion =====
 * Paiement : l'équipe envoie les numéros de paiement (réglages), le client envoie la capture de son paiement,
 * puis l'équipe clique sur « Paiement reçu ».
 */
function FlightOrderHeader({ detail, onAction, onSendPaymentInfo, sendingPaymentInfo, onPickImage }) {
  const { flightOrder: order, viewerSide } = detail;
  const { flight } = order;
  const status = FLIGHT_ORDER_STATUS[order.status];
  const next = NEXT_FLIGHT_ORDER_STEP[order.status];
  const canManage = viewerSide === "OWNER" || viewerSide === "ADMIN";
  const canCancel = canManage
    ? CANCELLABLE_FLIGHT_ORDER_STATUSES.includes(order.status)
    : order.status === "PENDING"; // le client annule seulement avant le paiement
  const awaitingPayment = order.status === "PENDING";

  return (
    <div className="border border-line-light rounded-2xl bg-white px-4 py-3.5 flex flex-col gap-1.5">
      <div className="flex justify-between items-start gap-2.5">
        <div className="min-w-0">
          <div className="font-extrabold text-[15.5px]">
            ✈️ {flight.origin.name} → {flight.destination.name} · {formatTripDate(flight.departureAt)} ·{" "}
            {formatTripTime(flight.departureAt)}
            {flight.arrivalAt && ` → ${arrivalTimeLabel(flight.departureAt, flight.arrivalAt)}`}
          </div>
          <div className="text-[13px] text-muted">
            <span className="font-mono font-bold text-ink">{order.reference}</span> · {passengersLabel(order)} ·{" "}
            <b className="text-ink">{formatMoney(order.totalAmount, order.currency)}</b>
          </div>
          <div className="text-[13px] text-muted">
            {flight.airlineName} {flight.airline} {flight.flightNumber} · {stopsLabel(flight.transfers, flight.stops)} ·{" "}
            {orderBaggageLabel(order)}
          </div>
          {order.bags.removed > 0 && (
            <div className="text-[13px] text-muted">
              🧳 {removedBagsLabel(order.bags.removed)} : −{formatMoney(order.bags.discount, order.currency)}
              {canManage && ` · ${formatKg(order.bags.freedKilos)} libérés pour MoveColis`}
            </div>
          )}
          {order.options.length > 0 && (
            <div className="text-[13px] text-muted">
              Options : {order.options.map((o) => (o.quantity > 1 ? `${o.label} × ${o.quantity}` : o.label)).join(", ")}
            </div>
          )}
          <PassengerList passengers={order.passengers} />
          <div className="text-[13px] text-muted">
            {viewerSide === "CUSTOMER" ? (
              <>
                Avec <b className="text-ink">l&apos;équipe MoveColis</b> · achat de votre billet
              </>
            ) : (
              <>
                Client <b className="text-ink">{order.clientName}</b>
                {order.isGuest ? " (visiteur)" : ""} · {formatPhone(order.clientPhone)}
                {order.clientEmail && ` · ${order.clientEmail}`}
              </>
            )}
          </div>
          {awaitingPayment && order.paymentInfoSentAt && (
            <div className="text-[13px] text-ink font-semibold">
              {canManage
                ? `💳 Numéros de paiement envoyés au client le ${formatDateTime(order.paymentInfoSentAt)}`
                : "💳 Payez avec les numéros ci-dessous, puis envoyez la capture de votre paiement."}
            </div>
          )}
          {order.receiptSentAt && (
            <div className="text-[13px] text-success font-semibold">
              📧 Billet envoyé à {order.receiptEmail} le {formatDateTime(order.receiptSentAt)}
            </div>
          )}
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="flex gap-2 flex-wrap mt-1.5">
        {/* Étape avant « Paiement reçu » : numéros de paiement envoyés dans la conversation */}
        {canManage && awaitingPayment && (
          <button type="button" onClick={onSendPaymentInfo} disabled={sendingPaymentInfo} className={`${btnOutline} ${btnSm}`}>
            <CreditCard size={15} />
            {sendingPaymentInfo
              ? "Envoi…"
              : order.paymentInfoSentAt ? "Renvoyer le numéro de paiement" : "Envoyer le numéro de paiement"}
          </button>
        )}
        {viewerSide === "CUSTOMER" && awaitingPayment && order.paymentInfoSentAt && (
          <button type="button" onClick={() => onPickImage("📷 Capture du paiement")} className={`${btnPrimary} ${btnSm}`}>
            <Camera size={15} /> Envoyer la capture du paiement
          </button>
        )}
        {canManage && next && (
          <button type="button" onClick={() => onAction(next.status)} className={`${btnPrimary} ${btnSm}`}>
            <Check size={15} /> {next.action}
          </button>
        )}
        {canManage && order.status === "ISSUED" && (
          <button type="button" onClick={() => onAction("ISSUED")} className={`${btnOutline} ${btnSm}`}>
            <Mail size={15} /> Renvoyer le billet
          </button>
        )}
        {/* Lien d'achat sur aviasales.ru : visible uniquement par l'équipe */}
        {canManage && order.purchaseUrl && CANCELLABLE_FLIGHT_ORDER_STATUSES.includes(order.status) && (
          <a href={order.purchaseUrl} target="_blank" rel="noopener noreferrer" className={`${btnOutline} ${btnSm}`}>
            <ExternalLink size={15} /> Acheter sur Aviasales{order.gate ? ` (${order.gate})` : ""}
          </a>
        )}
        {canCancel && (
          <button type="button" onClick={() => onAction("CANCELLED")} className={`${btnDanger} ${btnSm}`}>
            <X size={15} /> {canManage ? "Annuler" : "Annuler ma demande"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ===== Photo d'un message : téléchargée avec le jeton (réservée aux participants) ===== */
function MessageImage({ message, onOpen }) {
  const { attachment, localUrl, conversationId } = message;
  const [loaded, setLoaded] = useState({ url: null, failed: false });

  useEffect(() => {
    if (localUrl || !attachment?.id) return undefined; // photo envoyée depuis cet appareil : aperçu local
    let active = true;
    let objectUrl = null;
    conversationsApi
      .attachment(conversationId, attachment.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ url: objectUrl, failed: false });
      })
      .catch(() => active && setLoaded({ url: null, failed: true }));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, attachment?.id, localUrl]);

  const src = localUrl ?? loaded.url;
  // Place réservée aux bonnes proportions : la conversation ne saute pas quand la photo arrive
  const ratio = attachment?.width && attachment?.height ? attachment.width / attachment.height : 3 / 4;
  const width = Math.round(Math.min(240, 300 * ratio));

  return (
    <button type="button" onClick={() => src && onOpen(src)} disabled={!src} aria-label="Agrandir la photo"
      style={{ width, aspectRatio: String(ratio) }}
      className="block max-w-full rounded-2xl overflow-hidden bg-line-light border border-line-light">
      {src ? (
        <img src={src} alt="Photo envoyée dans la conversation" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs text-muted">{loaded.failed ? "Photo indisponible" : "Chargement…"}</span>
      )}
    </button>
  );
}

/* ===== Photo agrandie (Échap ou clic pour fermer) ===== */
function ImageViewer({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Photo" onClick={onClose}
      className="fixed inset-0 z-60 bg-black/85 flex flex-col items-center justify-center gap-3 p-4">
      <img src={url} alt="Photo envoyée dans la conversation" onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[82vh] object-contain rounded-lg" />
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={url} download="photo-movecolis.jpg" className={`${btnOutline} ${btnSm}`}>
          <Download size={15} /> Enregistrer
        </a>
        <button type="button" onClick={onClose} className={`${btnOutline} ${btnSm}`}>
          <X size={15} /> Fermer
        </button>
      </div>
    </div>
  );
}

/* ===== Bulle de message ===== */
function MessageBubble({ message, mine, showName, name, seen, onRetry, onOpenImage }) {
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
      {message.attachment ? (
        // Photo, avec son texte s'il en dit plus que « 📷 Photo » (ex. « 📷 Capture du paiement »)
        <div className={`max-w-[85%] flex flex-col ${mine ? "items-end" : "items-start"} ${message.pending ? "opacity-60" : ""}`}>
          <MessageImage message={message} onOpen={onOpenImage} />
          {message.body !== "📷 Photo" && <div className="text-xs font-semibold text-muted mt-1 mx-1">{message.body}</div>}
        </div>
      ) : (
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
      )}
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

/* ===== Zone de saisie (onPickImage : bouton photo, ex. capture du paiement) ===== */
function Composer({ onSend, onTyping, onPickImage }) {
  const [text, setText] = useState("");

  function submit(e) {
    e?.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-line-light p-2.5 bg-white">
      {onPickImage && (
        <button
          type="button"
          onClick={() => onPickImage()}
          aria-label="Envoyer une photo"
          title="Envoyer une photo (capture du paiement…)"
          className="w-10 h-10 shrink-0 rounded-full border border-line text-ink flex items-center justify-center hover:border-ink transition"
        >
          <Camera size={18} />
        </button>
      )}
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
  const justOrdered = location.state?.justOrdered; // { reference } après une demande de billet
  const chat = useConversation(id);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [flash, showFlash] = useFlash();
  const [viewerUrl, setViewerUrl] = useState(null); // photo agrandie
  const [sendingPaymentInfo, setSendingPaymentInfo] = useState(false);
  const fileInputRef = useRef(null);
  const captionRef = useRef(undefined); // texte de la photo choisie (« 📷 Capture du paiement »…)

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

  // Photo : bouton 📷 de la zone de saisie, ou « Envoyer la capture du paiement » (texte du message)
  function pickImage(caption) {
    captionRef.current = caption;
    fileInputRef.current?.click();
  }

  async function handleImageChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // la même photo pourra être choisie à nouveau
    if (!file) return;
    stickToBottom.current = true;
    try {
      await chat.sendImage(file, captionRef.current);
    } catch (err) {
      showFlash(err.message, "danger"); // image illisible (un échec d'envoi, lui, se réessaie sur la bulle)
    }
  }

  // Équipe : numéros de paiement (réglages des billets) envoyés au client dans la conversation
  async function sendPaymentInfo() {
    setSendingPaymentInfo(true);
    try {
      const updated = await adminApi.sendFlightPaymentInfo(chat.detail.flightOrder.id);
      chat.patchFlightOrder({ paymentInfoSentAt: updated.paymentInfoSentAt });
      stickToBottom.current = true;
    } catch (err) {
      showFlash(errorMessage(err), "danger");
    } finally {
      setSendingPaymentInfo(false);
    }
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
  const isFlight = detail?.kind === "FLIGHT";
  const otherName = detail && (viewerSide === "CUSTOMER" ? ownerLabel(detail.owner) : subjectOf(detail).clientName);

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
        {justOrdered && (
          <Notice tone="success">
            <b>Demande envoyée !</b> Référence : <b className="font-mono">{justOrdered.reference}</b>. L&apos;équipe
            MoveColis va vous confirmer ici le prix et le mode de paiement, puis vous envoyer votre billet.
            {!user && " Sans compte, cette conversation reste accessible depuis cet appareil : notez bien votre référence."}
          </Notice>
        )}

        {chat.loading && !detail ? (
          <Loader />
        ) : (
          <>
            {isFlight ? (
              <FlightOrderHeader detail={detail} onAction={setPendingStatus} onSendPaymentInfo={sendPaymentInfo}
                sendingPaymentInfo={sendingPaymentInfo} onPickImage={pickImage} />
            ) : (
              <ConversationHeader detail={detail} onAction={setPendingStatus} onPickImage={pickImage}
                onPaymentUpdated={chat.patchReservation} onFlash={showFlash} />
            )}

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
                        onOpenImage={setViewerUrl}
                      />
                    </Fragment>
                  );
                })}

                {chat.otherTyping && (
                  <div className="text-xs text-muted italic ml-1">{otherName} est en train d'écrire…</div>
                )}
              </div>

              <Composer onSend={handleSend} onTyping={chat.notifyTyping} onPickImage={pickImage} />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChosen} className="hidden"
                aria-hidden="true" tabIndex={-1} />
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

      {/* Billet émis (ou nouvel envoi) : l'équipe envoie le billet et le reçu par e-mail */}
      {pendingStatus === "ISSUED" && isFlight && (
        <SendTicketModal
          order={detail.flightOrder}
          onClose={() => setPendingStatus(null)}
          onSent={(updated) => {
            chat.patchFlightOrder(updated);
            setPendingStatus(null);
          }}
        />
      )}
      {pendingStatus && detail && !(pendingStatus === "ISSUED" && isFlight) && (
        <ReservationStatusModal
          nextStatus={pendingStatus}
          variant={isFlight ? "flight" : "reservation"}
          title={
            pendingStatus === "CANCELLED" && viewerSide === "CUSTOMER"
              ? isFlight
                ? "Annuler ma demande"
                : "Annuler ma réservation"
              : undefined
          }
          summary={
            isFlight
              ? `${detail.flightOrder.clientName} · ${detail.flightOrder.flight.origin.name} → ${detail.flightOrder.flight.destination.name} · ${passengersLabel(detail.flightOrder)} (${detail.flightOrder.reference}).`
              : `${detail.reservation.clientName} · ${formatKg(detail.reservation.kilos)} · ${routeLabel(detail.trip)} (${detail.reservation.trackingCode}).`
          }
          onClose={() => setPendingStatus(null)}
          onConfirm={async (note) => {
            await chat.changeStatus(pendingStatus, note);
            setPendingStatus(null);
          }}
        />
      )}
      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
      <Toast flash={flash} />
    </Layout>
  );
}
