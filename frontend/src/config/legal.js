// =========================================================
//  Informations légales de MoveColis
//  ⚠️ À COMPLÉTER AVANT LA MISE EN LIGNE.
//  Chaque valeur vide s'affiche en jaune « À compléter » sur les pages légales,
//  pour ne rien oublier. Faites relire les textes par un juriste.
// =========================================================

export const LEGAL = {
  brand: "MoveColis",

  // ----- Éditeur du site -----
  companyName: "", // raison sociale, ex. « MoveColis SARL »
  legalForm: "", // SARL, SAS, entreprise individuelle…
  capital: "", // ex. « 1 000 000 FCFA »
  rccm: "", // numéro RCCM, ex. « CI-ABJ-2026-B-12345 »
  taxId: "", // numéro de compte contribuable (NCC)
  address: "", // adresse du siège social
  email: "", // ex. contact@movecolis.com
  phone: "", // ex. +225 07 00 00 00 00
  publicationDirector: "", // nom et fonction du directeur de la publication
  website: "", // ex. https://movecolis.com

  // ----- Données personnelles -----
  privacyEmail: "", // adresse pour exercer ses droits (peut être la même que email)
  artciReference: "", // n° de récépissé de déclaration ou d'autorisation ARTCI

  // ----- Hébergeurs -----
  hosting: [
    { role: "Site web (frontend)", name: "", address: "", website: "" },
    { role: "Serveur et base de données (backend)", name: "", address: "", website: "", dataLocation: "" },
  ],

  // ----- Durées de conservation (proposées : à valider avec votre conseil) -----
  retention: {
    account: "pendant toute la durée d'utilisation du compte, puis 3 ans après la dernière activité",
    reservations: "5 ans après la fin de la réservation (preuve en cas de litige)",
    messages: "5 ans après la fin de la réservation concernée",
    notifications: "12 mois",
    interests: "6 mois après la dernière recherche ou consultation ; trajets favoris : jusqu'à leur suppression",
    technicalLogs: "12 mois",
  },

  // ----- Juridiction -----
  court: "les tribunaux d'Abidjan",
  minimumAge: 18,
};

// Version des textes : identique à TERMS_VERSION du backend (enregistrée à l'inscription)
export const LEGAL_VERSION = "2026-10";
export const LEGAL_UPDATED_AT = "13 octobre 2026";
