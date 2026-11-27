import { api } from "./client";

// Billets d'avion côté client (le token est envoyé s'il existe : demande d'un client connecté)
export const flightsApi = {
  // → { enabled, currency, childPercent, infantPercent, maxPassengers, monthsAhead, options }
  config: () => api.get("/public/flights/config"),
  places: (term) => api.get("/public/flights/places", { term }), // → { items: [{ code, name, countryName }] }
  // { origin, destination, date: "2026-12-15", returnDate?, direct } → { items, nearby: [{ date, returnDate, price }], … }
  search: (params) => api.get("/public/flights/search", params),
  getOffer: (id) => api.get(`/public/flights/offers/${id}`), // → { offer, config }
  // → { flightOrder, conversationId, guestToken? } (guestToken uniquement pour un visiteur)
  // passengers : [{ type: ADULT|CHILD|INFANT, fullName, gender: M|F, birthDate, nationality: "CI", passportNumber }]
  createOrder: (data) => api.post("/public/flight-orders", data),
  // Vol choisi dans la recherche de billets (Aviasales en direct) : { origin, destination, date, returnDate?, airline, departureTime?,
  // returnDepartureTime?, seenPrice?, shareLink?, clientName…, passengers } → même réponse que createOrder
  createLiveOrder: (data) => api.post("/public/flight-orders/live", data),
  countries: () => api.get("/public/countries"), // → { items: [{ code: "CI", name, dialCode: "225", flag }] }
};
