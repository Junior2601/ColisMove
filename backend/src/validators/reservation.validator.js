import { z } from "zod";
import { nullableField, pagination, searchQuery } from "./common.js";
import { RESERVATION_STATUSES } from "../config/constants.js";

// ?status=RECEIVED,IN_TRANSIT,ARRIVED → ["RECEIVED", "IN_TRANSIT", "ARRIVED"]
const statusList = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const list = value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return list.length ? list : undefined;
}, z.array(z.enum(RESERVATION_STATUSES)).optional());

export const listReservationsQuery = z.object({
  tripId: z.coerce.number().int().positive().optional(),
  status: statusList,
  q: searchQuery,
  ...pagination,
});

export const updateReservationStatusBody = z.object({
  status: z.enum(RESERVATION_STATUSES),
  note: nullableField(z.string().trim().max(255)), // ex. "Escale Istanbul", "Remis à Abidjan"
});
