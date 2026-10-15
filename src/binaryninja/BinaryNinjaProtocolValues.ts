import { z } from "zod";
import { analysisStringSchema } from "../domain/hopperValues.js";

/** Normalize a Binary Ninja hexadecimal coordinate without losing precision. */
export const binjaAddressSchema = z.union([
  z
    .string()
    .regex(/^(?:0x)?[0-9a-f]+$/iu)
    .transform(
      (value) =>
        `0x${BigInt(value.startsWith("0x") || value.startsWith("0X") ? value : `0x${value}`).toString(16)}`,
    ),
  z
    .number()
    .int()
    .nonnegative()
    .transform((value) => `0x${BigInt(value).toString(16)}`),
  z.bigint().transform((value) => `0x${value.toString(16)}`),
]);

export const binjaFunctionSchema = z.union([
  z
    .object({
      name: z.string().min(1),
      start: binjaAddressSchema,
    })
    .transform((fn) => ({ name: fn.name, address: fn.start })),
  z
    .object({
      name: z.string().min(1),
      address: binjaAddressSchema,
    })
    .transform((fn) => ({ name: fn.name, address: fn.address })),
  z
    .object({
      name: z.string().min(1),
      addr: binjaAddressSchema,
    })
    .transform((fn) => ({ name: fn.name, address: fn.addr })),
  z
    .object({
      function: z.string().min(1),
      start: binjaAddressSchema,
    })
    .transform((fn) => ({ name: fn.function, address: fn.start })),
  z
    .object({
      function: z.string().min(1),
      address: binjaAddressSchema,
    })
    .transform((fn) => ({ name: fn.function, address: fn.address })),
]);

export type BinjaFunction = z.infer<typeof binjaFunctionSchema>;

export const binjaStringItemSchema = z.union([
  analysisStringSchema,
  z
    .object({
      address: binjaAddressSchema,
      value: z.string(),
    })
    .transform(({ address, value }) => ({ address, value })),
  z
    .object({
      start: binjaAddressSchema,
      string: z.string(),
    })
    .transform(({ start, string: value }) => ({ address: start, value })),
  z
    .object({
      addr: binjaAddressSchema,
      str: z.string(),
    })
    .transform(({ addr, str: value }) => ({ address: addr, value })),
  z
    .object({
      address: binjaAddressSchema,
      text: z.string(),
    })
    .transform(({ address, text: value }) => ({ address, value })),
]);

export const binjaDisassemblyLineSchema = z.union([
  z.string(),
  z
    .object({
      address: binjaAddressSchema,
      instruction: z.string(),
    })
    .transform(({ address, instruction }) => `${address}: ${instruction}`),
  z
    .object({
      addr: binjaAddressSchema,
      disasm: z.string(),
    })
    .transform(({ addr, disasm }) => `${addr}: ${disasm}`),
  z
    .object({
      address: binjaAddressSchema,
      text: z.string(),
    })
    .transform(({ address, text }) => `${address}: ${text}`),
]);

export const binjaAddressListSchema = z.union([
  z.array(binjaAddressSchema),
  z.array(
    z.union([
      z.object({ address: binjaAddressSchema }).transform(({ address }) => address),
      z.object({ addr: binjaAddressSchema }).transform(({ addr }) => addr),
      z.object({ start: binjaAddressSchema }).transform(({ start }) => start),
      z.object({ caller: binjaAddressSchema }).transform(({ caller }) => caller),
      z.object({ callee: binjaAddressSchema }).transform(({ callee }) => callee),
      z.object({ from: binjaAddressSchema }).transform(({ from }) => from),
      z.object({ to: binjaAddressSchema }).transform(({ to }) => to),
    ]),
  ),
]);
