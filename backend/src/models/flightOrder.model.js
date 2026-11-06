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
    note: row.note,
    flight: {
      origin: { code: row.origin, name: row.origin_city },
      destination: { code: row.destination, name: row.destination_city },
      originAirport: row.origin_airport,
      destinationAirport: row.destination_airport,
      departureAt: toLocalIso(row.departure_at),
      airline: row.airline,
      airlineName: row.airline_name,
      flightNumber: row.flight_number,
      transfers: row.transfers,
      durationMinutes: row.duration_minutes,
      checkedBags: row.checked_bags,
      cabinKg: row.cabin_kg,
      checkedBagKg: row.checked_bag_kg,
    },
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
       adults, children, infants, adult_price, child_price, infant_price, options, total_amount, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
             $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31::jsonb, $32, $33)
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
 *  - q      : référence, nom du client ou ville
 */
export async function list({ status, q, limit, offset }, db = pool) {
  const { rows } = await db.query(
    `SELECT ${SELECT_COLUMNS}, COUNT(*) OVER () AS total_count
     ${FROM_JOINS}
     WHERE ($1::flight_order_status[] IS NULL OR f.status = ANY($1::flight_order_status[]))
       AND ($2::text IS NULL OR f.reference ILIKE $2 OR f.client_name ILIKE $2
            OR f.origin_city ILIKE $2 OR f.destination_city ILIKE $2)
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
