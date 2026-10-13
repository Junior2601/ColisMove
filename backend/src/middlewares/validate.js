import { badRequest } from "../utils/AppError.js";

/**
 * Valide req.params / req.query / req.body avec des schémas Zod.
 * Les données nettoyées (converties, trimées, valeurs par défaut) sont placées dans req.valid :
 * sous Express 5, req.query est en lecture seule, on ne peut donc pas l'écraser.
 *
 *   router.post("/trips", validate({ body: createTripBody }), controller.createTrip)
 */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid = {};
    for (const part of ["params", "query", "body"]) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        throw badRequest(
          "Données invalides.",
          result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message }))
        );
      }
      req.valid[part] = result.data;
    }
    next();
  };
}
