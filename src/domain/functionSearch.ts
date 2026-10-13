import { z } from "zod";

/** Canonical provider-neutral procedure search result; value retains the symbol text. */
export const functionSearchResultSchema = z.array(
  z.object({
    address: z.string(),
    value: z.string(),
  }),
);
