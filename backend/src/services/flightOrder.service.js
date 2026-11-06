/**
 * Demandes d'achat de billets d'avion.
 * Le client configure son billet (passagers, options) et envoie une demande : une conversation s'ouvre
 * avec l'équipe MoveColis, qui confirme le prix, encaisse, achète le billet sur Aviasales puis l'envoie.
 */
import { withTransaction } from "../config/db.js";
import * as flightOrderModel from "../models/flightOrder.model.js";
import * as flightModel from "../models/flight.model.js";
import * as conversationModel from "../models/conversation.model.js";
import * as messageModel from "../models/message.model.js";
import * as userModel from "../models/user.model.js";
import * as flightService from "./flight.service.js";
import * as aviasales from "./aviasales.service.js";
import * as notificationService from "./notification.service.js";
import * as realtime from "../socket/realtime.js";
import {
  FLIGHT_MAX_PASSENGERS,
  FLIGHT_ORDER_NOTIFICATION_TITLES,
  FLIGHT_ORDER_STATUS_LABELS as LABELS,
  FLIGHT_ORDER_SYSTEM_MESSAGES,
  FLIGHT_ORDER_TRANSITIONS,
} from "../config/constants.js";
import { paths } from "../utils/hashid.js";
import { formatLocalDate } from "../utils/date.js";
import { formatMoney } from "../utils/money.js";
import { generateTrackingCode } from "../utils/trackingCode.js";
import { generateToken, hashToken } from "../utils/token.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../utils/AppError.js";

const plural = (count, word) => `${count} ${word}${count > 1 ? "s" : ""}`;

// "9 h 35"
const formatDuration = (minutes) =>
  minutes ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : null;

export const routeOf = (order) => `${order.flight.origin.name} → ${order.flight.destination.name}`;

export function passengersText({ adults, children, infants }) {
  return [plural(adults, "adulte"), children && plural(children, "enfant"), infants && plural(infants, "bébé")]
    .filter(Boolean)
    .join(", ");
}

// Vue admin : lien d'achat sur aviasales.ru (jamais montré au client)
export function withPurchaseUrl(order) {
  const { link, ...rest } = order;
  return { ...rest, purchaseUrl: aviasales.purchaseUrl(link) };
}

// Vue client : sans le lien d'achat Aviasales (le client paie le prix MoveColis)
export function forCustomer(order) {
  const { link: _link, gate: _gate, purchaseUrl: _purchaseUrl, agentId: _agentId, ...rest } = order;
  return rest;
}

// Premier message de la conversation, envoyé au nom du client
function firstMessage(order, offer) {
  const lines = [
    "Bonjour ! Je souhaite acheter ce billet d'avion :",
    `✈️ ${offer.origin.name} → ${offer.destination.name} · ${formatLocalDate(offer.departureAt)} à ${offer.departureAt.slice(11, 16)}`,
    [
      `${offer.airlineName} ${offer.airline} ${offer.flightNumber}`,
      offer.transfers ? plural(offer.transfers, "escale") : "vol direct",
      formatDuration(offer.durationMinutes),
    ].filter(Boolean).join(" · "),
    `Passagers : ${passengersText(order)}`,
  ];
  if (order.options.length) {
    lines.push(`Options : ${order.options.map((o) => (o.quantity > 1 ? `${o.label} × ${o.quantity}` : o.label)).join(", ")}`);
  }
  lines.push(`Total affiché : ${formatMoney(order.totalAmount, order.currency)}`);
  lines.push(`Nom : ${order.clientName} · Référence : ${order.reference}`);
  if (order.note) lines.push(`Note : ${order.note}`);
  return lines.join("\n");
}

/* ===================== Demande (client connecté ou visiteur) ===================== */

export async function createOrder(input, { user = null } = {}) {
  if (user && user.role !== "CLIENT") {
    throw forbidden("Les billets s'achètent avec un compte client ou sans compte.");
  }
  const passengers = { adults: input.adults, children: input.children, infants: input.infants };
  if (passengers.adults + passengers.children + passengers.infants > FLIGHT_MAX_PASSENGERS) {
    throw badRequest(`${FLIGHT_MAX_PASSENGERS} passagers au maximum par demande.`);
  }
  if (passengers.infants > passengers.adults) throw badRequest("Un bébé par adulte au maximum (sur les genoux).");

  const { offer, publicOffer } = await flightService.getAvailableOffer(input.offerId);
  const options = await flightModel.listOptions({ activeOnly: true });
  const { options: lines, totalAmount } = flightService.computeTotal(publicOffer, passengers, input.options, options);

  // Prix modifié depuis l'affichage (nouvelle réponse d'Aviasales, règle changée par l'admin) : le client valide à nouveau
  if (input.expectedTotal !== undefined && Math.abs(input.expectedTotal - totalAmount) > 0.009) {
    throw conflict(`Le prix vient d'être mis à jour : ${formatMoney(totalAmount, publicOffer.currency)}. Vérifiez puis renvoyez votre demande.`);
  }

  const adminIds = await userModel.listAdminIds();
  if (!adminIds.length) throw new AppError(503, "La vente de billets est momentanément indisponible.");
  const agentId = Math.min(...adminIds); // l'admin principal reçoit la conversation

  const order = {
    offerId: offer.id,
    clientId: user?.id ?? null,
    agentId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    note: input.note ?? null,
    origin: offer.origin,
    destination: offer.destination,
    originCity: publicOffer.origin.name,
    destinationCity: publicOffer.destination.name,
    originAirport: offer.originAirport,
    destinationAirport: offer.destinationAirport,
    departureAt: offer.departureAt,
    airline: offer.airline,
    airlineName: publicOffer.airlineName,
    flightNumber: offer.flightNumber,
    transfers: offer.transfers,
    durationMinutes: offer.durationMinutes,
    checkedBags: publicOffer.checkedBags,
    cabinKg: publicOffer.cabinKg,
    checkedBagKg: publicOffer.checkedBagKg,
    link: offer.link,
    gate: offer.gate,
    ...passengers,
    adultPrice: publicOffer.adultPrice,
    childPrice: publicOffer.childPrice,
    infantPrice: publicOffer.infantPrice,
    options: lines,
    totalAmount,
    currency: publicOffer.currency,
  };

  const created = await withTransaction(async (db) => {
    // Référence unique : nouvel essai en cas de collision (rarissime)
    let orderId = null;
    for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
      order.reference = generateTrackingCode(new Date(), "BA");
      orderId = await flightOrderModel.create(order, db);
    }
    if (!orderId) throw new AppError(503, "Réessayez dans un instant.");

    // Conversation : le visiteur y accède avec un jeton secret, dont on ne garde que l'empreinte
    const guestToken = user ? null : generateToken();
    const conversationId = await conversationModel.create(
      { flightOrderId: orderId, guestTokenHash: guestToken ? hashToken(guestToken) : null },
      db
    );
    await messageModel.create(
      { conversationId, senderType: "CUSTOMER", senderId: user?.id ?? null, body: firstMessage(order, publicOffer) },
      db
    );
    return { orderId, conversationId, guestToken };
  });

  // Tous les admins sont prévenus ; la page « Billets d'avion » se met à jour en direct
  await notificationService.notifySafely(adminIds, {
    type: "FLIGHT_ORDER",
    title: "Demande de billet ✈️",
    body: `${order.clientName} · ${order.originCity} → ${order.destinationCity} · ${passengersText(order)} · ${formatMoney(totalAmount, order.currency)}`,
    link: paths.conversation(created.conversationId),
    groupKey: notificationService.conversationGroup(created.conversationId),
  });
  realtime.notifyInbox({ conversationId: created.conversationId, ownerId: agentId, clientId: user?.id });
  realtime.emitToAdmins("flight-orders:updated", {});

  const saved = await flightOrderModel.findById(created.orderId);
  return { flightOrder: forCustomer(saved), conversationId: created.conversationId, guestToken: created.guestToken };
}

/* ===================== Administration ===================== */

export async function listOrders(filters) {
  const [result, counts] = await Promise.all([flightOrderModel.list(filters), flightOrderModel.countByStatus()]);
  return { items: result.items.map(withPurchaseUrl), total: result.total, counts, limit: filters.limit, offset: filters.offset };
}

/**
 * Change le statut d'une demande en respectant le workflow, poste un message automatique
 * dans la conversation et prévient le client.
 *  - onlyFromStatuses : statuts de départ autorisés (le client n'annule qu'une demande « À traiter »)
 *  - cancelledBy      : précision ajoutée au message d'annulation ("par le client")
 */
export async function updateStatus(id, nextStatus, { actorId = null, note = null, onlyFromStatuses = null, cancelledBy = null } = {}) {
  if (!FLIGHT_ORDER_TRANSITIONS[nextStatus]) throw badRequest("Statut inconnu pour une demande de billet.");

  const { updated, messages } = await withTransaction(async (db) => {
    const current = await flightOrderModel.findByIdForUpdate(id, db);
    if (!current) throw notFound("Demande de billet introuvable.");
    if (onlyFromStatuses && !onlyFromStatuses.includes(current.status)) {
      throw conflict(`Demande déjà « ${LABELS[current.status]} » : écrivez à l'équipe MoveColis dans la conversation.`);
    }
    const allowed = FLIGHT_ORDER_TRANSITIONS[current.status];
    if (!allowed.includes(nextStatus)) {
      const possible = allowed.map((s) => `« ${LABELS[s]} »`).join(", ") || "aucun (statut final)";
      throw conflict(`Impossible de passer de « ${LABELS[current.status]} » à « ${LABELS[nextStatus]} ». Possible : ${possible}.`);
    }

    await flightOrderModel.updateStatus(id, nextStatus, db);
    let text = FLIGHT_ORDER_SYSTEM_MESSAGES[nextStatus];
    if (nextStatus === "CANCELLED" && cancelledBy) text = text.replace(/\.$/, ` ${cancelledBy}.`);
    if (note) text += ` — ${note}`;
    const systemMessages = await messageModel.createSystemForFlightOrder(id, text, db);
    return { updated: await flightOrderModel.findById(id, db), messages: systemMessages };
  });

  // Client (s'il a un compte) et admin qui traite la demande, sauf l'auteur du changement
  const recipients = [updated.clientId, updated.agentId].filter((userId) => userId && userId !== actorId);
  if (updated.conversationId && recipients.length) {
    let title = FLIGHT_ORDER_NOTIFICATION_TITLES[nextStatus];
    if (nextStatus === "CANCELLED" && cancelledBy) title = `Demande de billet annulée ${cancelledBy}`;
    await notificationService.notifySafely(recipients, {
      type: "FLIGHT_ORDER_STATUS",
      title,
      body: `${updated.reference} · ${routeOf(updated)} · ${formatLocalDate(updated.flight.departureAt)}${note ? ` — ${note}` : ""}`,
      link: paths.conversation(updated.conversationId),
      groupKey: notificationService.conversationGroup(updated.conversationId),
    });
  }

  realtime.publishMessages(messages, { ownerId: updated.agentId, clientId: updated.clientId });
  if (updated.conversationId) {
    realtime.emitToConversation(updated.conversationId, "flight-order:updated", {
      conversationId: updated.conversationId,
      flightOrder: { id: updated.id, status: updated.status },
    });
  }
  realtime.emitToAdmins("flight-orders:updated", {});
  return withPurchaseUrl(updated);
}
