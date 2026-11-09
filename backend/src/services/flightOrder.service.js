/**
 * Demandes d'achat de billets d'avion.
 * Le client configure son billet (passagers, valises, options) et envoie une demande : une conversation s'ouvre
 * avec l'équipe MoveColis, qui confirme le prix, encaisse, achète le billet sur Aviasales puis l'envoie par e-mail.
 * Les valises retirées par le client libèrent des kilos que MoveColis peut revendre (voyage publié par l'admin).
 */
import { withTransaction } from "../config/db.js";
import { env, isDev } from "../config/env.js";
import * as flightOrderModel from "../models/flightOrder.model.js";
import * as flightModel from "../models/flight.model.js";
import * as conversationModel from "../models/conversation.model.js";
import * as messageModel from "../models/message.model.js";
import * as userModel from "../models/user.model.js";
import * as flightService from "./flight.service.js";
import * as aviasales from "./aviasales.service.js";
import * as notificationService from "./notification.service.js";
import * as mailService from "./mail.service.js";
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
import { formatKilos, formatMoney } from "../utils/money.js";
import { generateTrackingCode } from "../utils/trackingCode.js";
import { generateToken, hashToken } from "../utils/token.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../utils/AppError.js";

const plural = (count, word) => `${count} ${word}${count > 1 ? "s" : ""}`;

// "9 h 35"
const formatDuration = (minutes) =>
  minutes ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : null;

export const routeOf = (order) => `${order.flight.origin.name} → ${order.flight.destination.name}`;

// "vol direct", "escale à Doha", "2 escales : Istanbul, Nice" (code de l'aéroport si la ville est inconnue)
export function stopsText(transfers, stops = []) {
  if (!transfers) return "vol direct";
  const names = stops.map((stop) => stop.name ?? stop.code);
  if (!names.length) return plural(transfers, "escale");
  return transfers === 1 ? `escale à ${names[0]}` : `${plural(transfers, "escale")} : ${names.join(", ")}`;
}

// "14:55" ou "14:55 (+1 j)" : heure locale d'arrivée, et jours après le départ
export function arrivalText(departureAt, arrivalAt) {
  if (!arrivalAt) return null;
  const days = Math.round((Date.parse(`${arrivalAt.slice(0, 10)}T00:00Z`) - Date.parse(`${departureAt.slice(0, 10)}T00:00Z`)) / 86_400_000);
  return `${arrivalAt.slice(11, 16)}${days > 0 ? ` (+${days} j)` : ""}`;
}

export function passengersText({ adults, children, infants }) {
  return [plural(adults, "adulte"), children && plural(children, "enfant"), infants && plural(infants, "bébé")]
    .filter(Boolean)
    .join(", ");
}

// "1 valise retirée", "2 valises retirées"
const removedBagsText = (count) => `${count} valise${count > 1 ? "s" : ""} retirée${count > 1 ? "s" : ""}`;

// "Cabine 7 kg · 1 valise en soute de 23 kg (1 retirée)"
export function bagsText({ flight, bags }) {
  const cabin =
    flight.cabinKg === null ? "Bagage cabine inclus" : flight.cabinKg > 0 ? `Cabine ${flight.cabinKg} kg` : "Sans bagage cabine";
  const hold = bags.kept > 0 ? `${plural(bags.kept, "valise")} en soute de ${flight.checkedBagKg} kg` : "sans valise en soute";
  const removed = bags.removed > 0 ? ` (${bags.removed} retirée${bags.removed > 1 ? "s" : ""})` : "";
  return `${cabin} · ${hold}${removed}`;
}

// Vue admin : lien d'achat sur aviasales.ru (jamais montré au client)
export function withPurchaseUrl(order) {
  const { link, ...rest } = order;
  return { ...rest, purchaseUrl: aviasales.purchaseUrl(link) };
}

// Vue client : sans le lien d'achat Aviasales ni ce que MoveColis fait des kilos libérés
export function forCustomer(order) {
  const {
    link: _link, gate: _gate, purchaseUrl: _purchaseUrl, agentId: _agentId, kilosTripId: _kilosTripId, ...rest
  } = order;
  return rest;
}

// Premier message de la conversation, envoyé au nom du client
function firstMessage(order, offer) {
  const lines = [
    "Bonjour ! Je souhaite acheter ce billet d'avion :",
    `✈️ ${offer.origin.name} → ${offer.destination.name} · ${formatLocalDate(offer.departureAt)} à ${offer.departureAt.slice(11, 16)}` +
      (offer.arrivalAt ? `, arrivée à ${arrivalText(offer.departureAt, offer.arrivalAt)}` : ""),
    [
      `${offer.airlineName} ${offer.airline} ${offer.flightNumber}`,
      stopsText(offer.transfers, offer.stops),
      formatDuration(offer.durationMinutes),
    ].filter(Boolean).join(" · "),
    `Passagers : ${passengersText(order)}`,
  ];
  if (order.bags.included > 0) {
    const removed = order.bags.removed
      ? ` (${removedBagsText(order.bags.removed)} : −${formatMoney(order.bags.discount, order.currency)})`
      : "";
    lines.push(`Valises en soute : ${order.bags.kept} sur ${order.bags.included} incluses${removed}`);
  }
  if (order.options.length) {
    lines.push(`Options : ${order.options.map((o) => (o.quantity > 1 ? `${o.label} × ${o.quantity}` : o.label)).join(", ")}`);
  }
  lines.push(`Total affiché : ${formatMoney(order.totalAmount, order.currency)}`);
  lines.push(`Nom : ${order.clientName} · E-mail : ${order.clientEmail} · Référence : ${order.reference}`);
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
  const { options: lines, bags, totalAmount } = flightService.computeTotal(
    publicOffer, passengers, input.options, options, input.checkedBags
  );

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
    clientEmail: input.clientEmail,
    note: input.note ?? null,
    origin: offer.origin,
    destination: offer.destination,
    originCity: publicOffer.origin.name,
    destinationCity: publicOffer.destination.name,
    originAirport: offer.originAirport,
    destinationAirport: offer.destinationAirport,
    departureAt: offer.departureAt,
    arrivalAt: offer.arrivalAt,
    airline: offer.airline,
    airlineName: publicOffer.airlineName,
    flightNumber: offer.flightNumber,
    transfers: offer.transfers,
    stops: publicOffer.stops,
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
    bags,
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
  const freed = bags.freedKilos > 0 ? ` · ${removedBagsText(bags.removed)} (${formatKilos(bags.freedKilos)} libérés)` : "";
  await notificationService.notifySafely(adminIds, {
    type: "FLIGHT_ORDER",
    title: "Demande de billet ✈️",
    body: `${order.clientName} · ${order.originCity} → ${order.destinationCity} · ${passengersText(order)} · ${formatMoney(totalAmount, order.currency)}${freed}`,
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
 *  - ticketSentTo     : « Billet émis » n'est possible qu'après l'envoi du billet par e-mail (sendTicket)
 */
export async function updateStatus(
  id,
  nextStatus,
  { actorId = null, note = null, onlyFromStatuses = null, cancelledBy = null, ticketSentTo = null } = {}
) {
  if (!FLIGHT_ORDER_TRANSITIONS[nextStatus]) throw badRequest("Statut inconnu pour une demande de billet.");
  if (nextStatus === "ISSUED" && !ticketSentTo) {
    throw badRequest("Le billet est marqué émis en l'envoyant au client par e-mail (bouton « Billet émis »).");
  }

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
    if (ticketSentTo) {
      systemMessages.push(
        ...(await messageModel.createSystemForFlightOrder(id, `📧 Billet et reçu envoyés par e-mail à ${ticketSentTo}.`, db))
      );
    }
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

/* ===================== Envoi du billet par e-mail ===================== */

// Lignes du reçu : vol, passagers, bagages
function ticketDetails(order) {
  const { flight } = order;
  return [
    ["Référence", order.reference],
    ["Vol", `${routeOf(order)} · ${formatLocalDate(flight.departureAt)} à ${flight.departureAt.slice(11, 16)} (heure locale)`],
    ...(flight.arrivalAt ? [["Arrivée", `${formatLocalDate(flight.arrivalAt)} à ${flight.arrivalAt.slice(11, 16)} (heure locale)`]] : []),
    [
      "Compagnie",
      [
        `${flight.airlineName ?? flight.airline} ${flight.airline} ${flight.flightNumber}`,
        stopsText(flight.transfers, flight.stops),
        formatDuration(flight.durationMinutes),
      ].filter(Boolean).join(" · "),
    ],
    ["Passagers", `${passengersText(order)} · ${order.clientName}`],
    ["Bagages", bagsText(order)],
  ];
}

// Détail du prix payé (mêmes lignes que la page du billet)
function ticketPriceLines(order) {
  const money = (amount) => formatMoney(amount, order.currency);
  const lines = [];
  const passengers = (count, word, price) => {
    if (count > 0) lines.push([`${plural(count, word)} × ${money(price)}`, money(count * price)]);
  };
  passengers(order.adults, "adulte", order.adultPrice);
  passengers(order.children, "enfant", order.childPrice);
  passengers(order.infants, "bébé", order.infantPrice);
  if (order.bags.discount > 0) lines.push([removedBagsText(order.bags.removed), `−${money(order.bags.discount)}`]);
  for (const option of order.options) {
    lines.push([option.quantity > 1 ? `${option.label} × ${option.quantity}` : option.label, money(option.amount)]);
  }
  return lines;
}

/**
 * Envoie au client son billet (pièces jointes) et le reçu détaillé par e-mail.
 *  - demande « Payée »       : envoi puis passage à « Billet émis »
 *  - demande « Billet émis » : nouvel envoi (adresse corrigée, e-mail perdu…)
 * attachments : [{ filename, contentType, data (base64) }]
 */
export async function sendTicket(id, { email, note = null, attachments = [] }, { actorId }) {
  const order = await flightOrderModel.findById(id);
  if (!order) throw notFound("Demande de billet introuvable.");
  if (order.status === "PENDING") {
    throw conflict("Enregistrez d'abord le paiement : le billet s'envoie quand la demande est « Payée ».");
  }
  if (order.status === "CANCELLED") throw conflict("Cette demande est annulée.");
  if (!mailService.isMailConfigured() && !isDev) {
    throw new AppError(503, "L'envoi d'e-mails n'est pas configuré sur le serveur (SMTP) : le billet ne peut pas partir.");
  }

  try {
    await mailService.sendFlightTicket({
      to: email,
      clientName: order.clientName,
      route: routeOf(order),
      details: ticketDetails(order),
      priceLines: ticketPriceLines(order),
      total: formatMoney(order.totalAmount, order.currency),
      note,
      attachments: attachments.map((file) => ({
        filename: file.filename,
        contentType: file.contentType,
        content: Buffer.from(file.data, "base64"),
      })),
      url: `${env.appUrl}${paths.conversation(order.conversationId)}`,
    });
  } catch (err) {
    console.error("[billets] envoi du billet par e-mail", err);
    throw new AppError(502, `Le billet n'est pas parti. ${mailService.describeMailError(err)}`);
  }
  await flightOrderModel.markTicketSent(id, email);

  if (order.status === "PAID") return updateStatus(id, "ISSUED", { actorId, note, ticketSentTo: email });

  // Nouvel envoi d'un billet déjà émis : visible dans la conversation, le client est prévenu
  const messages = await messageModel.createSystemForFlightOrder(
    id,
    `📧 Billet renvoyé par e-mail à ${email}.${note ? ` — ${note}` : ""}`
  );
  if (order.clientId && order.clientId !== actorId) {
    await notificationService.notifySafely([order.clientId], {
      type: "FLIGHT_ORDER_STATUS",
      title: "Billet renvoyé par e-mail 📧",
      body: `${order.reference} · ${routeOf(order)} · envoyé à ${email}`,
      link: paths.conversation(order.conversationId),
      groupKey: notificationService.conversationGroup(order.conversationId),
    });
  }
  realtime.publishMessages(messages, { ownerId: order.agentId, clientId: order.clientId });
  realtime.emitToAdmins("flight-orders:updated", {});
  return withPurchaseUrl(await flightOrderModel.findById(id));
}

/* ===================== Kilos libérés par les valises retirées ===================== */

// Les kilos ne sont revendables qu'une fois le billet payé (le client peut encore annuler avant)
const KILOS_SELLABLE_STATUSES = ["PAID", "ISSUED"];

/**
 * État des kilos libérés d'une demande :
 *  WAITING_PAYMENT (billet pas encore payé) · AVAILABLE (à publier) · PUBLISHED (voyage en ligne) · CANCELLED
 */
function kilosState(item) {
  if (item.status === "CANCELLED") return "CANCELLED";
  if (item.trip && item.trip.status !== "CANCELLED") return "PUBLISHED";
  return KILOS_SELLABLE_STATUSES.includes(item.status) ? "AVAILABLE" : "WAITING_PAYMENT";
}

const toKilosView = (item) => ({ ...withPurchaseUrl(item), kilosState: kilosState(item) });

/** Espace « Kilos disponibles » de l'admin, vol par vol */
export async function listFreedKilos({ period }) {
  const items = (await flightOrderModel.listFreedKilos({ period })).map(toKilosView);
  const sum = (state) =>
    items.filter((i) => i.kilosState === state && !i.hasDeparted).reduce((total, i) => total + i.bags.freedKilos, 0);
  return { items, summary: { available: sum("AVAILABLE"), waiting: sum("WAITING_PAYMENT"), published: sum("PUBLISHED") } };
}

export async function getFreedKilos(id) {
  const item = await flightOrderModel.findFreedKilos(id);
  if (!item) throw notFound("Aucun kilo libéré sur cette demande de billet.");
  // Demande antérieure aux villes d'escale : seuls les aéroports sont connus, on retrouve les villes (formulaire pré-rempli)
  if (item.flight.stops.some((stop) => !stop.name)) {
    item.flight.stops = await aviasales.stopCities(item.flight.stops.flatMap((stop) => stop.airports));
  }
  return toKilosView(item);
}

/** Vérifie, dans la transaction de publication du voyage, que ces kilos peuvent être mis en vente */
export async function assertKilosPublishable(orderId, db) {
  const order = await flightOrderModel.findFreedKilosForUpdate(orderId, db);
  if (!order || !(order.bags.freedKilos > 0)) throw notFound("Aucun kilo libéré sur cette demande de billet.");
  if (order.status === "CANCELLED") throw conflict("La demande de billet est annulée : ces kilos ne sont plus disponibles.");
  if (!KILOS_SELLABLE_STATUSES.includes(order.status)) {
    throw conflict("Le billet n'est pas encore payé : ces kilos seront disponibles après le paiement.");
  }
  if (order.hasDeparted) throw conflict("Ce vol est déjà parti.");
  if (order.kilosTripId && order.tripStatus !== "CANCELLED") throw conflict("Ces kilos sont déjà publiés dans un voyage.");
  return order;
}

export async function linkKilosTrip(orderId, tripId, db) {
  await flightOrderModel.linkKilosTrip(orderId, tripId, db);
}
