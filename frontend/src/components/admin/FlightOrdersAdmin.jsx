import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CreditCard, ExternalLink, Mail, MessageCircle, PlaneTakeoff, Search, X } from "lucide-react";
import ReservationStatusModal from "../ReservationStatusModal";
import QuoteFlightModal from "./QuoteFlightModal";
import SendTicketModal from "./SendTicketModal";
import LiveRequestLine from "../flights/LiveRequestLine";
import { PassengerList } from "../flights/Passengers";
import { Badge, ChipRow, ErrorState, FilterChip, LoadMore, Loader, Toast, btnDanger, btnOutline, btnPrimary, btnSm } from "../ui";
import { adminApi } from "../../api/admin";
import { errorMessage } from "../../api/client";
import { usePaginated } from "../../hooks/useApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useFlash } from "../../hooks/useFlash";
import { useSocketEvent } from "../../hooks/useSocketEvent";
import { formatDateTime, formatKg, formatMoney, formatPhone, timeAgo } from "../../lib/format";
import {
  flightNameLabel, orderBaggageLabel, orderLegs, orderTimesLabel, passengersLabel, removedBagsLabel, flightRouteLabel, stopsLabel,
} from "../../lib/flights";
import { paths } from "../../lib/hashid";
import { CANCELLABLE_FLIGHT_ORDER_STATUSES, FLIGHT_ORDER_STATUS, NEXT_FLIGHT_ORDER_STEP } from "../../lib/status";

const STATUS_FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "PENDING", label: "À traiter" },
  { key: "PAID", label: "Payées" },
  { key: "ISSUED", label: "Billets émis" },
  { key: "CANCELLED", label: "Annulées" },
];

function OrderCard({ order, onAction, onQuote, onSendPaymentInfo, sendingPaymentInfo }) {
  const { flight } = order;
  const roundTrip = Boolean(order.returnFlight);
  const legs = orderLegs(order); // aller (et retour), chacun avec ses valises
  const status = FLIGHT_ORDER_STATUS[order.status];
  const next = NEXT_FLIGHT_ORDER_STEP[order.status];
  const open = CANCELLABLE_FLIGHT_ORDER_STATUSES.includes(order.status);
  // Vol choisi en direct : l'équipe confirme le vol et le prix avant le paiement
  const awaitingQuote = order.awaitingQuote;
  const canQuote = Boolean(order.liveRequest) && order.status === "PENDING";

  return (
    <div className="border border-line-light rounded-2xl bg-white p-4">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="font-extrabold text-[15px]">
            {flightRouteLabel(flight.origin.name, flight.destination.name, roundTrip)}
            {!roundTrip && ` · ${orderTimesLabel(order, flight)}`}
          </div>
          {/* Aller-retour : une ligne par vol */}
          {roundTrip &&
            legs.map((leg) => (
              <div key={leg.leg} className="text-[13px] font-bold">
                <span className="text-primary">{leg.label}</span> · {orderTimesLabel(order, leg.flight)}
              </div>
            ))}
          <div className="text-xs text-muted">
            <span className="font-mono font-bold text-ink">{order.reference}</span> · demande {timeAgo(order.createdAt)}
            {order.liveRequest && <span className="text-primary font-bold"> · vol choisi en direct</span>}
          </div>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="text-[13px] text-muted mt-2 flex flex-col gap-0.5">
        <div>
          Client <b className="text-ink">{order.clientName}</b>
          {order.isGuest ? " (visiteur)" : ""} · {formatPhone(order.clientPhone)}
          {order.clientEmail && ` · ${order.clientEmail}`}
        </div>
        <LiveRequestLine order={order} />
        {awaitingQuote && (
          <div className="text-ink font-semibold">
            ⏳ Vol et prix à confirmer : retrouvez le vol, puis « Confirmer le vol et le prix ».
          </div>
        )}
        {!awaitingQuote && legs.map((leg) => (
          <div key={leg.leg}>
            {leg.label && `${leg.label} : `}
            {leg.leg === "OUTBOUND" && `${flightNameLabel(flight)} · `}
            {stopsLabel(leg.flight.transfers, leg.flight.stops)} · {orderBaggageLabel(leg)}
            {leg.leg === "OUTBOUND" && order.gate && ` · prix trouvé chez ${order.gate}`}
          </div>
        ))}
        {legs
          .filter((leg) => leg.bags.freedKilos > 0)
          .map((leg) => (
            <div key={leg.leg} className="text-ink font-semibold">
              🧳 {removedBagsLabel(leg.bags.removed)}
              {leg.label && ` (${leg.label.toLowerCase()})`} (−{formatMoney(leg.bags.discount, order.currency)}) :{" "}
              {formatKg(leg.bags.freedKilos)} libérés pour MoveColis
            </div>
          ))}
        {order.status === "PENDING" && order.paymentInfoSentAt && (
          <div className="text-ink font-semibold">
            💳 Numéros de paiement envoyés {timeAgo(order.paymentInfoSentAt)} : en attente de la capture du client
          </div>
        )}
        {order.receiptSentAt && (
          <div className="text-success font-semibold">
            📧 Billet envoyé à {order.receiptEmail} le {formatDateTime(order.receiptSentAt)}
          </div>
        )}
        <div>
          {passengersLabel(order)}
          {order.options.length > 0 &&
            ` · ${order.options.map((o) => (o.quantity > 1 ? `${o.label} × ${o.quantity}` : o.label)).join(", ")}`}
        </div>
        <PassengerList passengers={order.passengers} />
        {order.note && <div className="text-ink">📝 {order.note}</div>}
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2.5 mt-3">
        <div className="text-[17px] font-extrabold">
          {awaitingQuote ? <span className="text-muted">Prix à confirmer</span> : formatMoney(order.totalAmount, order.currency)}
        </div>
        <div className="flex gap-2 flex-wrap">
          {order.conversationId && (
            <Link to={paths.conversation(order.conversationId)} className={`${btnOutline} ${btnSm}`}>
              <MessageCircle size={15} /> Conversation
              {order.unreadCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
                  {order.unreadCount}
                </span>
              )}
            </Link>
          )}
          {open && order.purchaseUrl && (
            <a href={order.purchaseUrl} target="_blank" rel="noopener noreferrer" className={`${btnOutline} ${btnSm}`}>
              <ExternalLink size={15} /> {order.liveRequest ? "Rechercher sur Aviasales" : "Acheter sur Aviasales"}
            </a>
          )}
          {canQuote && (
            <button type="button" onClick={() => onQuote(order)} className={`${awaitingQuote ? btnPrimary : btnOutline} ${btnSm}`}>
              <PlaneTakeoff size={15} /> {awaitingQuote ? "Confirmer le vol et le prix" : "Modifier le vol et le prix"}
            </button>
          )}
          {/* Étape avant « Paiement reçu » : numéros de paiement envoyés dans la conversation */}
          {order.status === "PENDING" && !awaitingQuote && (
            <button type="button" onClick={() => onSendPaymentInfo(order)} disabled={sendingPaymentInfo}
              className={`${btnOutline} ${btnSm}`}>
              <CreditCard size={15} />
              {sendingPaymentInfo
                ? "Envoi…"
                : order.paymentInfoSentAt ? "Renvoyer le numéro de paiement" : "Envoyer le numéro de paiement"}
            </button>
          )}
          {next && !awaitingQuote && (
            <button type="button" onClick={() => onAction(order, next.status)} className={`${btnPrimary} ${btnSm}`}>
              <Check size={15} /> {next.action}
            </button>
          )}
          {order.status === "ISSUED" && (
            <button type="button" onClick={() => onAction(order, "ISSUED")} className={`${btnOutline} ${btnSm}`}>
              <Mail size={15} /> Renvoyer le billet
            </button>
          )}
          {open && (
            <button type="button" onClick={() => onAction(order, "CANCELLED")} className={`${btnDanger} ${btnSm}`}>
              <X size={15} /> Annuler
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Onglet « Demandes » : les demandes d'achat à traiter ===== */
export default function FlightOrdersAdmin() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim());
  const orders = usePaginated(
    (page) => adminApi.listFlightOrders({ status: filter === "all" ? undefined : filter, q: search || undefined, ...page }),
    [filter, search]
  );
  const [pending, setPending] = useState(null); // { order, status }
  const [quoting, setQuoting] = useState(null); // demande en direct dont on confirme le vol et le prix
  const [sendingPaymentFor, setSendingPaymentFor] = useState(null); // id de la demande en cours d'envoi
  const [flash, showFlash] = useFlash();

  // Numéros de paiement (réglages) envoyés au client dans la conversation de la demande
  async function sendPaymentInfo(order) {
    setSendingPaymentFor(order.id);
    try {
      const updated = await adminApi.sendFlightPaymentInfo(order.id);
      orders.setItems((items) => items.map((o) => (o.id === updated.id ? updated : o)));
      showFlash(`Numéros de paiement envoyés à ${updated.clientName} dans la conversation.`);
    } catch (err) {
      showFlash(errorMessage(err), "danger");
    } finally {
      setSendingPaymentFor(null);
    }
  }

  // Nouvelle demande ou changement de statut (ailleurs) : on rafraîchit, une fois le calme revenu
  const timer = useRef(null);
  useSocketEvent("flight-orders:updated", () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(orders.reload, 500);
  });

  const counts = orders.meta?.counts ?? {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <div className="flex items-center gap-2.5 border border-line rounded-full py-2 pl-4 pr-2 bg-white mb-3 max-w-md">
        <Search size={17} className="text-muted shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Référence, client ou ville"
          aria-label="Rechercher une demande"
          className="flex-1 min-w-0 outline-none text-sm font-medium bg-transparent py-1"
        />
      </div>

      <ChipRow>
        {STATUS_FILTERS.map((f) => (
          <FilterChip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
            {(f.key === "all" ? total : counts[f.key]) > 0 && (
              <span className="opacity-70">{f.key === "all" ? total : counts[f.key]}</span>
            )}
          </FilterChip>
        ))}
      </ChipRow>

      {orders.error && <ErrorState error={orders.error} onRetry={orders.reload} />}
      {orders.loading && orders.items.length === 0 ? (
        <Loader />
      ) : orders.items.length === 0 ? (
        <p className="text-center text-muted text-sm py-10">
          Aucune demande {filter !== "all" ? "dans cette catégorie" : "pour l'instant"}. Elles arrivent ici (et dans la
          messagerie) dès qu'un client envoie une demande d'achat.
        </p>
      ) : (
        <div className={`flex flex-col gap-3 pb-4 transition-opacity ${orders.loading ? "opacity-60" : ""}`}>
          {orders.items.map((order) => (
            <OrderCard key={order.id} order={order} onAction={(o, status) => setPending({ order: o, status })} onQuote={setQuoting}
              onSendPaymentInfo={sendPaymentInfo} sendingPaymentInfo={sendingPaymentFor === order.id} />
          ))}
        </div>
      )}
      <LoadMore hasMore={orders.hasMore} loading={orders.loadingMore} onClick={orders.loadMore} />

      {quoting && (
        <QuoteFlightModal
          order={quoting}
          onClose={() => setQuoting(null)}
          onSaved={(updated) => {
            orders.setItems((items) => items.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
            setQuoting(null);
            showFlash(`Vol et prix confirmés à ${updated.clientName} : envoyez-lui maintenant le numéro de paiement.`);
          }}
        />
      )}

      {/* « Billet émis » (ou nouvel envoi) : le billet part par e-mail */}
      {pending?.status === "ISSUED" && (
        <SendTicketModal
          order={pending.order}
          onClose={() => setPending(null)}
          onSent={(updated) => {
            orders.setItems((items) => items.map((o) => (o.id === updated.id ? updated : o)));
            setPending(null);
            showFlash(`Billet ${updated.reference} envoyé à ${updated.receiptEmail}.`);
          }}
        />
      )}
      {pending && pending.status !== "ISSUED" && (
        <ReservationStatusModal
          variant="flight"
          nextStatus={pending.status}
          summary={`${pending.order.clientName} · ${flightRouteLabel(pending.order.flight.origin.name, pending.order.flight.destination.name, Boolean(pending.order.returnFlight))} · ${passengersLabel(pending.order)} (${pending.order.reference}).`}
          onClose={() => setPending(null)}
          onConfirm={async (note) => {
            const updated = await adminApi.updateFlightOrderStatus(pending.order.id, pending.status, note);
            orders.setItems((items) => items.map((o) => (o.id === updated.id ? updated : o)));
            setPending(null);
            showFlash(`Demande ${updated.reference} : ${FLIGHT_ORDER_STATUS[updated.status].label}.`);
          }}
        />
      )}
      <Toast flash={flash} />
    </>
  );
}
