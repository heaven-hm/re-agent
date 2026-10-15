import { z } from "incur";
import { resolve } from "node:path";
import { createCapaCapabilitiesService } from "../composition/capa.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { logCliCommand } from "../cliLogging.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { analysisErrorWithCleanupFailure } from "../domain/analysisErrorCleanup.js";
import { projectAnalysisError } from "../domain/analysisErrorProjection.js";
import type { Logger } from "pino";
import type { CliInstance } from "./types.js";
import { withCommandCancellation } from "./commandCancellation.js";

/** Resolve an operator-selected capa snapshot through the shared inspection workflow. */
export const registerCapaCommands = (
  cli: CliInstance,
  logger: Logger,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  const service = createCapaCapabilitiesService(environment);
  cli.command(CLI_COMMANDS.inspectCapaCapabilities, {
    description:
      "Identify static capability candidates with optional installed capa",
    args: z.object({
      path: z.string().describe("Local capa database snapshot"),
    }),
    options: z.object({
      backend: z.enum(["auto", "vivisect", "pefile"]).optional(),
      timeoutMs: z.number().int().min(1).max(600000).optional(),
      maxFileBytes: z.number().int().min(1).max(268435456).optional(),
      maxOutputBytes: z.number().int().min(1).max(16777216).optional(),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        logCliCommand(
          logger,
          CLI_COMMANDS.inspectCapaCapabilities,
          async () => {
            const inspection = await service
              .inspect(
                {
                  path: resolve(args.path),
                  ...(options.backend === undefined
                    ? {}
                    : { backend: options.backend }),
                  ...(options.timeoutMs === undefined
                    ? {}
                    : { timeout_ms: options.timeoutMs }),
                  ...(options.maxFileBytes === undefined
                    ? {}
                    : { max_file_bytes: options.maxFileBytes }),
                  ...(options.maxOutputBytes === undefined
                    ? {}
                    : { max_output_bytes: options.maxOutputBytes }),
                },
                { signal },
              )
              .then(
                (result) => ({ result }),
                (cause: unknown) => ({ cause }),
              );
            try {
              await service.close();
            } catch (cause: unknown) {
              const primary =
                "cause" in inspection
                  ? inspection.cause
                  : inspection.result.ok
                    ? undefined
                    : inspection.result.error;
              if (
                primary instanceof AnalysisError &&
                cause instanceof AnalysisError
              )
                throw analysisErrorWithCleanupFailure(
                  primary,
                  cause,
                  "inspect_capa_capabilities",
                );
              if ("cause" in inspection)
                throw new AggregateError(
                  [inspection.cause, cause],
                  "capa inspection and provider cleanup both failed",
                  { cause: inspection.cause },
                );
              throw cause;
            }
            if ("cause" in inspection) throw inspection.cause;
            return inspection.result.ok
              ? inspection.result.value
              : projectAnalysisError(inspection.result.error);
          },
        ),
      ),
  });
};
