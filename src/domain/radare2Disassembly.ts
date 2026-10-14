import { z } from "zod";

import { digestSchema } from "./digests.js";

/** A static byte address and maximum instruction count selected by the caller. */
export const radare2DisassemblyInputSchema = z.strictObject({
  address: z
    .string()
    .regex(/^0x[0-9a-f]{1,16}$/iu)
    .refine(
      (address) => BigInt(address) <= BigInt(Number.MAX_SAFE_INTEGER),
      "Address must fit exactly in radare2's JSON numeric output.",
    ),
  count: z.number().int().min(1).max(512).default(64),
});
export type Radare2DisassemblyInput = z.infer<
  typeof radare2DisassemblyInputSchema
>;

/** Only fields emitted by radare2's `pdj` that this adapter validates. */
export const radare2InstructionSchema = z.strictObject({
  address: z.string().regex(/^0x[0-9a-f]+$/iu),
  size: z.number().int().safe().positive(),
  opcode: z.string(),
  disassembly: z.string().optional(),
  bytes: z
    .string()
    .regex(/^(?:[0-9a-f]{2})*$/iu)
    .optional(),
});

export const radare2DisassemblySchema = z.strictObject({
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
  selection: z.strictObject({
    address: z.string().regex(/^0x[0-9a-f]+$/iu),
    requested_instructions: z.number().int().min(1).max(512),
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
  coverage: z.enum(["complete", "partial", "empty"]),
  instructions: z.array(radare2InstructionSchema),
  limitations: z.array(z.string()),
});
export type Radare2Disassembly = z.infer<typeof radare2DisassemblySchema>;
