import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createEvidence, type Evidence } from "../../domain/evidence.js";
import { jsonValueSchema } from "../../domain/jsonValue.js";
import { processCaptureComparisonSchema } from "../../domain/process/processComparison.js";
import {
  parseProcessCapture,
  type ProcessCapture,
} from "../../domain/process/processCaptureParsing.js";
import { compareProcessExitOutcomes } from "../../domain/process/processExitOutcome.js";
import {
  OwnedCommandFailure,
  runOwnedCommand,
} from "../../process/OwnedCommand.js";
import {
  captureProcessScenarioFile,
  compareProcessEvidenceFiles,
  isProcessCliFailure,
} from "../process/ProcessCli.js";
import {
  classifyInvestigationComparison,
  type InvestigationState,
} from "./InvestigationContracts.js";
import { AUTONOMY_PROVIDER } from "./InvestigationWorkspace.js";

/** REA process capture and build adapter for the autonomous investigation. */
export class InvestigationProcessEvidence {
  constructor(
    private readonly state: InvestigationState,
    private readonly storePath: string,
    private readonly host: {
      readonly save: (event: string, detail: string) => Promise<void>;
      readonly record: (value: Evidence) => Evidence;
      readonly signal: () => AbortSignal;
      readonly assertBinary: () => Promise<void>;
    },
  ) {}
  async build(): Promise<void> {
    const command = this.state.config.build;
    if (command === undefined) return;
    let output;
    try {
      output = await runOwnedCommand(
        {
          command: command.command,
          arguments: command.arguments,
          cwd: command.cwd ?? this.state.config.workspace,
          runId: `${this.state.id}-build-${String(this.state.iteration)}`,
        },
        {
          timeoutMs: this.state.config.timeoutMs,
          diagnosticBytes: this.state.config.outputLimitBytes,
        },
        { signal: this.host.signal() },
      );
    } catch (cause) {
      if (cause instanceof OwnedCommandFailure) {
        this.host.record(
          createEvidence(undefined, AUTONOMY_PROVIDER, {
            predicateType: "rea.reconstruction-build",
            operation: "build_reconstruction",
            parameters: {
              command: command.command,
              arguments: command.arguments,
              working_directory: command.cwd ?? this.state.config.workspace,
              original_sha256: this.state.binarySha256,
            },
            result: jsonValueSchema.parse({
              status: "failed",
              reason: cause.reason,
              snapshot: cause.snapshot,
              cleanup_failure: cause.cleanupFailure,
            }),
            confidence: "observed",
            authority: "controlled-replay",
            limitations: [
              "Failed build has no compiled replica behavior evidence.",
            ],
          }),
        );
        await this.host.save("build-failure", JSON.stringify(cause.snapshot));
      }
      throw cause;
    }
    this.host.record(
      createEvidence(undefined, AUTONOMY_PROVIDER, {
        predicateType: "rea.reconstruction-build",
        operation: "build_reconstruction",
        parameters: {
          command: command.command,
          arguments: command.arguments,
          working_directory: command.cwd ?? this.state.config.workspace,
          original_sha256: this.state.binarySha256,
        },
        result: jsonValueSchema.parse(output),
        confidence: "observed",
        authority: "controlled-replay",
        limitations: [
          "Successful compilation does not establish behavioral equivalence.",
        ],
      }),
    );
    await this.host.save("build", JSON.stringify(output));
  }
  async compare(): Promise<void> {
    await this.host.assertBinary();
    const { config } = this.state;
    const directory = resolve(
      dirname(this.storePath),
      `${this.state.id}-captures`,
      String(this.state.iteration),
    );
    await mkdir(directory, { recursive: true });
    this.state.results = [];
    for (const test of config.cases) {
      this.host.signal().throwIfAborted();
      const sides: string[] = [];
      const captures: { evidence: Evidence; capture: ProcessCapture }[] = [];
      for (const [side, command] of [
        ["original", config.original],
        ["replica", config.replica],
      ] as const) {
        const scenarioPath = resolve(
          directory,
          `${test.id}-${side}-scenario.json`,
        );
        const capturePath = resolve(
          directory,
          `${test.id}-${side}-evidence.json`,
        );
        await writeFile(
          scenarioPath,
          JSON.stringify({
            executable: command.command,
            arguments: [...command.arguments, ...test.arguments],
            working_directory: command.cwd ?? config.workspace,
            timeout_ms: config.timeoutMs,
            idle_timeout_ms: config.timeoutMs,
            limits: { output_bytes: config.outputLimitBytes },
            normalization: {
              time_bucket_ms: config.timingBucketMs ?? config.timeoutMs,
            },
            events:
              test.stdin === undefined
                ? []
                : [{ type: "input", at_ms: 50, data: test.stdin }],
          }),
        );
        const captured = await captureProcessScenarioFile(
          scenarioPath,
          process.env,
          this.host.signal(),
        );
        if (isProcessCliFailure(captured)) throw new Error(captured.message);
        const captureEvidence = this.host.record(captured);
        captures.push({
          evidence: captureEvidence,
          capture: parseProcessCapture(captureEvidence.normalized_result),
        });
        await writeFile(capturePath, JSON.stringify(captured));
        sides.push(capturePath);
      }
      const compared = await compareProcessEvidenceFiles(sides[0]!, sides[1]!);
      if (isProcessCliFailure(compared)) throw new Error(compared.message);
      const evidence = this.host.record(compared);
      const result = processCaptureComparisonSchema.parse(
        evidence.normalized_result,
      );
      const values = config.dimensions.map((dimension) => result[dimension]);
      const { outcomes, evidence: outcomeEvidence } =
        this.recordExitComparison(captures);
      values.push(outcomes.status);
      const status = classifyInvestigationComparison(values);
      await writeFile(
        resolve(directory, `${test.id}-verification.json`),
        JSON.stringify(
          {
            status,
            dimensions: config.dimensions,
            comparison_evidence_id: evidence.evidence_id,
            exit_comparison_evidence_id: outcomeEvidence.evidence_id,
            compared_overall: result.status,
            limitations: [...this.state.limitations, ...result.limitations],
          },
          null,
          2,
        ),
      );
      this.state.results.push({
        caseId: test.id,
        comparisonEvidenceId: evidence.evidence_id,
        exitComparisonEvidenceId: outcomeEvidence.evidence_id,
        status,
      });
      if (status === "fail" && !this.state.regressions.includes(test.id))
        this.state.regressions.push(test.id);
      await this.host.save("comparison", `${test.id}: ${status}`);
    }
  }
  private recordExitComparison(
    captures: readonly { evidence: Evidence; capture: ProcessCapture }[],
  ) {
    const outcomes = compareProcessExitOutcomes(
      captures[0]!.capture,
      captures[1]!.capture,
    );
    const evidence = this.host.record(
      createEvidence(undefined, AUTONOMY_PROVIDER, {
        predicateType: "rea.process-exit-outcomes",
        operation: "compare_process_exit_outcomes",
        parameters: {
          left_evidence_id: captures[0]!.evidence.evidence_id,
          right_evidence_id: captures[1]!.evidence.evidence_id,
        },
        result: outcomes,
        confidence: "derived",
        authority: "analyst-inference",
        evidenceLinks: captures.map((item) => item.evidence.evidence_id),
        limitations: outcomes.limitations,
      }),
    );
    return { outcomes, evidence };
  }
}
