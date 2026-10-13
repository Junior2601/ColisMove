// =========================================================
//  Moments forts de l'année : campagnes à préparer 2 à 3 semaines à l'avance
//  ⚠️ Les fêtes religieuses suivent le calendrier lunaire : dates indicatives (± 1 à 2 jours),
//  à confirmer à l'approche. Ajoutez librement vos propres moments.
// =========================================================

export const SEASONAL_MOMENTS = [
  {
    key: "fin-annee-2026",
    label: "Fêtes de fin d'année",
    date: "2026-12-20",
    why: "La diaspora rentre et envoie des cadeaux : pic de demande vers Abidjan et l'Afrique de l'Ouest.",
    audience: "CLIENTS",
    title: "Les fêtes approchent 🎄",
    body: "Les voyageurs des fêtes sont en ligne : réservez vos kilos dès maintenant pour vos cadeaux.",
  },
  {
    key: "fin-annee-2026-voyageurs",
    label: "Fêtes de fin d'année (voyageurs)",
    date: "2026-12-20",
    why: "Côté offre : incitez les voyageurs à publier leurs vols de fin d'année avant le pic.",
    audience: "VOYAGEURS",
    title: "Vous voyagez pour les fêtes ? ✈️",
    body: "Les demandes explosent en décembre : publiez votre vol et vendez vos kilos disponibles.",
    link: "/publier",
  },
  {
    key: "ramadan-2027",
    label: "Début du Ramadan",
    date: "2027-02-08",
    lunar: true,
    why: "Envois de produits et de colis aux familles avant le mois de jeûne.",
    audience: "CLIENTS",
    title: "Préparez le Ramadan 🌙",
    body: "Faites parvenir vos colis à vos proches avant le début du mois : de nouveaux voyages sont en ligne.",
  },
  {
    key: "korite-2027",
    label: "Korité (Aïd el-Fitr)",
    date: "2027-03-10",
    lunar: true,
    why: "Tenues et cadeaux de fête : forte demande les deux semaines précédentes.",
    audience: "CLIENTS",
    title: "Korité : vos colis à temps 🎁",
    body: "Tenues, cadeaux, douceurs : réservez vos kilos pour qu'ils arrivent avant la fête.",
  },
  {
    key: "paques-2027",
    label: "Vacances de Pâques",
    date: "2027-03-28",
    why: "Départs en vacances : plus de voyageurs, donc plus de kilos disponibles.",
    audience: "CLIENTS",
    title: "Des kilos disponibles pour Pâques 🐣",
    body: "Beaucoup de voyageurs partent pendant les vacances : c'est le moment d'envoyer vos colis.",
  },
  {
    key: "tabaski-2027",
    label: "Tabaski (Aïd el-Kébir)",
    date: "2027-05-16",
    lunar: true,
    why: "Le plus gros pic d'envois de l'année vers l'Afrique de l'Ouest.",
    audience: "CLIENTS",
    title: "Tabaski approche 🐑",
    body: "Réservez vos kilos maintenant : les voyages de Tabaski se remplissent vite.",
  },
  {
    key: "ete-2027",
    label: "Grandes vacances (diaspora et étudiants)",
    date: "2027-07-01",
    why: "Les étudiants de Russie et la diaspora rentrent au pays : énormément de voyageurs disponibles.",
    audience: "ALL",
    title: "L'été, la saison des kilos ☀️",
    body: "Des centaines de voyageurs rentrent pour l'été : envoyez ou vendez des kilos sur MoveColis.",
  },
  {
    key: "rentree-2027",
    label: "Rentrée scolaire et universitaire",
    date: "2027-09-01",
    why: "Fournitures, vêtements et colis vers les étudiants qui repartent (Russie, Europe).",
    audience: "CLIENTS",
    title: "Rentrée : pensez à vos étudiants 🎒",
    body: "Fournitures, vêtements, produits du pays : faites-les voyager avec les étudiants qui repartent.",
  },
  {
    key: "fin-annee-2027",
    label: "Fêtes de fin d'année",
    date: "2027-12-20",
    why: "La diaspora rentre et envoie des cadeaux : pic de demande vers Abidjan et l'Afrique de l'Ouest.",
    audience: "CLIENTS",
    title: "Les fêtes approchent 🎄",
    body: "Les voyageurs des fêtes sont en ligne : réservez vos kilos dès maintenant pour vos cadeaux.",
  },
];

// Fenêtre d'envoi recommandée : de 3 à 2 semaines avant le moment
export const PREPARATION_WINDOW = { startDaysBefore: 21, endDaysBefore: 14 };
