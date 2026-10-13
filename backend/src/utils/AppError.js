/**
 * Erreur "métier" : elle porte son code HTTP.
 * Les services la lèvent, le errorHandler la transforme en réponse JSON.
 */
export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, message, details);
export const unauthorized = (message = "Authentification requise.") => new AppError(401, message);
export const forbidden = (message = "Accès refusé.") => new AppError(403, message);
export const notFound = (message = "Ressource introuvable.") => new AppError(404, message);
export const conflict = (message) => new AppError(409, message);
