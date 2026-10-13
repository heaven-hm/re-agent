import { z } from "incur";
import { readFile } from "node:fs/promises";
import type { CliInstance } from "./types.js";
import {
  runAutonomousPlan,
  readAutonomousStatus,
  controlAutonomousInvestigation,
} from "../composition/autonomy.js";
import { discoverTools } from "../application/autonomy/ToolDiscovery.js";
import { startAutonomyDashboard } from "../composition/autonomyDashboard.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { withCommandCancellation } from "./commandCancellation.js";
import { resolveAutonomyEnvironment } from "../composition/autonomyEnvironment.js";
import { proveAffineExpressions } from "../application/autonomy/AffineEquivalenceProof.js";
import {
  installAutonomyTools,
  AutonomyFunctionTraceScope,
} from "../composition/autonomyToolInstallation.js";

/** Unified commands extend REA's existing CLI without changing upstream operations. */
export const registerAutonomyCommands = (
  cli: CliInstance,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  cli.command(CLI_COMMANDS.autonomyInstallTools, {
    description:
      "Install missing supported analysis engines in an isolated workspace using official checksum-verified wheels",
    args: z.object({ binary: z.string() }),
    run: ({ args }) =>
      withCommandCancellation((signal) =>
        installAutonomyTools(args.binary, signal),
      ),
  });
  cli.command(CLI_COMMANDS.autonomyTraceFrida, {
    description:
      "Run an owned function instrumentation experiment with static/runtime address and instruction correlation",
    args: z.object({ config: z.string() }),
    run: async ({ args }) =>
      withCommandCancellation(async (signal) =>
        (async () => {
          const scope = new AutonomyFunctionTraceScope();
          try {
            return await scope.run(
              JSON.parse(await readFile(args.config, "utf8")),
              signal,
            );
          } finally {
            await scope.close();
          }
        })(),
      ),
  });
  cli.command(CLI_COMMANDS.autonomyProveAffine, {
    description:
      "Check extracted original/replica arithmetic expressions with Z3 under stated assumptions",
    args: z.object({
      checkpoint: z.string(),
      source: z.string(),
      output: z.string(),
    }),
    options: z.object({
      min: z.number().int().safe(),
      max: z.number().int().safe(),
      solver: z.string().optional(),
    }),
    run: ({ args, options }) =>
      withCommandCancellation((signal) =>
        proveAffineExpressions(
          {
            checkpoint: args.checkpoint,
            source: args.source,
            outputDirectory: args.output,
            range: { min: options.min, max: options.max },
            ...(options.solver === undefined ? {} : { solver: options.solver }),
          },
          signal,
        ),
      ),
  });
  cli.command(CLI_COMMANDS.autonomyUi, {
    description:
      "Open a local REA Engine investigation dashboard for a declared plan",
    args: z.object({ plan: z.string(), checkpoint: z.string() }),
    options: z.object({ port: z.number().int().min(0).max(65535).default(0) }),
    run: async ({ args, options }) => {
      const dashboard = await startAutonomyDashboard(
        args.plan,
        args.checkpoint,
        options.port,
        environment,
      );
      const shutdown = () => {
        void dashboard.close().finally(() => {
          process.off("SIGINT", shutdown);
          process.off("SIGTERM", shutdown);
        });
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
      return { url: dashboard.url };
    },
  });
  cli.command(CLI_COMMANDS.autonomyTools, {
    description:
      "Discover reusable analysis/build tools and REA provider readiness",
    run: async () =>
      discoverTools({
        environment: await resolveAutonomyEnvironment(environment),
      }),
  });
  cli.command(CLI_COMMANDS.autonomyRun, {
    description:
      "Run a bounded evidence-backed reconstruction/build/comparison/repair plan",
    args: z.object({ plan: z.string(), checkpoint: z.string() }),
    options: z.object({ resume: z.boolean().default(false) }),
    run: async ({ args, options }) => {
      const plan: unknown = JSON.parse(await readFile(args.plan, "utf8"));
      const result = await withCommandCancellation((signal) =>
        runAutonomousPlan(plan, args.checkpoint, {
          resume: options.resume,
          environment,
          signal,
        }),
      );
      return summarize(result);
    },
  });
  cli.command(CLI_COMMANDS.autonomyStatus, {
    description:
      "Read investigation progress and evidence-backed suite results",
    args: z.object({ checkpoint: z.string() }),
    run: async ({ args }) =>
      summarize(await readAutonomousStatus(args.checkpoint)),
  });
  for (const action of ["pause", "stop"] as const)
    cli.command(
      action === "pause"
        ? CLI_COMMANDS.autonomyPause
        : CLI_COMMANDS.autonomyStop,
      {
        description: `${action} an investigation through its persisted owner control channel`,
        args: z.object({ checkpoint: z.string() }),
        run: async ({ args }) => {
          await controlAutonomousInvestigation(args.checkpoint, action);
          return { requested: action, checkpoint: args.checkpoint };
        },
      },
    );
};

export const summarize = (
  state: Awaited<ReturnType<typeof readAutonomousStatus>>,
) => ({
  id: state.id,
  status: state.status,
  iteration: state.iteration,
  binary_sha256: state.binarySha256,
  functions: state.functions,
  results: state.results,
  regressions: state.regressions,
  evidence_ids: state.evidence.map((item) => item.evidence_id),
  limitations: state.limitations,
});
