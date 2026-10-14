import { z } from "zod";

import { digestSchema } from "./digests.js";

/** Caller-selected upper bound for rows returned from radare2's full inventory. */
export const radare2InventoryInputSchema = z.strictObject({
  max_functions: z.number().int().min(1).max(20_000).default(5_000),
});
export type Radare2InventoryInput = z.infer<typeof radare2InventoryInputSchema>;

export const radare2FunctionRowSchema = z.strictObject({
  address: z.string().regex(/^0x[0-9a-f]+$/iu),
  name: z.string(),
  size: z.number().int().safe().nonnegative(),
  type: z.string().nullable(),
  basic_blocks: z.number().int().safe().nonnegative().nullable(),
});

export const radare2FunctionInventorySchema = z.strictObject({
  artifact: z.strictObject({
    path: z.string().min(1),
    sha256: digestSchema,
    format: z.string().min(1),
    architecture: z.string().nullable(),
    size_bytes: z.number().int().safe().nonnegative(),
  }),
  engine: z.strictObject({
    path: z.string().min(1),
    sha256: digestSchema,
    version: z.string().min(1),
  }),
  command: z.strictObject({
    arguments: z.array(z.string()),
    exit_code: z.number().int(),
    stdout: z.strictObject({
      sha256: digestSchema,
      bytes: z.number().int().safe().nonnegative(),
      complete: z.literal(true),
    }),
    stderr: z.strictObject({
      sha256: digestSchema,
      bytes: z.number().int().safe().nonnegative(),
    }),
  }),
  coverage: z.strictObject({
    state: z.enum(["complete", "truncated"]),
    total_rows: z.number().int().safe().nonnegative(),
    returned_rows: z.number().int().safe().nonnegative(),
  }),
  functions: z.array(radare2FunctionRowSchema),
  limitations: z.array(z.string()),
});
export type Radare2FunctionInventory = z.infer<
  typeof radare2FunctionInventorySchema
>;
