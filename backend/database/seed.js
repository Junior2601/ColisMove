/**
 * Seed MoveColis
 *   npm run db:seed        → crée / met à jour le compte admin (depuis .env)
 *   npm run db:seed:demo   → + données de démo (voyageurs, clients, voyages, réservations, conversations)
 */
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "../src/config/db.js";
import { RESERVATION_FLOW } from "../src/config/constants.js";
import { generateTrackingCode } from "../src/utils/trackingCode.js";
import { generateToken, hashToken } from "../src/utils/token.js";
import { interpolate } from "../src/utils/template.js";
import { formatLocalDate } from "../src/utils/date.js";
import { normalizePhone } from "../src/utils/phone.js";

const DEMO_PASSWORD = "Demo1234!";
const withDemo = process.argv.includes("--demo");

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const hoursAgo = (h) => new Date(Date.now() - h * HOUR);
// Date locale relative à aujourd'hui : localDate(10, "08:45") → "2026-10-22T08:45"
const localDate = (days, time) => `${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T${time}`;

/* ------------------------------------------------------------------ */
/* Admin                                                              */
/* ------------------------------------------------------------------ */

async function upsertAdmin(db) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans .env");

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, phone, role, status, status_changed_at)
     VALUES ('Admin', 'MoveColis', $1, $2, $3, 'ADMIN', 'APPROVED', NOW())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'ADMIN', status = 'APPROVED'
     RETURNING id`,
    [email, hash, normalizePhone(process.env.ADMIN_PHONE ?? "2250700000000")]
  );
  console.log(`✅ Admin prêt : ${email}`);
  return rows[0].id;
}

/* ------------------------------------------------------------------ */
/* Données de démonstration                                           */
/* ------------------------------------------------------------------ */

const DEMO_USERS = {
  ibrahim: { firstName: "Ibrahim", lastName: "Traoré", email: "ibrahim@exemple.com", phone: "79000000000", city: "Moscou", role: "VOYAGEUR", status: "PENDING", createdAt: hoursAgo(24) },
  mariam: { firstName: "Mariam", lastName: "Sylla", email: "mariam@exemple.com", phone: "2250500000000", city: "Abidjan", role: "VOYAGEUR", status: "PENDING", createdAt: hoursAgo(72) },
  serge: { firstName: "Serge", lastName: "Bamba", email: "serge@exemple.com", phone: "33700000000", city: "Paris", role: "VOYAGEUR", status: "APPROVED", createdAt: hoursAgo(40 * 24) },
  aminata: { firstName: "Aminata", lastName: "Koné", email: "aminata@exemple.com", phone: "79000000001", city: "Moscou", role: "VOYAGEUR", status: "APPROVED", createdAt: hoursAgo(60 * 24) },
  karim: { firstName: "Karim", lastName: "Zongo", email: "karim@exemple.com", phone: "22170000000", city: "Dakar", role: "VOYAGEUR", status: "REJECTED", createdAt: hoursAgo(20 * 24) },
  awa: { firstName: "Awa", lastName: "Koné", email: "awa@exemple.com", phone: "2250700000001", city: "Abidjan", role: "CLIENT", status: "APPROVED", createdAt: hoursAgo(30 * 24) },
  moussa: { firstName: "Moussa", lastName: "Diallo", email: "moussa@exemple.com", phone: "2250500000001", city: "Abidjan", role: "CLIENT", status: "APPROVED", createdAt: hoursAgo(25 * 24) },
};

const DEMO_TRIPS = {
  abjMow: { owner: "admin", departureCity: "Abidjan", departureAt: localDate(10, "08:45"), stopCity: "Istanbul", stopDuration: "3h20", arrivalCity: "Moscou", arrivalAt: localDate(10, "22:10"), kilosTotal: 23, pricePerKilo: 9500, currency: "XOF", createdAt: hoursAgo(5 * 24) },
  mowAbj: { owner: "aminata", departureCity: "Moscou", departureAt: localDate(14, "11:30"), stopCity: "Doha", stopDuration: "2h05", arrivalCity: "Abidjan", arrivalAt: localDate(15, "05:55"), kilosTotal: 15, pricePerKilo: 11000, currency: "XOF", createdAt: hoursAgo(3 * 24) },
  cdgDkr: { owner: "serge", departureCity: "Paris", departureAt: localDate(16, "14:20"), stopCity: null, stopDuration: null, arrivalCity: "Dakar", arrivalAt: localDate(16, "18:45"), kilosTotal: 30, pricePerKilo: 8, currency: "EUR", createdAt: hoursAgo(2 * 24) },
  dkrCdg: { owner: "serge", departureCity: "Dakar", departureAt: localDate(-3, "11:00"), stopCity: null, stopDuration: null, arrivalCity: "Paris", arrivalAt: localDate(-3, "17:40"), kilosTotal: 20, pricePerKilo: 8, currency: "EUR", status: "COMPLETED", createdAt: hoursAgo(20 * 24) },
};

// client: null → réservation d'un visiteur (sans compte)
const DEMO_RESERVATIONS = [
  { trip: "abjMow", client: "awa", name: "Awa Koné", phone: "2250700000001", kilos: 5, parcel: "Vêtements et documents", status: "PENDING", createdAt: hoursAgo(2) },
  { trip: "cdgDkr", client: "moussa", name: "Moussa Diallo", phone: "2250500000001", kilos: 10, parcel: "Pièces détachées", status: "CONFIRMED", createdAt: hoursAgo(26) },
  { trip: "mowAbj", client: null, name: "Fatou N'Diaye", phone: "79000000002", kilos: 3, parcel: "Produits cosmétiques", status: "CONFIRMED", createdAt: hoursAgo(72) },
  { trip: "abjMow", client: null, name: "Oumar Cissé", phone: "2250600000000", kilos: 7, parcel: "Documents administratifs", status: "CONFIRMED", createdAt: hoursAgo(96) },
  { trip: "dkrCdg", client: null, name: "Aïcha Bâ", phone: "33600000000", kilos: 6, parcel: "Tissus wax", status: "DELIVERED", createdAt: hoursAgo(12 * 24) },
];

async function seedDemo(db, adminId) {
  const { rowCount } = await db.query("SELECT 1 FROM users WHERE email = $1", [DEMO_USERS.serge.email]);
  if (rowCount) {
    console.log("ℹ️  Données de démo déjà présentes : rien à ajouter.");
    return;
  }

  // --- Utilisateurs ---
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds = { admin: adminId };
  for (const [key, u] of Object.entries(DEMO_USERS)) {
    const decidedAt = u.role === "VOYAGEUR" && u.status !== "PENDING" ? new Date(u.createdAt.getTime() + DAY) : null;
    const { rows } = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, phone, city, role, status, status_changed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [u.firstName, u.lastName, u.email, hash, u.phone, u.city, u.role, u.status, decidedAt, u.createdAt]
    );
    userIds[key] = rows[0].id;
  }

  // --- Voyages (kilos réservés = somme des réservations de démo) ---
  const reservedByTrip = {};
  for (const r of DEMO_RESERVATIONS) reservedByTrip[r.trip] = (reservedByTrip[r.trip] ?? 0) + r.kilos;

  const trips = {};
  for (const [key, t] of Object.entries(DEMO_TRIPS)) {
    const { rows } = await db.query(
      `INSERT INTO trips (owner_id, departure_city, departure_at, stop_city, stop_duration, arrival_city, arrival_at,
                          kilos_total, kilos_reserved, price_per_kilo, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [
        userIds[t.owner], t.departureCity, t.departureAt, t.stopCity, t.stopDuration, t.arrivalCity, t.arrivalAt,
        t.kilosTotal, reservedByTrip[key] ?? 0, t.pricePerKilo, t.currency, t.status ?? "PUBLISHED", t.createdAt,
      ]
    );
    trips[key] = { ...t, id: rows[0].id, ownerId: userIds[t.owner] };
  }

  // --- Réservations + historique + conversation ---
  const { rows: [settings] } = await db.query("SELECT reservation_message_template FROM settings WHERE id = 1");

  for (const r of DEMO_RESERVATIONS) {
    const trip = trips[r.trip];
    const clientId = r.client ? userIds[r.client] : null;
    const total = Math.round(r.kilos * trip.pricePerKilo * 100) / 100;

    const { rows: [reservation] } = await db.query(
      `INSERT INTO reservations (tracking_code, trip_id, client_id, client_name, client_phone, parcel_description,
                                 kilos, price_per_kilo, total_amount, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, tracking_code`,
      [
        generateTrackingCode(r.createdAt), trip.id, clientId, r.name, r.phone, r.parcel,
        r.kilos, trip.pricePerKilo, total, trip.currency, r.status, r.createdAt,
      ]
    );

    // Un événement de suivi par étape franchie jusqu'au statut actuel
    const steps = RESERVATION_FLOW.slice(0, RESERVATION_FLOW.indexOf(r.status) + 1);
    for (const [i, status] of steps.entries()) {
      await db.query(
        `INSERT INTO tracking_events (reservation_id, status, created_by, created_at) VALUES ($1, $2, $3, $4)`,
        [reservation.id, status, i === 0 ? clientId : trip.ownerId, new Date(r.createdAt.getTime() + i * 6 * HOUR)]
      );
    }

    // Conversation : un visiteur y accède avec un jeton (ici jeté, c'est de la démo)
    const { rows: [conversation] } = await db.query(
      `INSERT INTO conversations (reservation_id, guest_token_hash, created_at) VALUES ($1, $2, $3) RETURNING id`,
      [reservation.id, clientId ? null : hashToken(generateToken()), r.createdAt]
    );

    const firstMessage = interpolate(settings.reservation_message_template, {
      kilos: r.kilos,
      trajet: `${trip.departureCity} → ${trip.arrivalCity}`,
      date: formatLocalDate(trip.departureAt),
      nom: r.name,
      code: reservation.tracking_code,
    });
    await db.query(
      `INSERT INTO messages (conversation_id, sender_type, sender_id, body, created_at) VALUES ($1, 'CUSTOMER', $2, $3, $4)`,
      [conversation.id, clientId, firstMessage, r.createdAt]
    );
    if (r.status !== "PENDING") {
      await db.query(
        `INSERT INTO messages (conversation_id, sender_type, sender_id, body, created_at) VALUES ($1, 'OWNER', $2, $3, $4)`,
        [conversation.id, trip.ownerId, "Bien reçu, c'est confirmé ✅ On s'organise ici pour la remise du colis.", new Date(r.createdAt.getTime() + HOUR)]
      );
    }
  }

  console.log(`✅ Démo : ${Object.keys(DEMO_USERS).length} utilisateurs, ${Object.keys(DEMO_TRIPS).length} voyages, ${DEMO_RESERVATIONS.length} réservations.`);
  console.log(`   Mot de passe des comptes de démo : ${DEMO_PASSWORD}`);
}

/* ------------------------------------------------------------------ */

try {
  await withTransaction(async (db) => {
    const adminId = await upsertAdmin(db);
    if (withDemo) await seedDemo(db, adminId);
  });
} catch (err) {
  console.error("❌ Seed échoué :", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
