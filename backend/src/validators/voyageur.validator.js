import { z } from "zod";
import { pagination } from "./common.js";

export const listOwnTripsQuery = z.object({
  period: z.enum(["upcoming", "past"]).default("upcoming"),
  ...pagination,
});
