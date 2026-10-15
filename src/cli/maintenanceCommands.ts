import { z } from "incur";
import { fileURLToPath } from "node:url";
import type { CliInstance } from "./types.js";
import { CLI_COMMANDS } from "../cliCommandNames.js";
import { discoverMaintenanceSkills } from "../application/maintenance/SkillCatalog.js";
import {
  prepareLegacyMaintenance,
  inspectMemorySnapshotPattern,
  admitLegacyControllerPlan,
} from "../application/maintenance/LegacyMaintenance.js";
import { readMaintenanceFile } from "../application/maintenance/SkillCatalog.js";
import { runAutonomousPlan } from "../composition/autonomy.js";
import { withCommandCancellation } from "./commandCancellation.js";

const bundledSkills = fileURLToPath(
  new URL("../../maintenance-skills/", import.meta.url),
);

export const registerMaintenanceCommands = (
  cli: CliInstance,
  environment: Readonly<NodeJS.ProcessEnv>,
): void => {
  const roots = z.object({
    directory: z
      .array(z.string())
      .optional()
      .describe(
        "Additional local community skill roots; metadata only, never executed",
      ),
  });
  cli.command(CLI_COMMANDS.maintenanceSkills, {
    description:
      "Discover and validate bundled and local legacy-maintenance skills without running their code",
    options: roots,
    run: ({ options }) =>
      discoverMaintenanceSkills([bundledSkills, ...(options.directory ?? [])]),
  });
  cli.command(CLI_COMMANDS.maintenancePlan, {
    description:
      "Bind an authorized unsupported target to modular host-agent investigation and verification skills",
    args: z.object({ request: z.string() }),
    options: roots,
    run: ({ args, options }) =>
      prepareLegacyMaintenance(args.request, [
        bundledSkills,
        ...(options.directory ?? []),
      ]),
  });
  cli.command(CLI_COMMANDS.memorySnapshotPattern, {
    description:
      "Read-only masked-byte search in an explicitly supplied memory snapshot or binary file",
    args: z.object({ path: z.string(), pattern: z.string() }),
    options: z.object({
      maxMatches: z.number().int().min(1).max(100000).default(4096),
    }),
    run: ({ args, options }) =>
      inspectMemorySnapshotPattern(args.path, args.pattern, options.maxMatches),
  });
  cli.command(CLI_COMMANDS.maintenanceRun, {
    description:
      "Run a caller-selected bounded controller plan within an authorized legacy maintenance scope",
    args: z.object({
      request: z.string(),
      plan: z.string(),
      checkpoint: z.string(),
    }),
    options: z.object({
      directory: z.array(z.string()).optional(),
      resume: z.boolean().default(false),
    }),
    run: async ({ args, options }) =>
      withCommandCancellation(async (signal) => {
        const prepared = await prepareLegacyMaintenance(args.request, [
          bundledSkills,
          ...(options.directory ?? []),
        ]);
        const plan = admitLegacyControllerPlan(
          prepared,
          JSON.parse((await readMaintenanceFile(args.plan)).toString("utf8")),
        );
        const result = await runAutonomousPlan(plan, args.checkpoint, {
          environment,
          signal,
          resume: options.resume,
        });
        return {
          maintenance: {
            target: prepared.target,
            request_sha256: prepared.request_sha256,
            skills: prepared.catalog.skills.map((skill) => ({
              id: skill.id,
              manifest_sha256: skill.manifest_sha256,
              instructions_sha256: skill.instructions_sha256,
            })),
          },
          status: result.status,
          iteration: result.iteration,
          checkpoint: args.checkpoint,
          evidence_count: result.evidence.length,
          limitation:
            "Controller result applies to its declared suite, not whole-application equivalence.",
        };
      }),
  });
};
