import * as settingsModel from "../models/settings.model.js";
import { TEMPLATE_VARIABLES } from "../config/constants.js";
import { extractVariables } from "../utils/template.js";
import { AppError, badRequest } from "../utils/AppError.js";

export async function getSettings() {
  const settings = await settingsModel.get();
  if (!settings) throw new AppError(500, "Paramètres non initialisés : relancez `npm run db:schema`.");
  return { ...settings, availableVariables: TEMPLATE_VARIABLES };
}

export async function updateSettings(data) {
  if (data.reservationMessageTemplate !== undefined) {
    const unknown = extractVariables(data.reservationMessageTemplate).filter((v) => !TEMPLATE_VARIABLES.includes(v));
    if (unknown.length) {
      throw badRequest(
        `Variable(s) inconnue(s) : ${unknown.map((v) => `{${v}}`).join(", ")}. ` +
          `Disponibles : ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(", ")}.`
      );
    }
  }
  const settings = await settingsModel.update(data);
  return { ...settings, availableVariables: TEMPLATE_VARIABLES };
}
