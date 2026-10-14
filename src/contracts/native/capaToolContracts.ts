import {
  inspectCapaCapabilitiesInputSchema,
  capaCapabilitiesSchema,
} from "../../domain/native/capaCapabilities.js";
import { toolContractMetadata } from "../toolEffects.js";
import type { ToolContract } from "../toolContractTypes.js";
import { evidenceResultOf } from "../toolOutputSchemaPrimitives.js";

/** Optional installed capa analysis through the same CLI/MCP Evidence workflow. */
export const CAPA_TOOL_CONTRACTS = [
  {
    name: "inspect_capa_capabilities",
    ...toolContractMetadata("inspect_capa_capabilities"),
    kind: "native-provider",
    description:
      "Inspect one explicit local PE/ELF artifact with optional installed capa selected by REA_CAPA_PATH. Uses a private snapshot, bounded owned processes and complete JSON output; returns target/tool hash provenance, static rule match names/scopes/locations and extractor identity. Rule matches are derived hypotheses, not verified functions or runtime behavior; absent matches do not establish absent behavior. Requires configured compatible installed capa; does not download tools or execute target application code. Uses packaged default rules committed by tool binary hash. Unsupported, changed or malformed artifacts/output fail without success evidence.",
    inputSchema: inspectCapaCapabilitiesInputSchema,
    outputSchema: evidenceResultOf(capaCapabilitiesSchema),
    examples: [
      {
        title: "Identify capability candidates in an authorized executable",
        input: { path: "/artifacts/application.exe", backend: "auto" },
      },
    ],
  },
] as const satisfies readonly ToolContract[];

export type CapaToolName = (typeof CAPA_TOOL_CONTRACTS)[number]["name"];
