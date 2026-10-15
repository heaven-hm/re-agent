import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createAnalysisExecution,
  type AnalysisClient,
  type AnalysisOperation,
  type AnalysisProvider,
  type CapabilityDescriptor,
  type ProviderIdentity,
} from "../application/AnalysisProvider.js";
import { readStableArtifact } from "../artifacts/readStableArtifact.js";
import { ArtifactResourceScope } from "../artifacts/ArtifactResourceScope.js";
import { AnalysisError } from "../domain/analysisErrorBase.js";
import { parseExecutableHeader } from "../domain/binaryTarget.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import { digestSchema } from "../domain/digests.js";
import {
  AnalysisArtifactChangedError,
  AnalysisCancelledError,
  AnalysisCapabilityUnavailableError,
  AnalysisOutputError,
  AnalysisResourceConstraintError,
  AnalysisTimeoutError,
} from "../domain/analysisErrorCore.js";
import { ProviderAdapterError } from "../domain/providerAdapterError.js";
import { ProviderCleanupError } from "../domain/providerCleanupError.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
import { err, ok, type Result } from "../domain/result.js";
import {
  radare2FunctionInventorySchema,
  radare2InventoryInputSchema,
} from "../domain/radare2FunctionInventory.js";
import {
  radare2DisassemblyInputSchema,
  radare2DisassemblySchema,
} from "../domain/radare2Disassembly.js";
import { ArtifactReaderFailure } from "../artifacts/ArtifactReader.js";
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
  RADARE2_OPERATION,
  RADARE2_DISASSEMBLY_OPERATION,
  RADARE2_PROVIDER_IDENTITY,
} from "./Radare2ProviderMetadata.js";
import { resolveRadare2Executable } from "./Radare2Executable.js";

const MAX_TARGET_BYTES = 268_435_456;
const MAX_TOOL_BYTES = 268_435_456;
const MAX_OUTPUT_BYTES = 16_777_216;
const TIMEOUT_MS = 120_000;
const LIMITATIONS = [
  "Function records and boundaries are radare2 analysis inferences; this inventory does not prove that all true functions were discovered.",
  "The target is analyzed from a provider-owned byte-for-byte snapshot and is never executed by this operation.",
  "The process is isolated and resource-bounded, but this is not a security sandbox for the analysis engine.",
] as const;
const DISASSEMBLY_LIMITATIONS = [
  "Instructions are radare2's static decoding at the caller-selected address; this does not establish function boundaries or runtime reachability.",
  "The target is analyzed from a provider-owned byte-for-byte snapshot and is never executed by this operation.",
  "A short result can indicate undecodable bytes or an address outside mapped executable data; it is reported as partial or empty, not as a successful full decode.",
] as const;

export type Radare2Runner = (
  spawn: OwnedProviderProcessSpawnOptions,
  limits: { readonly timeoutMs: number; readonly diagnosticBytes: number },
  options: {
    readonly signal?: AbortSignal;
    readonly retainCleanup: (owner: ProviderProcessSupervisor) => void;
  },
) => Promise<ProviderProcessSnapshot>;

/** Static function-inventory adapter for a caller-selected local executable. */
export class Radare2Provider implements AnalysisProvider {
  readonly #resources = new ArtifactResourceScope();
  readonly #roots = new Set<PrivateRuntimeRoot>();
  readonly #pending = new Map<ProviderProcessSupervisor, string>();
  readonly #lifetime = new AbortController();
  readonly #active = new Set<Promise<unknown>>();
  #closed = false;
  #closing: Promise<void> | undefined;

  constructor(
    readonly environment: Readonly<NodeJS.ProcessEnv> = process.env,
    readonly runner: Radare2Runner = runOwnedCommand,
  ) {}

  identity(): ProviderIdentity {
    return RADARE2_PROVIDER_IDENTITY;
  }

  capabilities(): readonly CapabilityDescriptor[] {
    const executable = resolveRadare2Executable(this.environment);
    return [
      {
        provider: RADARE2_PROVIDER_IDENTITY,
        operation: RADARE2_OPERATION,
        ...(executable === null
          ? {
              available: false,
              reason:
                "Install radare2 or set REA_RADARE2_PATH to its absolute executable path.",
            }
          : { available: true, reason: null }),
        effects: {
          mutatesArtifact: false,
          launchesProcess: true,
          mayShowUi: false,
          mayAccessNetwork: false,
          mayWriteFilesystem: true,
          changesPermissions: false,
          requiresRoot: false,
        },
        limitations: LIMITATIONS,
      },
      {
        provider: RADARE2_PROVIDER_IDENTITY,
        operation: RADARE2_DISASSEMBLY_OPERATION,
        ...(executable === null
          ? {
              available: false,
              reason:
                "Install radare2 or set REA_RADARE2_PATH to its absolute executable path.",
            }
          : { available: true, reason: null }),
        effects: {
          mutatesArtifact: false,
          launchesProcess: true,
          mayShowUi: false,
          mayAccessNetwork: false,
          mayWriteFilesystem: true,
          changesPermissions: false,
          requiresRoot: false,
        },
        limitations: DISASSEMBLY_LIMITATIONS,
      },
    ];
  }

  createClient(target: BinaryTarget): AnalysisClient {
    return {
      execute: async (operation, parameters, options) => {
        if (operation === "health")
          return ok(createAnalysisExecution(null, RADARE2_PROVIDER_IDENTITY));
        if (
          operation !== RADARE2_OPERATION &&
          operation !== RADARE2_DISASSEMBLY_OPERATION
        )
          return err(
            new AnalysisCapabilityUnavailableError(
              RADARE2_PROVIDER_IDENTITY.id,
              operation,
              "Radare2 implements only static function-inventory and bounded-disassembly operations.",
            ),
          );
        if (this.#closed || options?.signal?.aborted)
          return err(new AnalysisCancelledError(operation));
        const running =
          operation === RADARE2_DISASSEMBLY_OPERATION
            ? this.#disassemble(target, parameters, options?.signal)
            : this.#inspect(target, parameters, options?.signal);
        this.#active.add(running);
        try {
          return await running;
        } catch (cause: unknown) {
          return err(this.#failure(cause, operation));
        } finally {
          this.#active.delete(running);
        }
      },
      close: () => this.close(),
    };
  }

  async close(): Promise<Result<null, AnalysisError>> {
    this.#closed = true;
    this.#lifetime.abort();
    this.#closing ??= Promise.allSettled(this.#active)
      .then(async () => {
        for (const [owner, operation] of this.#pending) {
          const stopped = await owner.stop();
          if (stopped.status === "incomplete")
            throw new ProviderCleanupError(
              RADARE2_PROVIDER_IDENTITY.id,
              [],
              { reason: stopped.reason },
              { operation },
            );
          this.#pending.delete(owner);
        }
        for (const root of this.#roots) {
          await root.close();
          this.#roots.delete(root);
        }
        await this.#resources.close();
      })
      .catch((cause: unknown) => {
        this.#closing = undefined;
        throw cause;
      });
    try {
      await this.#closing;
      return ok(null);
    } catch (cause: unknown) {
      return err(
        cause instanceof ProviderCleanupError
          ? cause
          : new ProviderCleanupError(
              RADARE2_PROVIDER_IDENTITY.id,
              [],
              { reason: "Radare2 private resources remain unresolved." },
              { operation: "close_binary", cause },
            ),
      );
    }
  }

  async #inspect(
    target: BinaryTarget,
    rawParameters: Readonly<
      Record<string, import("../domain/jsonValue.js").JsonValue>
    >,
    callerSignal?: AbortSignal,
  ) {
    const operation = RADARE2_OPERATION;
    const parameters = radare2InventoryInputSchema.safeParse(rawParameters);
    if (!parameters.success)
      throw new AnalysisOutputError(
        operation,
        "Invalid parameters reached the radare2 provider boundary.",
        { cause: parameters.error },
      );
    if (target.kind !== "executable")
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        "Radare2 function inventory requires an executable target.",
      );
    if (callerSignal?.aborted) throw new AnalysisCancelledError(operation);

    const signal = callerSignal
      ? AbortSignal.any([callerSignal, this.#lifetime.signal])
      : this.#lifetime.signal;
    const original = await readStableArtifact(
      target.path,
      MAX_TARGET_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    if (original.sha256 !== target.sha256)
      throw new AnalysisArtifactChangedError(
        operation,
        target.path,
        "Selected binary bytes do not match the active session identity.",
      );
    const header = parseExecutableHeader(
      original.bytes.subarray(0, 65_536),
      process.arch,
      original.bytes.length,
    );
    if (!header.ok)
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        `Unsupported or malformed executable header: ${header.error}`,
      );
    if (
      !["pe", "elf", "mach-o", "mach-o-universal"].includes(header.value.format)
    )
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        `Radare2 inventory does not support ${header.value.format} in this profile.`,
      );

    const executable = resolveRadare2Executable(this.environment);
    if (executable === null)
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        "Could not locate radare2; set REA_RADARE2_PATH or add r2 to PATH.",
      );
    const root = await PrivateRuntimeRoot.create({ prefix: "rea-radare2-" });
    this.#roots.add(root);
    const snapshot = join(root.path, targetSnapshotName(header.value.format));
    await writeFile(snapshot, original.bytes, { flag: "wx", mode: 0o600 });

    const tool = await readStableArtifact(
      executable,
      MAX_TOOL_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    const toolIdentity = await this.#version(executable, signal);
    const analysisArguments = ["-q", "-A", "-c", "aflj", snapshot];
    const execution = await this.#execute(
      executable,
      analysisArguments,
      signal,
      MAX_OUTPUT_BYTES,
    );
    const afterTarget = await readStableArtifact(
      target.path,
      MAX_TARGET_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    const afterTool = await readStableArtifact(
      executable,
      MAX_TOOL_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    if (afterTarget.sha256 !== original.sha256)
      throw new AnalysisArtifactChangedError(
        operation,
        target.path,
        "Selected binary changed during radare2 analysis.",
      );
    if (afterTool.sha256 !== tool.sha256)
      throw new AnalysisArtifactChangedError(
        operation,
        executable,
        "Radare2 executable changed during analysis.",
      );
    if (execution.stdout.observedBytes !== execution.stdout.bytes)
      throw new AnalysisResourceConstraintError(
        operation,
        "transport",
        `Radare2 output exceeded the ${MAX_OUTPUT_BYTES}-byte capture limit.`,
        {
          output_limit_bytes: MAX_OUTPUT_BYTES,
          observed_output_bytes: execution.stdout.observedBytes,
        },
      );
    if (execution.exitCode !== 0)
      throw new AnalysisOutputError(
        operation,
        `Radare2 exited with status ${String(execution.exitCode)}.`,
        {
          capturedOutput: {
            stdout: execution.stdout.text,
            stderr: execution.stderr.text,
            truncated: false,
            stdout_bytes: execution.stdout.bytes,
            stderr_bytes: execution.stderr.bytes,
            exit_code: execution.exitCode ?? -1,
            signal: execution.signal ?? null,
          },
        },
      );

    let rawFunctions: unknown;
    try {
      rawFunctions = JSON.parse(execution.stdout.text);
    } catch (cause: unknown) {
      throw new AnalysisOutputError(
        operation,
        "Radare2 aflj output was not valid JSON.",
        { cause },
      );
    }
    if (!Array.isArray(rawFunctions))
      throw new AnalysisOutputError(
        operation,
        "Radare2 aflj output did not contain a function array.",
      );
    const rows = rawFunctions.map((entry, index) =>
      parseFunctionRow(entry, index),
    );
    const returned = rows.slice(0, parameters.data.max_functions);
    const stdoutBytes = Buffer.from(execution.stdout.text, "utf8");
    const stderrBytes = Buffer.from(execution.stderr.text, "utf8");
    const result = radare2FunctionInventorySchema.parse({
      artifact: {
        path: target.path,
        sha256: original.sha256,
        format: header.value.format,
        architecture: target.architecture ?? null,
        size_bytes: original.bytes.length,
      },
      engine: {
        path: executable,
        sha256: tool.sha256,
        version: toolIdentity.version,
      },
      command: {
        arguments: analysisArguments,
        exit_code: execution.exitCode,
        stdout: {
          sha256: digestSchema.parse(
            createHash("sha256").update(stdoutBytes).digest("hex"),
          ),
          bytes: stdoutBytes.length,
          complete: true,
        },
        stderr: {
          sha256: digestSchema.parse(
            createHash("sha256").update(stderrBytes).digest("hex"),
          ),
          bytes: stderrBytes.length,
        },
      },
      coverage: {
        state: returned.length === rows.length ? "complete" : "truncated",
        total_rows: rows.length,
        returned_rows: returned.length,
      },
      functions: returned,
      limitations: LIMITATIONS,
    });
    const subject = {
      path: target.path,
      sha256: original.sha256,
      format: header.value.format as
        | "pe"
        | "elf"
        | "mach-o"
        | "mach-o-universal",
      ...(target.architecture === undefined
        ? {}
        : { architecture: target.architecture }),
    };
    return ok(
      createAnalysisExecution(
        jsonValueSchema.parse(result),
        {
          ...RADARE2_PROVIDER_IDENTITY,
          version: toolIdentity.version,
        },
        {
          subject,
          limitations: LIMITATIONS,
          locations: [{ kind: "artifact-path", path: target.path }],
        },
      ),
    );
  }

  async #version(
    executable: string,
    signal: AbortSignal,
    operation: string = RADARE2_OPERATION,
  ) {
    const snapshot = await this.#execute(
      executable,
      ["-v"],
      signal,
      8192,
      operation,
    );
    if (snapshot.exitCode !== 0)
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        "Radare2 version probe failed.",
      );
    const firstLine = snapshot.stdout.text.split(/\r?\n/u, 1)[0]?.trim();
    const version = /^radare2\s+(\S+)/u.exec(firstLine ?? "")?.[1];
    if (version === undefined)
      throw new AnalysisOutputError(
        operation,
        "Radare2 returned an unrecognized version string.",
      );
    return { version };
  }

  async #disassemble(
    target: BinaryTarget,
    rawParameters: Readonly<
      Record<string, import("../domain/jsonValue.js").JsonValue>
    >,
    callerSignal?: AbortSignal,
  ) {
    const operation = RADARE2_DISASSEMBLY_OPERATION;
    const parameters = radare2DisassemblyInputSchema.safeParse(rawParameters);
    if (!parameters.success)
      throw new AnalysisOutputError(
        operation,
        "Invalid parameters reached the radare2 provider boundary.",
        { cause: parameters.error },
      );
    if (target.kind !== "executable")
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        "Radare2 disassembly requires an executable target.",
      );
    if (callerSignal?.aborted) throw new AnalysisCancelledError(operation);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, this.#lifetime.signal])
      : this.#lifetime.signal;
    const original = await readStableArtifact(
      target.path,
      MAX_TARGET_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    if (original.sha256 !== target.sha256)
      throw new AnalysisArtifactChangedError(
        operation,
        target.path,
        "Selected binary bytes do not match the active session identity.",
      );
    const header = parseExecutableHeader(
      original.bytes.subarray(0, 65_536),
      process.arch,
      original.bytes.length,
    );
    if (!header.ok)
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        `Unsupported or malformed executable header: ${header.error}`,
      );
    if (
      !["pe", "elf", "mach-o", "mach-o-universal"].includes(header.value.format)
    )
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        `Radare2 disassembly does not support ${header.value.format} in this profile.`,
      );
    const executable = resolveRadare2Executable(this.environment);
    if (executable === null)
      throw new AnalysisCapabilityUnavailableError(
        RADARE2_PROVIDER_IDENTITY.id,
        operation,
        "Could not locate radare2; set REA_RADARE2_PATH or add r2 to PATH.",
      );
    const root = await PrivateRuntimeRoot.create({ prefix: "rea-radare2-" });
    this.#roots.add(root);
    const snapshot = join(root.path, targetSnapshotName(header.value.format));
    await writeFile(snapshot, original.bytes, { flag: "wx", mode: 0o600 });
    const tool = await readStableArtifact(
      executable,
      MAX_TOOL_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    const toolIdentity = await this.#version(executable, signal, operation);
    const address = `0x${BigInt(parameters.data.address).toString(16)}`;
    const analysisArguments = [
      "-q",
      "-c",
      `pdj ${parameters.data.count} @ ${address}`,
      snapshot,
    ];
    const execution = await this.#execute(
      executable,
      analysisArguments,
      signal,
      MAX_OUTPUT_BYTES,
      operation,
    );
    const afterTarget = await readStableArtifact(
      target.path,
      MAX_TARGET_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    const afterTool = await readStableArtifact(
      executable,
      MAX_TOOL_BYTES,
      signal,
      undefined,
      this.#resources,
    );
    if (afterTarget.sha256 !== original.sha256)
      throw new AnalysisArtifactChangedError(
        operation,
        target.path,
        "Selected binary changed during radare2 analysis.",
      );
    if (afterTool.sha256 !== tool.sha256)
      throw new AnalysisArtifactChangedError(
        operation,
        executable,
        "Radare2 executable changed during analysis.",
      );
    if (execution.stdout.observedBytes !== execution.stdout.bytes)
      throw new AnalysisResourceConstraintError(
        operation,
        "transport",
        `Radare2 output exceeded the ${MAX_OUTPUT_BYTES}-byte capture limit.`,
        {
          output_limit_bytes: MAX_OUTPUT_BYTES,
          observed_output_bytes: execution.stdout.observedBytes,
        },
      );
    if (execution.exitCode !== 0)
      throw new AnalysisOutputError(
        operation,
        `Radare2 exited with status ${String(execution.exitCode)}.`,
        {
          capturedOutput: {
            stdout: execution.stdout.text,
            stderr: execution.stderr.text,
            truncated: false,
            stdout_bytes: execution.stdout.bytes,
            stderr_bytes: execution.stderr.bytes,
            exit_code: execution.exitCode ?? -1,
            signal: execution.signal ?? null,
          },
        },
      );
    let rawInstructions: unknown;
    try {
      rawInstructions = JSON.parse(execution.stdout.text);
    } catch (cause: unknown) {
      throw new AnalysisOutputError(
        operation,
        "Radare2 pdj output was not valid JSON.",
        { cause },
      );
    }
    if (!Array.isArray(rawInstructions))
      throw new AnalysisOutputError(
        operation,
        "Radare2 pdj output did not contain an instruction array.",
      );
    if (rawInstructions.length > parameters.data.count)
      throw new AnalysisOutputError(
        operation,
        "Radare2 pdj returned more instructions than the requested bound.",
      );
    const instructions = rawInstructions.map((item, index) =>
      parseInstruction(item, index, operation),
    );
    let expected = BigInt(address);
    for (const [index, instruction] of instructions.entries()) {
      const observed = BigInt(instruction.address);
      if (observed !== expected)
        throw new AnalysisOutputError(
          operation,
          `Radare2 pdj instruction ${index} was not at the expected sequential address.`,
        );
      expected += BigInt(instruction.size);
      if (expected > 0xffff_ffff_ffff_ffffn)
        throw new AnalysisOutputError(
          operation,
          `Radare2 pdj instruction ${index} overflows the supported address range.`,
        );
    }
    const stdoutBytes = Buffer.from(execution.stdout.text, "utf8");
    const stderrBytes = Buffer.from(execution.stderr.text, "utf8");
    const result = radare2DisassemblySchema.parse({
      artifact: {
        path: target.path,
        sha256: original.sha256,
        format: header.value.format,
        architecture: target.architecture ?? null,
        size_bytes: original.bytes.length,
      },
      engine: {
        path: executable,
        sha256: tool.sha256,
        version: toolIdentity.version,
      },
      selection: { address, requested_instructions: parameters.data.count },
      command: {
        arguments: analysisArguments,
        exit_code: execution.exitCode,
        stdout: {
          sha256: digestSchema.parse(
            createHash("sha256").update(stdoutBytes).digest("hex"),
          ),
          bytes: stdoutBytes.length,
          complete: true,
        },
        stderr: {
          sha256: digestSchema.parse(
            createHash("sha256").update(stderrBytes).digest("hex"),
          ),
          bytes: stderrBytes.length,
        },
      },
      coverage:
        instructions.length === 0
          ? "empty"
          : instructions.length === parameters.data.count
            ? "complete"
            : "partial",
      instructions,
      limitations: DISASSEMBLY_LIMITATIONS,
    });
    const subject = {
      path: target.path,
      sha256: original.sha256,
      format: header.value.format as
        | "pe"
        | "elf"
        | "mach-o"
        | "mach-o-universal",
      ...(target.architecture === undefined
        ? {}
        : { architecture: target.architecture }),
    };
    return ok(
      createAnalysisExecution(
        jsonValueSchema.parse(result),
        { ...RADARE2_PROVIDER_IDENTITY, version: toolIdentity.version },
        {
          subject,
          limitations: DISASSEMBLY_LIMITATIONS,
          locations: [{ kind: "artifact-path", path: target.path }],
        },
      ),
    );
  }

  async #execute(
    executable: string,
    arguments_: readonly string[],
    signal: AbortSignal,
    diagnosticBytes: number,
    operation: string = RADARE2_OPERATION,
  ): Promise<ProviderProcessSnapshot> {
    const snapshot = await this.runner(
      {
        command: executable,
        arguments: arguments_,
        runId: `radare2-${randomUUID()}`,
        cwd: dirname(executable),
        env: {
          PATH: this.environment.PATH,
          HOME: this.environment.HOME,
          USERPROFILE: this.environment.USERPROFILE,
          TMPDIR: this.environment.TMPDIR,
          TMP: this.environment.TMP,
          TEMP: this.environment.TEMP,
        },
      },
      { timeoutMs: TIMEOUT_MS, diagnosticBytes },
      { signal, retainCleanup: (owner) => this.#pending.set(owner, operation) },
    );
    if (this.#pending.size > 0)
      throw new ProviderCleanupError(
        RADARE2_PROVIDER_IDENTITY.id,
        [],
        { reason: "Radare2 process cleanup remains unresolved." },
        { operation },
      );
    if (snapshot.signal !== null && snapshot.signal !== undefined)
      throw new AnalysisOutputError(
        operation,
        `Radare2 was terminated by ${snapshot.signal}.`,
      );
    return snapshot;
  }

  #failure(cause: unknown, operation: string = RADARE2_OPERATION) {
    if (cause instanceof AnalysisError) return cause;
    if (cause instanceof OwnedCommandFailure) {
      if (cause.reason === "cancelled")
        return new AnalysisCancelledError(operation);
      if (cause.reason === "timeout")
        return new AnalysisTimeoutError(operation, TIMEOUT_MS);
      if (cause.reason === "output-limit")
        return new AnalysisResourceConstraintError(
          operation,
          "transport",
          "Radare2 exceeded the bounded output capture.",
          { output_limit_bytes: MAX_OUTPUT_BYTES },
        );
      if (cause.reason === "process" && cause.snapshot !== null) {
        if (cause.snapshot.stdout.observedBytes > MAX_OUTPUT_BYTES)
          return new AnalysisResourceConstraintError(
            operation,
            "transport",
            "Radare2 exceeded the bounded output capture.",
            { output_limit_bytes: MAX_OUTPUT_BYTES },
          );
        if (cause.snapshot.exitCode !== 0)
          return new AnalysisOutputError(
            operation,
            `Radare2 exited with status ${String(cause.snapshot.exitCode)}.`,
            {
              capturedOutput: {
                stdout: cause.snapshot.stdout.text,
                stderr: cause.snapshot.stderr.text,
                truncated: false,
                stdout_bytes: cause.snapshot.stdout.bytes,
                stderr_bytes: cause.snapshot.stderr.bytes,
                exit_code: cause.snapshot.exitCode ?? -1,
                signal: cause.snapshot.signal ?? null,
              },
            },
          );
      }
    }
    if (cause instanceof ArtifactReaderFailure)
      return new AnalysisOutputError(operation, cause.message, {
        cause,
      });
    return new ProviderAdapterError(RADARE2_PROVIDER_IDENTITY.id, operation, {
      cause,
    });
  }
}

const targetSnapshotName = (format: string): string =>
  format === "pe"
    ? "target.exe"
    : format === "elf"
      ? "target.elf"
      : "target.macho";

const parseInstruction = (value: unknown, index: number, operation: string) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new AnalysisOutputError(
      operation,
      `Radare2 instruction ${index} was not an object.`,
    );
  const row = value as Record<string, unknown>;
  if (
    typeof row.addr !== "number" ||
    !Number.isSafeInteger(row.addr) ||
    row.addr < 0 ||
    typeof row.size !== "number" ||
    !Number.isSafeInteger(row.size) ||
    row.size < 1 ||
    typeof row.opcode !== "string" ||
    (row.disasm !== undefined && typeof row.disasm !== "string") ||
    (row.bytes !== undefined && typeof row.bytes !== "string")
  )
    throw new AnalysisOutputError(
      operation,
      `Radare2 instruction ${index} had malformed or unsafe fields.`,
    );
  const parsed = {
    address: `0x${row.addr.toString(16)}`,
    size: row.size,
    opcode: row.opcode,
    ...(typeof row.disasm === "string" ? { disassembly: row.disasm } : {}),
    ...(typeof row.bytes === "string" ? { bytes: row.bytes } : {}),
  };
  try {
    return radare2DisassemblySchema.shape.instructions.element.parse(parsed);
  } catch (cause: unknown) {
    throw new AnalysisOutputError(
      operation,
      `Radare2 instruction ${index} fields were invalid.`,
      { cause },
    );
  }
};

const parseFunctionRow = (value: unknown, index: number) => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new AnalysisOutputError(
      RADARE2_OPERATION,
      `Radare2 function row ${index} was not an object.`,
    );
  const row = value as Record<string, unknown>;
  if (
    typeof row.addr !== "number" ||
    !Number.isSafeInteger(row.addr) ||
    row.addr < 0 ||
    typeof row.name !== "string" ||
    typeof row.size !== "number" ||
    !Number.isSafeInteger(row.size) ||
    row.size < 0 ||
    (row.type !== undefined &&
      row.type !== null &&
      typeof row.type !== "string") ||
    (row.nbbs !== undefined &&
      row.nbbs !== null &&
      (typeof row.nbbs !== "number" ||
        !Number.isSafeInteger(row.nbbs) ||
        row.nbbs < 0))
  )
    throw new AnalysisOutputError(
      RADARE2_OPERATION,
      `Radare2 function row ${index} had malformed or unsafe fields.`,
    );
  return {
    address: `0x${row.addr.toString(16)}`,
    name: row.name,
    size: row.size,
    type: typeof row.type === "string" ? row.type : null,
    basic_blocks: typeof row.nbbs === "number" ? row.nbbs : null,
  };
};
