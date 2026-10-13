import { z } from "zod";
import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { evidenceSchema, parseEvidence } from "../../domain/evidence.js";
import { parseProcessCapture } from "../../domain/process/processCaptureParsing.js";
import { compareProcessExitOutcomes } from "../../domain/process/processExitOutcome.js";
import {
  PROCESS_COMPARISON_DIMENSIONS,
  processCaptureComparisonSchema,
} from "../../domain/process/processComparison.js";

export const commandSchema = z.strictObject({
  command: z.string().min(1),
  arguments: z.array(z.string()).default([]),
  cwd: z.string().optional(),
});
export const investigationConfigSchema = z
  .strictObject({
    binaryPath: z.string().min(1),
    workspace: z.string().min(1),
    original: commandSchema,
    replica: commandSchema,
    build: commandSchema.optional(),
    cases: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[A-Za-z0-9_-]+$/u),
          arguments: z.array(z.string()).default([]),
          stdin: z.string().optional(),
        }),
      )
      .min(1),
    dimensions: z
      .array(z.enum(PROCESS_COMPARISON_DIMENSIONS))
      .min(1)
      .default(["terminal", "interaction"]),
    maxIterations: z.number().int().min(1).max(100).default(5),
    timeoutMs: z.number().int().min(1).max(3_600_000).default(10_000),
    timingBucketMs: z.number().int().min(1).max(3_600_000).optional(),
    outputLimitBytes: z
      .number()
      .int()
      .min(1)
      .max(100_000_000)
      .default(1_000_000),
  })
  .superRefine((value, context) => {
    if (new Set(value.cases.map((item) => item.id)).size !== value.cases.length)
      context.addIssue({
        code: "custom",
        message: "Case IDs must be unique",
        path: ["cases"],
      });
  });
export type InvestigationConfig = z.infer<typeof investigationConfigSchema>;
export const functionLifecycleSchema = z.enum([
  "DISCOVERED",
  "ANALYZED",
  "RUNTIME_OBSERVED",
  "RECONSTRUCTED",
  "TESTED",
  "VERIFIED",
  "REJECTED",
  "UNRESOLVED",
]);
export const investigationStateSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  binarySha256: z.string().regex(/^[a-f0-9]{64}$/u),
  config: investigationConfigSchema,
  originalArgumentSha256: z.record(z.string(), z.string()).default({}),
  status: z.enum([
    "ready",
    "running",
    "paused",
    "stopped",
    "suite-passed",
    "budget-exhausted",
    "failed",
  ]),
  iteration: z.number().int().nonnegative(),
  evidence: z.array(evidenceSchema),
  regressions: z.array(z.string()),
  functions: z.array(
    z.object({
      address: z.string(),
      name: z.string(),
      lifecycle: functionLifecycleSchema,
      evidenceIds: z.array(z.string()),
    }),
  ),
  history: z.array(
    z.object({ at: z.string(), event: z.string(), detail: z.string() }),
  ),
  results: z.array(
    z.object({
      caseId: z.string(),
      comparisonEvidenceId: z.string(),
      exitComparisonEvidenceId: z.string().optional(),
      status: z.enum(["pass", "fail", "unknown"]),
    }),
  ),
  pendingRollback: z.array(
    z.object({ path: z.string(), originalBase64: z.string().nullable() }),
  ),
  limitations: z.array(z.string()),
});
export type InvestigationState = z.infer<typeof investigationStateSchema>;

/** Authenticate stored observations and recompute every finite comparison claim. */
export const parseInvestigationState = (input: unknown): InvestigationState => {
  const state = investigationStateSchema.parse(input);
  state.evidence = state.evidence.map(parseEvidence);
  const records = new Map(
    state.evidence.map((item) => [item.evidence_id, item]),
  );
  if (records.size !== state.evidence.length)
    throw new Error("Duplicate checkpoint Evidence ID");
  for (const item of state.results)
    authenticateComparisonClaim(state, item, records);
  if (
    new Set(state.results.map((item) => item.caseId)).size !==
    state.results.length
  )
    throw new Error("Duplicate checkpoint result case");
  if (
    state.status === "suite-passed" &&
    (state.results.length !== state.config.cases.length ||
      state.results.some((item) => item.status !== "pass"))
  )
    throw new Error(
      "Checkpoint suite-passed claim lacks complete passing results",
    );
  for (const fn of state.functions)
    for (const link of fn.evidenceIds)
      if (!records.has(link))
        throw new Error("Checkpoint function Evidence missing");
  return state;
};

const authenticateComparisonClaim = (
  state: InvestigationState,
  item: InvestigationState["results"][number],
  records: ReadonlyMap<string, z.infer<typeof evidenceSchema>>,
): void => {
  const evidence = records.get(item.comparisonEvidenceId);
  if (evidence?.operation !== "compare_process_captures")
    throw new Error("Checkpoint comparison Evidence missing");
  for (const link of evidence.evidence_links)
    if (!records.has(link))
      throw new Error("Checkpoint comparison source Evidence missing");
  const compared = processCaptureComparisonSchema.parse(
    evidence.normalized_result,
  );
  const parameters = z
    .object({ left_evidence_id: z.string(), right_evidence_id: z.string() })
    .parse(evidence.parameters);
  const left = records.get(parameters.left_evidence_id),
    right = records.get(parameters.right_evidence_id);
  if (
    left?.operation !== "capture_process_scenario" ||
    right?.operation !== "capture_process_scenario"
  )
    throw new Error("Checkpoint exit outcome lacks process capture sources");
  const outcome = compareProcessExitOutcomes(
    parseProcessCapture(left.normalized_result),
    parseProcessCapture(right.normalized_result),
  );
  if (item.exitComparisonEvidenceId !== undefined) {
    const exitRecord = records.get(item.exitComparisonEvidenceId);
    if (
      exitRecord?.operation !== "compare_process_exit_outcomes" ||
      digestCanonicalValue(exitRecord.normalized_result) !==
        digestCanonicalValue(outcome)
    )
      throw new Error("Checkpoint exit comparison contradicts captures");
  }
  if (
    item.status !==
    classifyInvestigationComparison([
      ...state.config.dimensions.map((dimension) => compared[dimension]),
      outcome.status,
    ])
  )
    throw new Error("Checkpoint comparison claim contradicts Evidence");
  if (!state.config.cases.some((test) => test.id === item.caseId))
    throw new Error("Checkpoint result refers to undeclared case");
};

export const classifyInvestigationComparison = (
  values: readonly string[],
): "pass" | "fail" | "unknown" =>
  values.some((value) =>
    ["changed", "added", "removed", "contradiction"].includes(value),
  )
    ? "fail"
    : values.every((value) => value === "unchanged")
      ? "pass"
      : "unknown";
export interface RepairCandidate {
  readonly evidence?: readonly z.infer<typeof evidenceSchema>[];
  readonly files: readonly {
    readonly path: string;
    readonly content: string;
  }[];
}
export interface InvestigationHooks {
  readonly discover?: (
    config: InvestigationConfig,
    signal: AbortSignal,
  ) => Promise<readonly z.infer<typeof evidenceSchema>[]>;
  readonly reconstruct?: (
    state: Readonly<InvestigationState>,
    signal: AbortSignal,
  ) => Promise<RepairCandidate | undefined>;
  readonly repair?: (
    state: Readonly<InvestigationState>,
    signal: AbortSignal,
  ) => Promise<RepairCandidate | undefined>;
}
