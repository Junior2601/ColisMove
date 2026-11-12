// Accueil d'un nouveau client (« Où envoyez-vous vos colis ? ») : « Plus tard » le masque une semaine
const LATER_KEY = "movecolis_onboarding_later";
const LATER_DAYS = 7;

export const onboardingPostponed = () => Date.now() < Number(localStorage.getItem(LATER_KEY) || 0);

export function postponeOnboarding() {
  localStorage.setItem(LATER_KEY, String(Date.now() + LATER_DAYS * 86400000));
}
