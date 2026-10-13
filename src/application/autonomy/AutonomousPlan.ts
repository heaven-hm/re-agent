import { z } from "zod";
import { investigationConfigSchema } from "./InvestigationContracts.js";
import { analysisProviderSelectorSchema } from "../../contracts/providerSelection.js";
import { numericExperimentSchema } from "../../domain/autonomyExperiments.js";

/** Credentials are environment variable references, never inline secrets. */
export const modelConfigSchema = z.strictObject({
  provider: z.enum(["openai", "anthropic", "google", "openrouter", "local"]),
  model: z.string().min(1),
  baseUrl: z.string().url().optional(),
  credentialEnvironmentVariable: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
    .optional(),
  timeoutMs: z.number().int().min(1).max(300_000).optional(),
  maxOutputTokens: z.number().int().min(1).max(65_536).optional(),
});

export const autonomousPlanSchema = z
  .strictObject({
    investigation: investigationConfigSchema.safeExtend({
      cases: z.array(investigationConfigSchema.shape.cases.element),
    }),
    experiments: numericExperimentSchema.optional(),
    analysis: z
      .strictObject({
        provider: analysisProviderSelectorSchema.optional(),
        maxFunctions: z.number().int().min(1).max(64).default(8),
      })
      .optional(),
    model: modelConfigSchema.optional(),
    reconstruction: z
      .strictObject({
        policy: z.enum(["model", "piecewise-affine"]).default("model"),
        sourcePath: z.string().min(1),
        language: z.enum(["C", "C++", "Rust", "C#"]),
        objective: z.string().min(1),
        range: z
          .strictObject({
            min: z.number().int().safe(),
            max: z.number().int().safe(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((plan, context) => {
    if (plan.reconstruction?.policy === "piecewise-affine") {
      if (
        plan.model !== undefined ||
        plan.reconstruction.range === undefined ||
        plan.reconstruction.language !== "C"
      )
        context.addIssue({
          code: "custom",
          message:
            "Piecewise affine policy requires C, a declared integer range, and no model",
        });
    } else if (
      (plan.model === undefined) !==
      (plan.reconstruction === undefined)
    )
      context.addIssue({
        code: "custom",
        message: "Model and reconstruction settings must be supplied together",
      });
    if (plan.reconstruction !== undefined && plan.analysis === undefined)
      context.addIssue({
        code: "custom",
        message: "Model reconstruction requires static analysis evidence",
      });
  });
export type AutonomousPlan = z.infer<typeof autonomousPlanSchema>;
