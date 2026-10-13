import { readFile } from "node:fs/promises";
import type { EvidenceMcpServer } from "./EvidenceMcpServer.js";
import { toolContract } from "../contracts/toolContracts.js";
import { toolRegistrationOptions } from "./toolRegistrationOptions.js";
import {
  runAutonomousPlan,
  readAutonomousStatus,
  controlAutonomousInvestigation,
} from "../composition/autonomy.js";
import { discoverTools } from "../application/autonomy/ToolDiscovery.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
import { resolveAutonomyEnvironment } from "../composition/autonomyEnvironment.js";
import { proveAffineExpressions } from "../application/autonomy/AffineEquivalenceProof.js";
import {
  installAutonomyTools,
  AutonomyFunctionTraceScope,
} from "../composition/autonomyToolInstallation.js";

/** Stateful controller shares the production workflow with CLI callers. */
export const registerAutonomyTool = (
  server: EvidenceMcpServer,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  const runtimeScope = new AutonomyFunctionTraceScope();
  const closeServer = server.close.bind(server);
  server.close = async () => {
    const results = await Promise.allSettled([
      closeServer(),
      runtimeScope.close(),
    ]);
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length)
      throw new AggregateError(failures, "REA autonomy runtime cleanup failed");
  };
  const contract = toolContract("autonomous_investigation");
  server.registerTool(
    contract.name,
    toolRegistrationOptions(contract),
    async (input, context) => {
      try {
        let result: unknown;
        if (input.action === "install-tools") {
          if (input.binary === undefined)
            throw new TypeError(
              "Binary path is required for tool health checks",
            );
          result = await installAutonomyTools(
            input.binary,
            context.mcpReq.signal,
          );
        } else if (input.action === "trace-frida") {
          if (input.config === undefined)
            throw new TypeError("Frida experiment config path is required");
          result = await runtimeScope.run(
            JSON.parse(await readFile(input.config, "utf8")),
            context.mcpReq.signal,
          );
        } else if (input.action === "tools")
          result = await discoverTools({
            environment: await resolveAutonomyEnvironment(environment),
          });
        else {
          if (input.checkpoint === undefined)
            throw new TypeError("Checkpoint path is required");
          if (input.action === "prove-affine") {
            if (
              input.source === undefined ||
              input.output === undefined ||
              input.range === undefined
            )
              throw new TypeError(
                "Expression proof requires source, output and range",
              );
            result = await proveAffineExpressions(
              {
                checkpoint: input.checkpoint,
                source: input.source,
                outputDirectory: input.output,
                range: input.range,
              },
              context.mcpReq.signal,
            );
          } else if (input.action === "status")
            result = await readAutonomousStatus(input.checkpoint);
          else if (input.action === "pause" || input.action === "stop") {
            await controlAutonomousInvestigation(
              input.checkpoint,
              input.action,
            );
            result = { requested: input.action, checkpoint: input.checkpoint };
          } else {
            if (input.plan === undefined)
              throw new TypeError("Plan path is required for start/resume");
            result = await runAutonomousPlan(
              JSON.parse(await readFile(input.plan, "utf8")),
              input.checkpoint,
              {
                resume: input.action === "resume",
                environment,
                signal: context.mcpReq.signal,
              },
            );
          }
        }
        const output = { result: jsonValueSchema.parse(result) };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (cause: unknown) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                cause instanceof Error
                  ? cause.message
                  : "Autonomous investigation failed",
            },
          ],
        };
      }
    },
  );
};
