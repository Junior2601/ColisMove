// =========================================================
//  Accès des visiteurs (sans compte) à leurs conversations
//  Le jeton reçu à la réservation est gardé sur CET appareil.
// =========================================================

import { migrateStorageKey } from "./storage";

const STORAGE_KEY = "movecolis_guest_access";
migrateStorageKey("kilofly_guest_access", STORAGE_KEY);

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function saveGuestAccess({ conversationId, guestToken, trackingCode, route, departureAt }) {
  const all = readAll();
  all[conversationId] = { conversationId, guestToken, trackingCode, route, departureAt, savedAt: new Date().toISOString() };
  writeAll(all);
}

export const getGuestToken = (conversationId) => readAll()[conversationId]?.guestToken ?? null;

// Les plus récentes en premier
export const listGuestAccess = () =>
  Object.values(readAll()).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

export const findGuestAccessByCode = (trackingCode) =>
  listGuestAccess().find((access) => access.trackingCode === trackingCode) ?? null;
