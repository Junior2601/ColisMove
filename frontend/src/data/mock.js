// Données factices — seront remplacées par les appels à l'API Next.js.
// La structure imite déjà le futur modèle Prisma (Trip + owner).

export const MOCK_TRIPS = [
  {
    id: 1,
    departureCity: "Abidjan",
    departureCode: "ABJ",
    departureDate: "2026-07-25",
    departureTime: "08:45",
    stopCity: "Istanbul",       // null si vol direct
    stopDuration: "3h20",
    arrivalCity: "Moscou",
    arrivalCode: "MOW",
    arrivalDate: "2026-07-26",
    arrivalTime: "22:10",
    kilosAvailable: 23,
    pricePerKilo: 9500,
    currency: "F",
    owner: { name: "KiloFly", role: "admin", whatsapp: "2250712345678" },
    coverClass: "from-[#FF385C] via-[#E31C5F] to-[#BD1E59]",
  },
  {
    id: 2,
    departureCity: "Moscou",
    departureCode: "MOW",
    departureDate: "2026-07-29",
    departureTime: "11:30",
    stopCity: "Doha",
    stopDuration: "2h05",
    arrivalCity: "Abidjan",
    arrivalCode: "ABJ",
    arrivalDate: "2026-07-30",
    arrivalTime: "05:55",
    kilosAvailable: 15,
    pricePerKilo: 11000,
    currency: "F",
    owner: { name: "Aminata K.", role: "voyageur", whatsapp: "79000000000" },
    coverClass: "from-[#1C4670] via-[#2E6DA4] to-[#4A90D9]",
  },
  {
    id: 3,
    departureCity: "Paris",
    departureCode: "CDG",
    departureDate: "2026-07-31",
    departureTime: "14:20",
    stopCity: null,
    stopDuration: null,
    arrivalCity: "Dakar",
    arrivalCode: "DKR",
    arrivalDate: "2026-07-31",
    arrivalTime: "18:45",
    kilosAvailable: 30,
    pricePerKilo: 8,
    currency: "€",
    owner: { name: "Serge B.", role: "voyageur", whatsapp: "33700000000" },
    coverClass: "from-[#6D3B8E] via-[#9450B8] to-[#B77BD4]",
  },
  {
    id: 4,
    departureCity: "Dakar",
    departureCode: "DKR",
    departureDate: "2026-08-03",
    departureTime: "23:55",
    stopCity: "Casablanca",
    stopDuration: "4h",
    arrivalCity: "Moscou",
    arrivalCode: "MOW",
    arrivalDate: "2026-08-04",
    arrivalTime: "17:30",
    kilosAvailable: 10,
    pricePerKilo: 10000,
    currency: "F",
    owner: { name: "KiloFly", role: "admin", whatsapp: "2250712345678" },
    coverClass: "from-[#0E6E5C] via-[#16997F] to-[#35BFA3]",
  },
];

// Helpers de formatage français
export function formatPrice(value, currency = "F") {
  return `${value.toLocaleString("fr-FR")} ${currency}`;
}

export function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export const MOCK_TRACKING = {
  code: "KF-20260725-042",
  kilos: 5,
  route: "Abidjan → Moscou",
  tripDate: "25 juil.",
  status: "En transit",
  steps: [
    { title: "Réservation confirmée", sub: "24 juil. · 14h32 — confirmée sur WhatsApp", state: "done" },
    { title: "Colis remis au voyageur", sub: "25 juil. · 06h10 — Abidjan", state: "done" },
    { title: "En vol", sub: "Escale Istanbul prévue à 16h05", state: "current" },
    { title: "Arrivé à destination", sub: "Moscou — prévu le 26 juil. · 22h10", state: "todo" },
    { title: "Colis livré", sub: "Remise au destinataire", state: "todo" },
  ],
};