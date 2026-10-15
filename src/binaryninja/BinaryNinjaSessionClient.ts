import {
  ABORTED,
  waitForAbortable,
} from "../application/binary/AbortablePromise.js";
import {
  createAnalysisExecution,
  type AnalysisClient,
  type AnalysisOperation,
  type ExecutionOptions,
} from "../application/AnalysisProvider.js";
import {
  AnalysisCancelledError,
  AnalysisCapabilityUnavailableError,
  AnalysisProtocolError,
} from "../domain/analysisErrorCore.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import type { AnalysisProfileCommitment } from "../domain/analysisProfile.js";
import { jsonValueSchema, type JsonValue } from "../domain/jsonValue.js";
import { err, ok, type Result } from "../domain/result.js";
import type { BinaryNinjaConfiguration } from "./BinaryNinjaConfiguration.js";
import type { BinaryNinjaMcpConnection } from "./BinaryNinjaMcpConnection.js";
import {
  BINARYNINJA_LIMITATIONS,
  BINARYNINJA_OPERATIONS,
  BINARYNINJA_PROVIDER_IDENTITY,
  type BinaryNinjaOperation,
} from "./BinaryNinjaProviderCapabilities.js";
import { parseBinaryNinjaInput } from "./BinaryNinjaInput.js";
import { BinaryNinjaOperationRunner } from "./BinaryNinjaOperationRunner.js";

const operationSet: ReadonlySet<string> = new Set(BINARYNINJA_OPERATIONS);

const isBinaryNinjaOperation = (
  operation: string,
): operation is BinaryNinjaOperation => operationSet.has(operation);

const wasCancelled = (options: ExecutionOptions | undefined): boolean =>
  options?.signal?.aborted === true;

/** Serial read-only analysis session backed by Binary Ninja MCP server. */
export class BinaryNinjaSessionClient implements AnalysisClient {
  #tail: Promise<void> = Promise.resolve();
  #startup: Promise<void> | undefined;
  #closed = false;
  #closing = false;
  #availableTools: readonly string[] = [];

  constructor(
    private readonly config: BinaryNinjaConfiguration,
    private readonly target: BinaryTarget,
    private readonly connection: BinaryNinjaMcpConnection,
    private readonly profile?: AnalysisProfileCommitment,
  ) {}

  execute(
    operation: AnalysisOperation,
    parameters: Readonly<Record<string, JsonValue>>,
    options?: ExecutionOptions,
  ) {
    const call = this.#tail.then(() =>
      this.#execute(operation, parameters, options),
    );
    this.#tail = call.then(
      () => undefined,
      () => undefined,
    );
    return call;
  }

  async executeIfReady(
    operation: AnalysisOperation,
    parameters: Readonly<Record<string, JsonValue>>,
    options?: ExecutionOptions,
  ) {
    if (this.#closed || this.#closing || this.#startup === undefined)
      return Promise.resolve(undefined);
    const call = this.#tail.then(() => {
      if (this.#closed || this.#closing) return undefined;
      if (wasCancelled(options))
        return err(new AnalysisCancelledError(operation));
      return this.#execute(operation, parameters, options);
    });
    this.#tail = call.then(
      () => undefined,
      () => undefined,
    );
    const result = await waitForAbortable(call, options?.signal);
    return result === ABORTED
      ? err(new AnalysisCancelledError(operation))
      : result;
  }

  async #execute(
    operation: AnalysisOperation,
    parameters: Readonly<Record<string, JsonValue>>,
    options?: ExecutionOptions,
  ): Promise<Result<ReturnType<typeof createAnalysisExecution>, AnalysisError>> {
    if (this.#closed || this.#closing)
      return err(
        new AnalysisProtocolError(
          "Binary Ninja session is closing or closed; reopen the target.",
        ),
      );
    if (wasCancelled(options))
      return err(new AnalysisCancelledError(operation));
    if (operation !== "health" && !isBinaryNinjaOperation(operation))
      return err(
        new AnalysisCapabilityUnavailableError(
          "binaryninja",
          operation,
          "Binary Ninja adapter admits read-only analysis operations only.",
        ),
      );

    if (operation !== "health") {
      const parsed = parseBinaryNinjaInput(operation, parameters);
      if (!parsed.ok) return parsed;
      parameters = parsed.value;
    }

    try {
      await this.#start();
      if (wasCancelled(options)) throw new AnalysisCancelledError(operation);

      if (operation === "health") {
        return ok(
          createAnalysisExecution(
            {
              ready: true,
              mode: this.config.mode,
              target: this.target.path,
              upstream: this.connection.serverInfo(),
            },
            BINARYNINJA_PROVIDER_IDENTITY,
            {
              limitations: BINARYNINJA_LIMITATIONS,
              ...(this.profile === undefined
                ? {}
                : { analysisProfile: this.profile }),
            },
          ),
        );
      }

      if (!isBinaryNinjaOperation(operation)) {
        throw new AnalysisProtocolError(
          "Binary Ninja operation changed after validation.",
        );
      }

      const runner = new BinaryNinjaOperationRunner(
        this.connection,
        this.#availableTools,
        {
          signal: options?.signal,
          selectorOrigin: options?.selectorOrigin,
        },
      );

      const result = await runner.run(operation, parameters);
      if (wasCancelled(options)) throw new AnalysisCancelledError(operation);

      return ok(
        createAnalysisExecution(result, BINARYNINJA_PROVIDER_IDENTITY, {
          rawResult: {
            upstream: this.connection.serverInfo(),
            observations: jsonValueSchema.parse(runner.raw),
          },
          limitations: [...BINARYNINJA_LIMITATIONS, ...runner.limitations],
          ...(runner.relationshipCoverage === undefined
            ? {}
            : { relationshipCoverage: runner.relationshipCoverage }),
          locations: [
            { kind: "artifact-path", path: this.target.path },
            ...runner.locations,
          ],
          ...(this.profile === undefined
            ? {}
            : { analysisProfile: this.profile }),
        }),
      );
    } catch (cause: unknown) {
      if (cause instanceof AnalysisError) return err(cause);
      return err(
        new AnalysisProtocolError(
          cause instanceof Error ? cause.message : String(cause),
          { cause },
        ),
      );
    }
  }

  async #start(): Promise<void> {
    if (this.#startup !== undefined) return this.#startup;
    this.#startup = (async () => {
      this.#availableTools = await this.connection.connect();
    })();
    return this.#startup;
  }

  async close(): Promise<Result<null, AnalysisError>> {
    if (this.#closed) return ok(null);
    this.#closing = true;
    try {
      await this.connection.close();
      this.#closed = true;
      return ok(null);
    } catch (cause) {
      return err(
        new AnalysisProtocolError("Failed to close Binary Ninja connection", {
          cause,
        }),
      );
    }
  }
}
