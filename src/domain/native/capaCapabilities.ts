import { z } from "zod";
import { localPathStringSchema } from "../localPath.js";
import { digestSchema } from "../digests.js";
import { jsonValueSchema } from "../jsonValue.js";

/** Explicit local artifact and bounded optional capa analysis choices. */
export const inspectCapaCapabilitiesInputSchema = z.strictObject({
  path: localPathStringSchema,
  backend: z.enum(["auto", "vivisect", "pefile"]).default("auto"),
  timeout_ms: z.number().int().min(1).max(600_000).default(120_000),
  max_file_bytes: z.number().int().min(1).max(268_435_456).default(67_108_864),
  max_output_bytes: z.number().int().min(1).max(16_777_216).default(4_194_304),
});
export type InspectCapaCapabilitiesInput = z.infer<
  typeof inspectCapaCapabilitiesInputSchema
>;

/** Preserve capa location coordinates without inventing native addresses for other scopes. */
export const capaLocationSchema = z.union([
  z.strictObject({ type: z.literal("no address") }),
  z.strictObject({ type: z.string().min(1), value: jsonValueSchema }),
]);
export const capaCapabilitiesSchema = z.strictObject({
  artifact_sha256: digestSchema,
  format: z.enum(["pe", "elf"]),
  extractor: z.string().min(1),
  backend: z.enum(["auto", "vivisect", "pefile"]),
  classification: z.literal("static-rule-hypotheses"),
  coverage: z.literal("matched-rules-only; unmatched-behavior-unknown"),
  rules: z.array(
    z.strictObject({
      name: z.string().min(1),
      namespace: z.string().nullable(),
      scope: z.string().min(1),
      matches: z.array(capaLocationSchema),
    }),
  ),
  diagnostics: z.string(),
});
export type CapaCapabilities = z.infer<typeof capaCapabilitiesSchema>;

const ruleSchema = z.object({
  meta: z.object({
    name: z.string().min(1),
    namespace: z.string().optional(),
    scopes: z.object({ static: z.string().min(1) }),
  }),
  matches: z.array(z.tuple([capaLocationSchema, jsonValueSchema])),
});
export const capaReportSchema = z.object({
  meta: z.object({
    version: z.string().min(1),
    flavor: z.literal("static"),
    sample: z.object({ sha256: digestSchema }),
    analysis: z.object({
      format: z.enum(["pe", "elf"]),
      extractor: z.string().min(1),
    }),
  }),
  rules: z.record(z.string(), ruleSchema),
});
