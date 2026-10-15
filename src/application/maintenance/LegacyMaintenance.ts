import { z } from "zod";
import { resolve } from "node:path";
import {
  maintenanceStages,
  discoverMaintenanceSkills,
  readMaintenanceFile,
  digestMaintenanceBytes,
} from "./SkillCatalog.js";
import {
  parseMemoryPattern,
  scanMemoryPattern,
} from "../../domain/maintenance/MemoryPattern.js";
import { autonomousPlanSchema } from "../autonomy/AutonomousPlan.js";

export const legacyMaintenanceRequestSchema = z
  .object({
    schema_version: z.literal(1),
    target_path: z.string().min(1),
    target_kind: z.enum(["software", "game"]),
    target_platform: z.enum(["windows", "linux", "macos"]),
    support_status: z.enum(["end-of-life", "unsupported"]),
    support_evidence: z.array(z.string().min(1)).min(1),
    authorization: z
      .object({
        basis: z.enum(["owner", "license", "written-permission"]),
        reference: z.string().min(1),
      })
      .strict(),
    goal: z.string().min(1),
    max_repair_iterations: z.number().int().min(1).max(100),
  })
  .strict();

/** Prepare scoped host-agent work. No target execution, edits or permission inference occur here. */
export const prepareLegacyMaintenance = async (
  requestPath: string,
  skillRoots: readonly string[],
) => {
  const requestBytes = await readMaintenanceFile(requestPath);
  const request = legacyMaintenanceRequestSchema.parse(
    JSON.parse(requestBytes.toString("utf8")),
  );
  const targetPath = resolve(request.target_path);
  const target = await readMaintenanceFile(targetPath, 256 * 1024 * 1024);
  const catalog = await discoverMaintenanceSkills(skillRoots);
  const selected = catalog.skills.filter(
    (skill) =>
      skill.targets.includes(request.target_kind) &&
      skill.platforms.includes(request.target_platform),
  );
  const stages = maintenanceStages.map((stage) => ({
    stage,
    skills: selected
      .filter((skill) => skill.stages.includes(stage))
      .map((skill) => skill.id),
  }));
  const missing = stages
    .filter((stage) => !stage.skills.length)
    .map((stage) => stage.stage);
  return {
    status:
      catalog.rejected.length || missing.length
        ? "INCOMPLETE"
        : "READY_FOR_HOST_AGENT",
    request,
    request_sha256: digestMaintenanceBytes(requestBytes),
    target: {
      path: targetPath,
      sha256: digestMaintenanceBytes(target),
      bytes: target.length,
    },
    authorization_status: "caller-attested-not-independently-verified",
    stages,
    missing_stages: missing,
    catalog,
    execution: "host-agent-via-existing-CLI-or-MCP",
    controller: "autonomy-run",
    repair_policy: {
      max_iterations: request.max_repair_iterations,
      preserve_original: true,
      edit_replica_only: true,
      require_regression_comparison: true,
    },
    verification_status: "UNVERIFIED",
    limitations: [
      "This prepares an investigation; it does not discover bugs, generate a port, or execute repairs by itself.",
      "End-of-life status does not grant permission; supplied authorization and support references are attestations.",
      "A skill is untrusted instructions, not a grant of target execution or modification authority.",
    ],
  };
};

/** Scan an explicitly captured buffer; offsets are file offsets, never inferred live addresses. */
export const inspectMemorySnapshotPattern = async (
  path: string,
  text: string,
  maxMatches: number,
) => {
  const pattern = parseMemoryPattern(text);
  const bytes = await readMaintenanceFile(resolve(path), 64 * 1024 * 1024);
  const scan = scanMemoryPattern(bytes, pattern, maxMatches);
  return {
    status: scan.truncated ? "PARTIAL" : "COMPLETE",
    path: resolve(path),
    sha256: digestMaintenanceBytes(bytes),
    size: bytes.length,
    pattern: text,
    match_offsets: scan.offsets,
    matches_truncated: scan.truncated,
    examined_bytes: scan.examinedBytes,
    provenance:
      "cheat-agent buffer-pattern algorithm, strict parser adaptation (MIT)",
    limitations: [
      "Snapshot file offsets do not establish current process addresses or semantic field identity.",
      "No process was opened, executed, modified or restarted by this operation.",
    ],
  };
};

/** Admit a caller-supplied controller plan without inventing commands from community instructions. */
export const admitLegacyControllerPlan = (
  prepared: Awaited<ReturnType<typeof prepareLegacyMaintenance>>,
  input: unknown,
) => {
  if (prepared.status !== "READY_FOR_HOST_AGENT")
    throw new Error(
      "Cannot run maintenance with rejected skills or uncovered stages",
    );
  const plan = autonomousPlanSchema.parse(input);
  if (resolve(plan.investigation.binaryPath) !== prepared.target.path)
    throw new Error(
      "Controller binary does not match the authorized maintenance target",
    );
  if (plan.investigation.maxIterations > prepared.request.max_repair_iterations)
    throw new Error("Controller exceeds the maintenance repair budget");
  return plan;
};
