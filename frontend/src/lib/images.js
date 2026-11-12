// =========================================================
//  Photos envoyées dans la messagerie (capture du paiement…)
//  Réduites dans le navigateur avant l'envoi : rapides sur une connexion mobile, < 2 Mo pour le serveur
// =========================================================

const MAX_SIDE = 2000; // px : une capture d'écran de téléphone reste lisible
const MAX_BYTES = 1.8 * 1024 * 1024;

/**
 * Fichier choisi (JPG, PNG, WebP, HEIC selon le navigateur…) → { blob (JPEG), width, height }
 * Erreur lisible si le navigateur ne sait pas ouvrir l'image.
 */
export async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choisissez une photo ou une capture d'écran.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Cette image ne peut pas être ouverte : envoyez une capture d'écran JPG ou PNG.");
  }

  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let quality = 0.85;
  try {
    for (;;) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff"; // fond blanc pour les PNG transparents
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("La photo n'a pas pu être préparée. Réessayez.");
      if (blob.size <= MAX_BYTES || scale < 0.2) return { blob, width, height };
      // Trop lourde : d'abord un peu moins de qualité, puis une image plus petite
      if (quality > 0.6) quality -= 0.15;
      else scale *= 0.75;
    }
  } finally {
    bitmap.close?.();
  }
}
