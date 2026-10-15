import {
  radare2FunctionInventorySchema,
  radare2InventoryInputSchema,
} from "../../domain/radare2FunctionInventory.js";
import type { ToolContract } from "../toolContractTypes.js";
import { evidenceResultOf } from "../toolOutputSchemaPrimitives.js";
import { toolContractMetadata } from "../toolEffects.js";
import {
  radare2DisassemblyInputSchema,
  radare2DisassemblySchema,
} from "../../domain/radare2Disassembly.js";

/** Static, read-only radare2 observations routed through the active binary session. */
export const RADARE2_TOOL_CONTRACTS = [
  {
    name: "inspect_radare2_function_inventory",
    ...toolContractMetadata("inspect_radare2_function_inventory"),
    kind: "native-provider",
    description:
      "Run installed radare2 static analysis against the caller-selected active executable and return its function inventory with exact artifact/tool hashes, engine version/path, command arguments and bounded output digest. This reports radare2's inferred function records, not proof that all true functions or boundaries were recovered. The target is opened as data and never executed; radare2 itself is launched as an owned process.",
    inputSchema: radare2InventoryInputSchema,
    outputSchema: evidenceResultOf(radare2FunctionInventorySchema),
    examples: [
      {
        title: "Inventory inferred functions from an opened binary",
        input: { max_functions: 5000 },
      },
    ],
  },
  {
    name: "inspect_radare2_disassembly",
    ...toolContractMetadata("inspect_radare2_disassembly"),
    kind: "native-provider",
    description:
      "Statically decode a caller-selected address in the active executable with radare2's bounded pdj command. Returns only validated fields emitted by radare2, plus target/tool identity, command output digests, and Evidence provenance. This does not establish that the address is a function or reachable at runtime.",
    inputSchema: radare2DisassemblyInputSchema,
    outputSchema: evidenceResultOf(radare2DisassemblySchema),
    examples: [
      {
        title: "Decode at most 64 instructions starting at a selected address",
        input: { address: "0x1000", count: 64 },
      },
    ],
  },
] as const satisfies readonly ToolContract[];

export type Radare2ToolName = (typeof RADARE2_TOOL_CONTRACTS)[number]["name"];
