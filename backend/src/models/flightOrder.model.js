import { pool } from "../config/db.js";
import { likePattern } from "../utils/sql.js";
import { toLocalIso } from "../utils/date.js";

// Demande + id de conversation + messages non lus de l'admin qui la traite
const SELECT_COLUMNS = `
  f.*,
  c.id AS conversation_id,
  (SELECT COUNT(*) FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_type = 'CUSTOMER'
      AND m.created_at > COALESCE(c.owner_last_read_at, '-infinity')) AS unread_count`;

const FROM_JOINS = `
  FROM flight_orders f
  LEFT JOIN conversations c ON c.flight_order_id = f.id`;

/**
 * Vol retour d'un aller-retour, mêmes champs que l'aller : villes inversées, même compagnie et mêmes bagages.
 * Aviasales ne donne pas le numéro du vol retour (flightNumber null).
 */
function toReturnFlight(row) {
  if (!row.return_at) return null;
  return {
    origin: { code: row.destination, name: row.destination_city },
    destination: { code: row.origin, name: row.origin_city },
    originAirport: row.return_origin_airport,
    destinationAirport: row.return_destination_airport,
    departureAt: toLocalIso(row.return_at),
    arrivalAt: row.return_arrival_at ? toLocalIso(row.return_arrival_at) : null,
    airline: row.airline,
    airlineName: row.airline_name,
    flightNumber: null,
    transfers: row.return_transfers ?? 0,
    stops: row.return_stops ?? [],
    durationMinutes: row.return_duration_minutes,
    checkedBags: row.checked_bags,
    cabinKg: row.cabin_kg,
    checkedBagKg: row.checked_bag_kg,
  };
}

export function toFlightOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    offerId: row.offer_id,
    clientId: row.client_id,
    agentId: row.agent_id,
    isGuest: row.client_id === null, // demande faite par un visiteur (sans compte)
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    note: row.note,
    // [{ type, fullName, gender, birthDate, nationality, nationalityName, passportNumber }] ([] : demande ancienne)
    passengers: row.passengers ?? [],
    flight: {
      origin: { code: row.origin, name: row.origin_city },
      destination: { code: row.destination, name: row.destination_city },
      originAirport: row.origin_airport,
      destinationAirport: row.destination_airport,
      departureAt: toLocalIso(row.departure_at),
      arrivalAt: row.arrival_at ? toLocalIso(row.arrival_at) : null, // heure locale (null = non précisée)
      airline: row.airline,
      airlineName: row.airline_name,
      flightNumber: row.flight_number,
      transfers: row.transfers,
      stops: row.stops ?? [], // [{ code, name, airports }] villes d'escale (name null : demande ancienne)
      durationMinutes: row.duration_minutes,
      checkedBags: row.checked_bags, // incluses par passager (hors bébés)
      cabinKg: row.cabin_kg,
      checkedBagKg: row.checked_bag_kg,
    },
    // Valises en soute de la demande : gardées / incluses, réduction, kilos libérés pour MoveColis
    bags: {
      included: row.bags_included,
      kept: row.bags_kept,
      removed: row.bags_included - row.bags_kept,
      refund: row.bag_refund,
      discount: row.bag_discount,
      freedKilos: row.freed_kilos,
    },
    kilosTripId: row.kilos_trip_id,
    // Aller-retour : le vol retour (null : aller simple), ses valises et le voyage publié avec ses kilos
    tripType: row.return_at ? "ROUND_TRIP" : "ONE_WAY",
    returnFlight: toReturnFlight(row),
    returnBags: row.return_at
      ? {
          included: row.return_bags_included,
          kept: row.return_bags_kept,
          removed: row.return_bags_included - row.return_bags_kept,
          refund: row.bag_refund,
          discount: row.return_bag_discount,
          freedKilos: row.return_freed_kilos,
        }
      : null,
    returnKilosTripId: row.return_kilos_trip_id ?? null,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    adultPrice: row.adult_price,
    childPrice: row.child_price,
    infantPrice: row.infant_price,
    options: row.options,
    totalAmount: row.total_amount,
    currency: row.currency,
    status: row.status,
    paymentInfoSentAt: row.payment_info_sent_at, // dernier envoi des numéros de paiement au client
    receiptEmail: row.receipt_email,
    receiptSentAt: row.receipt_sent_at,
    link: row.link, // chemin aviasales.ru : l'URL complète est construite par le service
    gate: row.gate, // agence qui vendait ce prix sur Aviasales
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.conversation_id !== undefined && { conversationId: row.conversation_id }),
    ...(row.unread_count !== undefined && { unreadCount: row.unread_count }),
  };
}

/** Création. Renvoie l'id, ou null si la référence existe déjà (nouvel essai avec une autre). */
export async function create(order, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO flight_orders (
       reference, offer_id, client_id, agent_id, client_name, client_phone, note,
       origin, destination, origin_city, destination_city, origin_airport, destination_airport, departure_at,
       airline, airline_name, flight_number, transfers, duration_minutes, checked_bags, cabin_kg, checked_bag_kg, link, gate,
       adults, children, infants, adult_price, child_price, infant_price, options, total_amount, currency,
       client_email, bags_included, bags_kept, bag_refund, bag_discount, freed_kilos, arrival_at, stops, passengers,
       return_at, return_arrival_at, return_origin_airport, return_destination_airport, return_transfers, return_stops,
       return_duration_minutes, return_bags_included, return_bags_kept, return_bag_discount, return_freed_kilos)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31::jsonb, $32, $33,
             $34, $35, $36, $37, $38, $39, $40, $41::jsonb, $42::jsonb,
             $43, $44, $45, $46, $47, $48::jsonb, $49, $50, $51, $52, $53)
     ON CONFLICT (reference) DO NOTHING
     RETURNING id`,
    [
      order.reference, order.offerId, order.clientId ?? null, order.agentId, order.clientName, order.clientPhone,
      order.note ?? null,
      order.origin, order.destination, order.originCity, order.destinationCity, order.originAirport,
      order.destinationAirport, order.departureAt,
      order.airline, order.airlineName, order.flightNumber, order.transfers, order.durationMinutes,
      order.checkedBags, order.cabinKg, order.checkedBagKg, order.link, order.gate ?? null,
      order.adults, order.children, order.infants, order.adultPrice, order.childPrice, order.infantPrice,
      JSON.stringify(order.options), order.totalAmount, order.currency,
      order.clientEmail, order.bags.included, order.bags.kept, order.bags.refund, order.bags.discount, order.bags.freedKilos,
      order.arrivalAt ?? null, JSON.stringify(order.stops ?? []), JSON.stringify(order.passengers ?? []),
      // Vol retour (aller simple : tout à NULL / 0)
      order.returnAt ?? null, order.returnArrivalAt ?? null, order.returnOriginAirport ?? null,
      order.returnDestinationAirport ?? null, order.returnAt ? (order.returnTransfers ?? 0) : null,
      JSON.stringify(order.returnStops ?? []), order.returnDurationMinutes ?? null,
      order.returnBags?.included ?? 0, order.returnBags?.kept ?? 0, order.returnBags?.discount ?? 0,
      order.returnBags?.freedKilos ?? 0,
    ]
  );
  return rows[0]?.id ?? null;
}

export async function findById(id, db = pool) {
  const { rows } = await db.query(`SELECT ${SELECT_COLUMNS} ${FROM_JOINS} WHERE f.id = $1`, [id]);
  return toFlightOrder(rows[0]);
}

export async function findByIdForUpdate(id, db = pool) {
  const { rows } = await db.query(`SELECT * FROM flight_orders WHERE id = $1 FOR UPDATE`, [id]);
  return toFlightOrder(rows[0]);
}

/**
 * Liste admin. Filtres optionnels :
 *  - status : tableau de statuts, ex. ["PENDING", "PAID"]
 *  - q      : référence, nom du client, ville, e-mail, nom ou passeport d'un passager
 */
export async function list({ status, q, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS}, COUNT(*) OVER () AS total_count
     ${FROM_JOINS}
     WHERE ($1::flight_order_status[] IS NULL OR f.status = ANY($1::flight_order_status[]))
       AND ($2::text IS NULL OR f.reference ILIKE $2 OR f.client_name ILIKE $2
            OR f.origin_city ILIKE $2 OR f.destination_city ILIKE $2 OR f.client_email ILIKE $2
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(f.passengers) p
                       WHERE p->>'fullName' ILIKE $2 OR p->>'passportNumber' ILIKE $2))
     ORDER BY f.created_at DESC
     LIMIT $3 OFFSET $4`,
    [status ?? null, likePattern(q), limit, offset]
  );
  return { items: rows.map(toFlightOrder), total: rows[0]?.total_count ?? 0 };
}

// Nombre de demandes par statut (pastilles de la page admin)
export async function countByStatus(db = pool) {
  const { rows } = await db.query(`SELECT status, COUNT(*) AS count FROM flight_orders GROUP BY status`);
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}

export async function updateStatus(id, status, db = pool) {
  await db.query(`UPDATE flight_orders SET status = $2 WHERE id = $1`, [id, status]);
}

// Numéros de paiement envoyés au client : renvoie la date d'envoi
export async function markPaymentInfoSent(id, db = pool) {
  const { rows } = await db.query(
    `UPDATE flight_orders SET payment_info_sent_at = NOW() WHERE id = $1 RETURNING payment_info_sent_at`,
    [id]
  );
  return rows[0]?.payment_info_sent_at ?? null;
}

// Billet envoyé par e-mail : on garde l'adresse utilisée (et on complète celle de la demande si elle manquait)
export async function markTicketSent(id, email, db = pool) {
  await db.query(
    `UPDATE flight_orders SET receipt_email = $2, receipt_sent_at = NOW(), client_email = COALESCE(client_email, $2)
     WHERE id = $1`,
    [id, email]
  );
}

/* ===================== Kilos libérés (valises retirées par les clients) ===================== */
// Un aller-retour libère des kilos vol par vol : chaque vol (leg OUTBOUND ou RETURN) est publiable séparément.

export const FLIGHT_LEGS = ["OUTBOUND", "RETURN"];

/**
 * Un vol de la demande vu comme une demande simple : l'aller tel quel, ou le retour à la place de l'aller
 * (flight, bags et kilosTripId sont ceux du retour). leg dit lequel.
 */
export function legView(order, leg = "OUTBOUND") {
  if (leg !== "RETURN") return { ...order, leg: "OUTBOUND" };
  return { ...order, leg, flight: order.returnFlight, bags: order.returnBags, kilosTripId: order.returnKilosTripId };
}

// Demande × vol (aller, retour) + voyage publié avec les kilos de ce vol (s'il existe)
const KILOS_SELECT = `
  SELECT f.*, c.id AS conversation_id, l.leg,
         (l.leg_departure_at < LOCALTIMESTAMP) AS has_departed,
         t.id AS trip_id, t.status AS trip_status, t.kilos_total AS trip_kilos_total,
         t.kilos_reserved AS trip_kilos_reserved, t.price_per_kilo AS trip_price_per_kilo, t.currency AS trip_currency
  FROM flight_orders f
  CROSS JOIN LATERAL (VALUES ('OUTBOUND', f.departure_at, f.freed_kilos, f.kilos_trip_id),
                             ('RETURN', f.return_at, f.return_freed_kilos, f.return_kilos_trip_id))
    AS l(leg, leg_departure_at, leg_freed_kilos, leg_trip_id)
  LEFT JOIN conversations c ON c.flight_order_id = f.id
  LEFT JOIN trips t ON t.id = l.leg_trip_id`;

function toFreedKilos(row) {
  if (!row) return null;
  return {
    ...legView(toFlightOrder(row), row.leg),
    hasDeparted: row.has_departed,
    trip: row.trip_id
      ? {
          id: row.trip_id,
          status: row.trip_status,
          kilosTotal: row.trip_kilos_total,
          kilosReserved: row.trip_kilos_reserved,
          pricePerKilo: row.trip_price_per_kilo,
          currency: row.trip_currency,
        }
      : null,
  };
}

/**
 * Kilos libérés par les clients, vol par vol.
 *  - upcoming : vols pas encore partis, le plus proche d'abord
 *  - past     : vols partis, le plus récent d'abord
 */
export async function listFreedKilos({ period = "upcoming" } = {}, db = pool) {
  const upcoming = period !== "past";
  const { rows } = await db.query(
    `${KILOS_SELECT}
     WHERE l.leg_freed_kilos > 0
       AND (CASE WHEN $1::boolean THEN l.leg_departure_at >= LOCALTIMESTAMP ELSE l.leg_departure_at < LOCALTIMESTAMP END)
     ORDER BY ${upcoming ? "l.leg_departure_at ASC" : "l.leg_departure_at DESC"}, f.id, l.leg
     LIMIT 200`,
    [upcoming]
  );
  return rows.map(toFreedKilos);
}

/** Kilos libérés sur un vol d'une demande (leg : OUTBOUND, ou RETURN pour le retour d'un aller-retour) */
export async function findFreedKilos(id, leg = "OUTBOUND", db = pool) {
  const { rows } = await db.query(`${KILOS_SELECT} WHERE f.id = $1 AND l.leg = $2 AND l.leg_freed_kilos > 0`, [id, leg]);
  return toFreedKilos(rows[0]);
}

export async function findFreedKilosForUpdate(id, leg = "OUTBOUND", db = pool) {
  const { rows } = await db.query(
    `SELECT f.*,
            (CASE WHEN $2::text = 'RETURN' THEN f.return_at ELSE f.departure_at END) < LOCALTIMESTAMP AS has_departed,
            t.status AS trip_status
     FROM flight_orders f
     LEFT JOIN trips t ON t.id = (CASE WHEN $2::text = 'RETURN' THEN f.return_kilos_trip_id ELSE f.kilos_trip_id END)
     WHERE f.id = $1 FOR UPDATE OF f`,
    [id, leg]
  );
  const row = rows[0];
  return row ? { ...legView(toFlightOrder(row), leg), hasDeparted: row.has_departed, tripStatus: row.trip_status } : null;
}

export async function linkKilosTrip(id, tripId, leg = "OUTBOUND", db = pool) {
  const column = leg === "RETURN" ? "return_kilos_trip_id" : "kilos_trip_id";
  await db.query(`UPDATE flight_orders SET ${column} = $2 WHERE id = $1`, [id, tripId]);
}
