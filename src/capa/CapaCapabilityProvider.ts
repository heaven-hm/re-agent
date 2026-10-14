import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  createAnalysisExecution,
  type AnalysisExecution,
  type ExecutionOptions,
} from "../application/AnalysisProvider.js";
import { readStableArtifact } from "../artifacts/readStableArtifact.js";
import { ArtifactResourceScope } from "../artifacts/ArtifactResourceScope.js";
import { ArtifactReaderFailure } from "../artifacts/ArtifactReader.js";
import { parseExecutableHeader } from "../domain/binaryTarget.js";
import { createAnalysisProfile } from "../domain/analysisProfile.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import {
  AnalysisArtifactChangedError,
  AnalysisCancelledError,
  AnalysisCapabilityUnavailableError,
  AnalysisInputError,
  AnalysisOutputError,
  AnalysisTimeoutError,
  AnalysisResourceConstraintError,
} from "../domain/analysisErrorCore.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import { ProviderCleanupError } from "../domain/providerCleanupError.js";
import { err, ok, type Result } from "../domain/result.js";
import {
  capaCapabilitiesSchema,
  capaReportSchema,
  inspectCapaCapabilitiesInputSchema,
  type InspectCapaCapabilitiesInput,
} from "../domain/native/capaCapabilities.js";
import {
  OwnedCommandFailure,
  runOwnedCommand,
} from "../process/OwnedCommand.js";
import { PrivateRuntimeRoot } from "../process/PrivateRuntimeRoot.js";
import type {
  ProviderProcessSupervisor,
  OwnedProviderProcessSpawnOptions,
  ProviderProcessSnapshot,
} from "../process/ProviderProcess.js";
import {
  CAPA_LIMITATIONS,
  CAPA_PROVIDER_IDENTITY,
} from "./CapaProviderMetadata.js";

const operation = "inspect_capa_capabilities";
type Outcome = Result<AnalysisExecution, AnalysisError>;
export type CapaRunner = (
  spawn: OwnedProviderProcessSpawnOptions,
  limits: { timeoutMs: number; diagnosticBytes: number },
  options: {
    signal?: AbortSignal;
    retainCleanup: (owner: ProviderProcessSupervisor) => void;
  },
) => Promise<ProviderProcessSnapshot>;

/** Optional installed capa adapter; owns snapshots, process cleanup, and resource admission. */
export class CapaCapabilityProvider {
  readonly #resources = new ArtifactResourceScope();
  readonly #roots = new Set<PrivateRuntimeRoot>();
  readonly #pending = new Set<ProviderProcessSupervisor>();
  readonly #lifetime = new AbortController();
  readonly #active = new Set<Promise<Outcome>>();
  #closed = false;
  #closing: Promise<void> | undefined;
  constructor(
    readonly environment: Readonly<NodeJS.ProcessEnv> = process.env,
    readonly runner: CapaRunner = runOwnedCommand,
  ) {}

  async inspect(
    input: InspectCapaCapabilitiesInput,
    options?: ExecutionOptions,
  ): Promise<Outcome> {
    if (this.#closed || options?.signal?.aborted)
      return err(new AnalysisCancelledError(operation));
    if (this.#active.size)
      return err(
        new AnalysisResourceConstraintError(
          operation,
          "capacity",
          "One capa inspection is already active.",
          { max_concurrent_inspections: 1 },
        ),
      );
    const signal = options?.signal
      ? AbortSignal.any([options.signal, this.#lifetime.signal])
      : this.#lifetime.signal;
    const running = this.#resources
      .run(() => this.#inspect(input, signal))
      .catch((cause: unknown): Outcome =>
        err(this.#failure(cause, input.path, input.timeout_ms)),
      );
    this.#active.add(running);
    try {
      return await running;
    } finally {
      this.#active.delete(running);
    }
  }

  async #cleanup(): Promise<void> {
    for (const owner of this.#pending) {
      const result = await owner.stop();
      if (result.status === "incomplete")
        throw new ProviderCleanupError(
          "capa",
          [],
          { reason: result.reason },
          { operation },
        );
      this.#pending.delete(owner);
    }
    for (const root of this.#roots) {
      try {
        await root.close();
        this.#roots.delete(root);
      } catch (cause) {
        throw new ProviderCleanupError(
          "capa",
          [root.path],
          { reason: "Snapshot cleanup failed." },
          { operation, cause },
        );
      }
    }
  }

  close(): Promise<void> {
    this.#closed = true;
    this.#lifetime.abort();
    this.#closing ??= Promise.allSettled(this.#active)
      .then(async () => {
        await this.#cleanup();
        await this.#resources.close();
      })
      .catch((cause: unknown) => {
        this.#closing = undefined;
        throw cause;
      });
    return this.#closing;
  }

  async #inspect(
    selected: InspectCapaCapabilitiesInput,
    signal: AbortSignal,
  ): Promise<Outcome> {
    await this.#cleanup();
    const parsed = inspectCapaCapabilitiesInputSchema.safeParse(selected);
    if (!parsed.success)
      throw new AnalysisInputError(operation, { cause: parsed.error });
    const input = parsed.data;
    if (!isAbsolute(input.path))
      throw new AnalysisInputError(operation, {
        userMessage: "Select an absolute artifact path.",
      });
    const executable = this.environment.REA_CAPA_PATH;
    if (!executable || !isAbsolute(executable))
      throw new AnalysisCapabilityUnavailableError(
        "capa",
        operation,
        "REA_CAPA_PATH must select an absolute installed executable path.",
      );
    const artifact = await readStableArtifact(
      input.path,
      input.max_file_bytes,
      signal,
      undefined,
      this.#resources,
    );
    const header = parseExecutableHeader(artifact.bytes, process.arch);
    if (
      !header.ok ||
      (header.value.format !== "pe" && header.value.format !== "elf")
    )
      throw new AnalysisInputError(operation, {
        userMessage: "capa supports this adapter's PE/ELF profile only.",
      });
    const tool = await readStableArtifact(
      executable,
      268_435_456,
      signal,
      undefined,
      this.#resources,
    );
    const toolHeader = parseExecutableHeader(tool.bytes, process.arch);
    if (
      !toolHeader.ok ||
      !["pe", "elf", "mach-o", "mach-o-universal"].includes(
        toolHeader.value.format,
      )
    )
      throw new AnalysisCapabilityUnavailableError(
        "capa",
        operation,
        "This profile requires a self-contained native capa distribution with packaged default rules; interpreter entry-point scripts are unsupported.",
      );
    const root = await PrivateRuntimeRoot.create({ prefix: "rea-capa-" });
    this.#roots.add(root);
    try {
      const snapshot = join(
        root.path,
        header.value.format === "pe" ? "target.exe" : "target.elf",
      );
      await writeFile(snapshot, artifact.bytes, { flag: "wx", mode: 0o600 });
      const execute = (
        arguments_: readonly string[],
        timeoutMs: number,
        diagnosticBytes: number,
      ) =>
        this.runner(
          {
            command: executable,
            arguments: arguments_,
            runId: `capa-${randomUUID()}`,
            cwd: root.path,
            env: {
              PATH: this.environment.PATH,
              HOME: root.path,
              USERPROFILE: root.path,
              TMPDIR: root.path,
              TMP: root.path,
              TEMP: root.path,
            },
          },
          { timeoutMs, diagnosticBytes },
          { signal, retainCleanup: (owner) => this.#pending.add(owner) },
        );
      const health = await execute(
        ["--version"],
        Math.min(input.timeout_ms, 30_000),
        8192,
      );
      if (this.#pending.size)
        throw new ProviderCleanupError(
          "capa",
          [root.path],
          { reason: "Version probe cleanup remains unresolved." },
          { operation },
        );
      const version = /^capa\s+(\S+)\s*$/.exec(health.stdout.text.trim())?.[1];
      if (!version)
        throw new AnalysisOutputError(
          operation,
          "capa version output was unrecognized",
        );
      const execution = await execute(
        ["-j", "--color", "never", "--backend", input.backend, snapshot],
        input.timeout_ms,
        input.max_output_bytes,
      );
      if (this.#pending.size)
        throw new ProviderCleanupError(
          "capa",
          [root.path],
          { reason: "Owned capa process cleanup remains unresolved." },
          { operation },
        );
      const raw: unknown = JSON.parse(execution.stdout.text);
      const report = capaReportSchema.safeParse(raw);
      if (!report.success)
        throw new AnalysisOutputError(
          operation,
          "capa JSON does not satisfy the static report contract",
          { cause: report.error },
        );
      if (
        report.data.meta.version !== version ||
        report.data.meta.sample.sha256 !== artifact.sha256 ||
        report.data.meta.analysis.format !== header.value.format
      )
        throw new AnalysisOutputError(
          operation,
          "capa tool identity, target digest or format disagrees with selected artifact",
        );
      const after = await readStableArtifact(
        executable,
        268_435_456,
        signal,
        undefined,
        this.#resources,
      );
      if (after.sha256 !== tool.sha256)
        throw new AnalysisArtifactChangedError(
          operation,
          executable,
          "capa executable changed during inspection",
        );
      const originalAfter = await readStableArtifact(
        input.path,
        input.max_file_bytes,
        signal,
        undefined,
        this.#resources,
      );
      if (originalAfter.sha256 !== artifact.sha256)
        throw new AnalysisArtifactChangedError(
          operation,
          input.path,
          "Original selected artifact changed during inspection",
        );
      const snapshotAfter = await readStableArtifact(
        snapshot,
        input.max_file_bytes,
        signal,
        undefined,
        this.#resources,
      );
      if (snapshotAfter.sha256 !== artifact.sha256)
        throw new AnalysisArtifactChangedError(
          operation,
          input.path,
          "Provider-owned artifact snapshot changed during inspection",
        );
      const rules = Object.entries(report.data.rules).map(([name, rule]) => {
        if (name !== rule.meta.name)
          throw new AnalysisOutputError(
            operation,
            "capa rule key and name disagree",
          );
        return {
          name,
          namespace: rule.meta.namespace ?? null,
          scope: rule.meta.scopes.static,
          matches: rule.matches.map(([location]) => location),
        };
      });
      const result = capaCapabilitiesSchema.parse({
        artifact_sha256: artifact.sha256,
        format: header.value.format,
        extractor: report.data.meta.analysis.extractor,
        backend: input.backend,
        classification: "static-rule-hypotheses",
        coverage: "matched-rules-only; unmatched-behavior-unknown",
        rules,
        diagnostics: execution.stderr.text,
      });
      const provider = { ...CAPA_PROVIDER_IDENTITY, version };
      const observed = createAnalysisExecution(result, provider, {
        rawResult: jsonValueSchema.parse(raw),
        analysisProfile: createAnalysisProfile(provider, {
          revision: 1,
          tool_sha256: tool.sha256,
          rules_source: "tool-bundled-defaults",
          backend: input.backend,
        }),
        limitations: CAPA_LIMITATIONS,
        subject: {
          path: input.path,
          sha256: artifact.sha256,
          format: header.value.format,
          architecture: header.value.architecture,
        },
      });
      return ok(observed);
    } finally {
      if (!this.#pending.size) await this.#cleanup();
    }
  }

  #failure(cause: unknown, path: string, timeoutMs: number): AnalysisError {
    if (cause instanceof AnalysisError) return cause;
    if (cause instanceof OwnedCommandFailure) {
      const capturedOutput =
        cause.snapshot === null
          ? undefined
          : {
              stdout: cause.snapshot.stdout.text,
              stderr: cause.snapshot.stderr.text,
              truncated: cause.snapshot.diagnosticTruncated === true,
            };
      const failureOptions = {
        cause,
        ...(capturedOutput === undefined ? {} : { capturedOutput }),
      };
      if (cause.cleanupOwner) this.#pending.add(cause.cleanupOwner);
      if (cause.cleanupFailure)
        return new ProviderCleanupError(
          "capa",
          cause.resources,
          { reason: cause.cleanupFailure },
          { operation, cause },
        );
      if (cause.reason === "cancelled")
        return new AnalysisCancelledError(operation, failureOptions);
      if (cause.reason === "timeout")
        return new AnalysisTimeoutError(operation, timeoutMs, failureOptions);
      if (cause.reason === "output-limit")
        return new AnalysisOutputError(
          operation,
          "capa output exceeded the complete-output budget",
          failureOptions,
        );
      return new ProviderAdapterError("capa", operation, {
        ...failureOptions,
        diagnostics: { reason: cause.message },
      });
    }
    if (cause instanceof ArtifactReaderFailure) {
      if (cause.cleanup)
        return new ProviderCleanupError(
          "capa",
          cause.cleanup.resources,
          { reason: cause.cleanup.reason },
          { operation, cause },
        );
      if (cause.reason === "cancelled")
        return new AnalysisCancelledError(operation, { cause });
      if (cause.reason === "integrity")
        return new AnalysisArtifactChangedError(
          operation,
          path,
          cause.message,
          { cause },
        );
      if (cause.reason === "limit")
        return new AnalysisResourceConstraintError(
          operation,
          "capacity",
          cause.message,
          null,
          { cause },
        );
      if (cause.reason === "path" || cause.reason === "format")
        return new AnalysisInputError(operation, {
          cause,
          userMessage: cause.message,
        });
    }
    return new ProviderAdapterError("capa", operation, {
      cause,
      diagnostics: {
        reason: cause instanceof Error ? cause.message : String(cause),
      },
    });
  }
}
