import { z } from "zod";
import { jsonValueSchema } from "../domain/jsonValue.js";
import { toolContractMetadata } from "./toolEffects.js";
import type { ToolContract } from "./toolContractTypes.js";

const inputSchema = z.strictObject({
  action: z.enum([
    "start",
    "resume",
    "status",
    "pause",
    "stop",
    "tools",
    "prove-affine",
    "install-tools",
    "trace-frida",
  ]),
  checkpoint: z.string().min(1).optional(),
  plan: z.string().min(1).optional(),
  binary: z.string().min(1).optional(),
  config: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  output: z.string().min(1).optional(),
  range: z
    .strictObject({
      min: z.number().int().safe(),
      max: z.number().int().safe(),
    })
    .optional(),
});
const outputSchema = z.object({ result: jsonValueSchema });
export const AUTONOMY_TOOL_CONTRACTS = [
  {
    name: "autonomous_investigation",
    ...toolContractMetadata("autonomous_investigation"),
    description:
      "Start or resume an authorized bounded reconstruction plan, inspect progress/tools, or request pause/stop. Reuses REA static providers, process capture and evidence. Executes caller-declared original, compiler and replica commands; model reconstruction requires explicit provider configuration. Suite success is not universal equivalence. Supply local plan/checkpoint paths; start/resume require both.",
    kind: "application",
    inputSchema,
    outputSchema,
    examples: [
      {
        title: "Inspect progress",
        input: { action: "status", checkpoint: "/tmp/rea-investigation.json" },
      },
    ],
  } as const satisfies ToolContract,
];
