import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  createEvidence,
  parseEvidence,
  type Evidence,
} from "../domain/evidence.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
import {
  runOwnedCommand,
  OwnedCommandFailure,
} from "../process/OwnedCommand.js";
import { parseMachoLayout, selectMachoSlice } from "./AppleMachoSelection.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{1,16}$/);
export const fridaAutonomyInputSchema = z
  .strictObject({
    binaryPath: z.string().min(1),
    pythonPath: z.string().min(1),
    args: z.array(z.string().max(4096)).max(64).default([]),
    stdin: z.string().max(16384),
    staticAddress: address,
    preferredBase: address,
    codePrefix: z.string().regex(/^(?:[0-9a-fA-F]{2}){4,64}$/),
    timeoutMs: z.number().int().min(1000).max(120000).default(15000),
    maxEvents: z.number().int().min(1).max(256).default(64),
    staticEvidence: z.unknown().optional(),
    gadgetPath: z.string().min(1).optional(),
    gadgetSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    gadgetPort: z.number().int().min(1024).max(65535).optional(),
  })
  .refine(
    (config) =>
      (config.gadgetPath === undefined) ===
        (config.gadgetSha256 === undefined) &&
      (config.gadgetPort === undefined || config.gadgetPath !== undefined),
    "Gadget preload requires both a path and SHA256; a port requires Gadget preload",
  );

/** Explicit owned-target input; register interpretation is an assumption, never signature verification. */
export type FridaAutonomyConfig = z.input<typeof fridaAutonomyInputSchema>;

/** Retains the supervisor when identity-safe cleanup cannot complete. */
export class FridaAutonomyCleanupError extends Error {
  constructor(
    readonly evidence: Evidence,
    readonly commandFailure: OwnedCommandFailure,
  ) {
    super("Frida experiment cleanup is incomplete", { cause: commandFailure });
  }
  async retryCleanup() {
    return this.commandFailure.cleanupOwner?.stop();
  }
}

type ParsedFridaConfig = z.output<typeof fridaAutonomyInputSchema>;

const inspectFridaInput = async (config: ParsedFridaConfig) => {
  const binaryPath = await realpath(config.binaryPath);
  const metadata = await stat(binaryPath);
  if (!metadata.isFile() || metadata.size > 256 * 1024 * 1024)
    throw new Error("Frida autonomy target must be a bounded regular file");
  const bytes = await readFile(binaryPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch))
    throw new Error(
      "Frida autonomy currently requires a macOS ARM64 or x64 host",
    );
  const architecture: "arm64" | "x86_64" =
    process.arch === "arm64" ? "arm64" : "x86_64";
  const selectedSlice = selectMachoSlice(bytes, architecture);
  const expectedCpu = architecture === "arm64" ? 0x0100000c : 0x01000007;
  if (bytes.readUInt32LE(selectedSlice.slice + 4) !== expectedCpu)
    throw new Error(
      "Frida autonomy requires the selected binary to match host architecture",
    );
  const layout = parseMachoLayout(bytes, architecture);
  if (layout.baseAddress !== BigInt(config.preferredBase))
    throw new Error(
      "Selected preferred base differs from parsed Mach-O layout",
    );
  const prefix = config.codePrefix.toLowerCase();
  const selectedAddress = BigInt(config.staticAddress);
  const offset = layout.offset(selectedAddress, prefix.length / 2);
  if (
    bytes.subarray(offset, offset + prefix.length / 2).toString("hex") !==
    prefix
  )
    throw new Error("Selected static instruction prefix differs from binary");
  if (
    !layout.segments.some(
      (segment) =>
        segment.executable &&
        selectedAddress >= segment.address &&
        selectedAddress + BigInt(prefix.length / 2) <=
          segment.address + segment.size,
    )
  )
    throw new Error(
      "Selected function range is not in an executable Mach-O segment",
    );
  const source =
    config.staticEvidence === undefined
      ? undefined
      : parseEvidence(config.staticEvidence);
  if (
    source !== undefined &&
    (source.subject === null || source.subject.digest.sha256 !== sha256)
  )
    throw new Error("Static evidence belongs to a different binary");
  if (config.gadgetPath !== undefined) {
    const gadget = await stat(config.gadgetPath);
    if (!gadget.isFile() || gadget.size > 128 * 1024 * 1024)
      throw new Error("Gadget must be a bounded regular library file");
    const gadgetDigest = createHash("sha256")
      .update(await readFile(config.gadgetPath))
      .digest("hex");
    if (gadgetDigest !== config.gadgetSha256)
      throw new Error("Gadget library SHA256 differs from selected identity");
  }
  return { binaryPath, sha256, architecture, prefix, source };
};

const FRIDA_TRACE_LIMITATIONS = [
  "Only the explicitly launched owned child and selected function are observed.",
  "Static/runtime correlation requires matching module path, load slide, and instruction prefix before hooking.",
  "Argument zero and return are raw pointer-width register bits; signed 64-bit interpretation assumes a matching ABI/signature.",
  "Captured calls do not establish complete coverage or function equivalence.",
  "Initial target profile supports host-architecture 64-bit Mach-O only; required code-signing policy is rejected.",
  "Optional Gadget preload uses a private authenticated loopback listener and changes the instrumentation environment; it does not bypass system signing protections or modify the target binary.",
];

/** Run a bounded owned-child instrumentation experiment and preserve actual failure evidence. */
export const traceFridaAutonomy = async (
  input: FridaAutonomyConfig,
  signal?: AbortSignal,
): Promise<Evidence> => {
  const config = fridaAutonomyInputSchema.parse(input);
  const { binaryPath, sha256, architecture, prefix, source } =
    await inspectFridaInput(config);
  const { staticEvidence: _staticEvidence, ...wire } = config;
  const parameters = {
    binary_path: binaryPath,
    binary_sha256: sha256,
    static_address: config.staticAddress,
    preferred_base: config.preferredBase,
    static_instruction_prefix: prefix,
    source_evidence_ids: source === undefined ? [] : [source.evidence_id],
    arguments: config.args,
    stdin: config.stdin,
    timeout_ms: config.timeoutMs,
    maximum_events: config.maxEvents,
    instrumentation_profile:
      config.gadgetPath === undefined ? "local-attach" : "owned-gadget-preload",
    gadget_sha256: config.gadgetSha256 ?? null,
    gadget_loopback_port: config.gadgetPort ?? null,
  };
  let result: unknown;
  let cleanupFailure: OwnedCommandFailure | undefined;
  try {
    const execution = await runOwnedCommand(
      {
        command: config.pythonPath,
        // macOS framework Python execs its app interpreter; token/start identity still bind ownership.
        expectedCommand: null,
        arguments: [
          fileURLToPath(
            new URL(
              "../../bridge/native/rea_frida_autonomy.py",
              import.meta.url,
            ),
          ),
          JSON.stringify({
            ...wire,
            binaryPath,
            binarySha256: sha256,
            codePrefix: prefix,
          }),
        ],
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        runId: `frida-autonomy-${randomUUID()}`,
      },
      { timeoutMs: config.timeoutMs + 5000, diagnosticBytes: 512 * 1024 },
      signal === undefined ? {} : { signal },
    );
    result = JSON.parse(execution.stdout.text);
  } catch (error) {
    if (!(error instanceof OwnedCommandFailure)) throw error;
    if (error.cleanupOwner !== undefined) cleanupFailure = error;
    result = {
      status: "failed",
      error: error.message,
      reason: error.reason,
      diagnostics: error.snapshot,
      cleanup_failure: error.cleanupFailure,
    };
  }
  const after = createHash("sha256")
    .update(await readFile(binaryPath))
    .digest("hex");
  if (after !== sha256)
    result = {
      status: "failed",
      error: "Binary identity changed during experiment",
      partial_result: result,
    };
  const evidence = createEvidence(
    { path: binaryPath, sha256, format: "mach-o", architecture },
    {
      id: "frida-autonomy",
      name: "Frida owned-child autonomy adapter",
      version: null,
    },
    {
      predicateType: "rea.runtime-function-observation",
      operation: "trace_owned_function",
      parameters,
      result: jsonValueSchema.parse(JSON.parse(JSON.stringify(result))),
      confidence: "observed",
      authority: "controlled-replay",
      limitations: FRIDA_TRACE_LIMITATIONS,
      locations: [{ kind: "address", address: config.staticAddress }],
    },
  );
  if (cleanupFailure !== undefined)
    throw new FridaAutonomyCleanupError(evidence, cleanupFailure);
  return evidence;
};
