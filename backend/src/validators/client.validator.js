import { z } from "zod";
import { pagination } from "./common.js";

export const listClientReservationsQuery = z.object({
  group: z.enum(["current", "delivered", "cancelled"]).default("current"),
  ...pagination,
});
