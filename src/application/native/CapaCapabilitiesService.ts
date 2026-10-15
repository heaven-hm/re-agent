import { isAbsolute } from "node:path";
import type {
  AnalysisExecution,
  ExecutionOptions,
} from "../AnalysisProvider.js";
import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import {
  AnalysisCancelledError,
  AnalysisInputError,
  AnalysisOutputError,
} from "../../domain/analysisErrorCore.js";
import { analysisInputErrorFromIssues } from "../../domain/inputIssueProjection.js";
import { createEvidence, type Evidence } from "../../domain/evidence.js";
import {
  capaCapabilitiesSchema,
  inspectCapaCapabilitiesInputSchema,
  type InspectCapaCapabilitiesInput,
} from "../../domain/native/capaCapabilities.js";
import { err, ok, type Result } from "../../domain/result.js";
import { jsonObjectSchema, jsonValueSchema } from "../../domain/jsonValue.js";

export interface CapaCapabilitiesPort {
  close(): Promise<void>;
  inspect(
    input: InspectCapaCapabilitiesInput,
    options?: ExecutionOptions,
  ): Promise<Result<AnalysisExecution, AnalysisError>>;
}

/** Shared CLI/MCP workflow preserving caller identity and derived capability evidence. */
export class CapaCapabilitiesService {
  constructor(readonly provider: CapaCapabilitiesPort) {}
  close(): Promise<void> {
    return this.provider.close();
  }
  async inspect(
    rawInput: unknown,
    options?: ExecutionOptions,
  ): Promise<Result<Evidence, AnalysisError>> {
    const operation = "inspect_capa_capabilities";
    if (options?.signal?.aborted)
      return err(new AnalysisCancelledError(operation));
    const selected = inspectCapaCapabilitiesInputSchema.safeParse(rawInput);
    if (!selected.success)
      return err(
        analysisInputErrorFromIssues(
          operation,
          selected.error.issues,
          rawInput,
          { cause: selected.error },
        ),
      );
    if (!isAbsolute(selected.data.path))
      return err(
        new AnalysisInputError(operation, undefined, [
          {
            path: ["path"],
            reason: "invalid_format",
            message: "Expected an absolute filesystem path on this host.",
          },
        ]),
      );
    const outcome = await this.provider.inspect(selected.data, options);
    if (!outcome.ok) return outcome;
    const execution = outcome.value;
    const result = capaCapabilitiesSchema.safeParse(execution.result);
    if (
      !result.success ||
      execution.subject === null ||
      execution.subject.path !== selected.data.path ||
      execution.subject.sha256 !== result.data.artifact_sha256 ||
      execution.subject.format !== result.data.format ||
      result.data.backend !== selected.data.backend ||
      execution.provider.id !== "capa" ||
      !execution.provider.version ||
      execution.analysisProfile?.provider.id !== "capa" ||
      execution.analysisProfile.provider.version !== execution.provider.version
    )
      return err(
        new AnalysisOutputError(
          operation,
          "capa adapter changed the selected artifact, backend or provider identity",
        ),
      );
    if (options?.signal?.aborted)
      return err(new AnalysisCancelledError(operation));
    return ok(
      createEvidence(execution.subject, execution.provider, {
        operation,
        parameters: jsonObjectSchema.parse(selected.data),
        analysisProfile: execution.analysisProfile,
        result: jsonValueSchema.parse(result.data),
        ...(execution.rawResult === null
          ? {}
          : { rawResult: execution.rawResult }),
        confidence: "derived",
        limitations: execution.limitations,
        locations: execution.locations,
      }),
    );
  }
}
