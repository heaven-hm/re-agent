import { z } from "incur";

import type { DirectAnalysis } from "../composition/directAnalysis.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { radare2DisassemblyInputSchema } from "../domain/radare2Disassembly.js";
import { logCliCommand } from "../cliLogging.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";

/** Static function inventory through the active binary-session provider route. */
export const registerRadare2Commands = (
  cli: CliInstance,
  logger: Logger,
  runProviderAnalysis: DirectAnalysis["runProviderAnalysis"],
): void => {
  cli.command(CLI_COMMANDS.inspectRadare2FunctionInventory, {
    description: "List radare2-inferred function records for a local binary",
    args: z.object({
      path: z.string().describe("Local executable to inspect"),
    }),
    options: z.object({
      maxFunctions: z
        .number()
        .int()
        .min(1)
        .max(20_000)
        .default(5_000)
        .describe("Maximum inferred function rows returned"),
    }),
    run: ({ args, options }) =>
      logCliCommand(logger, CLI_COMMANDS.inspectRadare2FunctionInventory, () =>
        runProviderAnalysis(
          args.path,
          "inspect_radare2_function_inventory",
          { max_functions: options.maxFunctions },
          logger,
        ),
      ),
  });
  cli.command(CLI_COMMANDS.inspectRadare2Disassembly, {
    description:
      "Disassemble a bounded instruction range at a selected address",
    args: z.object({
      path: z.string().describe("Local executable to inspect"),
      address: z
        .string()
        .regex(/^0x[0-9a-f]{1,16}$/iu)
        .describe("Caller-selected virtual address, hexadecimal"),
    }),
    options: z.object({
      count: z
        .number()
        .int()
        .min(1)
        .max(512)
        .default(64)
        .describe("Maximum instructions to decode"),
    }),
    run: ({ args, options }) =>
      logCliCommand(logger, CLI_COMMANDS.inspectRadare2Disassembly, () =>
        runProviderAnalysis(
          args.path,
          "inspect_radare2_disassembly",
          radare2DisassemblyInputSchema.parse({
            address: args.address,
            count: options.count,
          }),
          logger,
        ),
      ),
  });
};
