/**
 * Génère un lien wa.me vers le propriétaire du voyage,
 * avec un message pré-rempli (encodé pour l'URL).
 * Ex : whatsappLink("2250712345678", "Bonjour !") 
 *   → https://wa.me/2250712345678?text=Bonjour%20!
 */
export function whatsappLink(phone, message) {
  const num = String(phone).replace(/[^\d]/g, ""); // garde uniquement les chiffres
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}