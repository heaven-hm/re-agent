import type {
  AnalysisOperation,
  CapabilityDescriptor,
} from "../application/AnalysisProvider.js";

/** This version identifies REA's adapter, not Binary Ninja or the upstream MCP server. */
export const BINARYNINJA_PROVIDER_IDENTITY = Object.freeze({
  id: "binaryninja",
  name: "Binary Ninja MCP adapter",
  version: "1",
});

/** Read-only analysis operations supported by the Binary Ninja compatibility profile. */
export const BINARYNINJA_OPERATIONS = Object.freeze([
  "list_procedures",
  "search_procedures",
  "list_strings",
  "search_strings",
  "procedure_address",
  "procedure_pseudo_code",
  "procedure_assembly",
  "procedure_callers",
  "procedure_callees",
  "read_function_instructions",
  "xrefs",
  "analyze_function",
] as const satisfies readonly Exclude<AnalysisOperation, "health">[]);

export type BinaryNinjaOperation = (typeof BINARYNINJA_OPERATIONS)[number];

export const BINARYNINJA_LIMITATIONS = Object.freeze([
  "Provider version identifies the REA Binary Ninja adapter. Binary Ninja engine, license, and plugin versions are unknown unless separately observed; MCP serverInfo is reported independently.",
  "Results describe the current Binary Ninja analysis database (BinaryView). Input identity does not prove an unmodified database; user edits, type overrides, and analysis background passes remain unknown.",
  "Live results are never replayed from analysis snapshots. Target checks before and after a request do not provide an atomic lock against external GUI or background analysis changes.",
  "Caller cancellation drains the in-flight MCP request before cleanup; it does not prove that Binary Ninja internal engine analysis threads were halted.",
  "High-Level IL (HLIL) and decompiled pseudo-C reflect the current Binary Ninja type propagation and dataflow pipeline state.",
]);

/** Advertise live observations and configured lifecycle effects truthfully. */
export const binaryNinjaCapabilities = (
  mode: "attached" | "headless",
  stdio: boolean,
): readonly CapabilityDescriptor[] =>
  BINARYNINJA_OPERATIONS.map((operation) => ({
    provider: BINARYNINJA_PROVIDER_IDENTITY,
    operation,
    available: true,
    reason: null,
    cachePolicy: "live",
    effects: {
      mutatesArtifact: false,
      launchesProcess: stdio || mode === "headless",
      mayShowUi: mode === "attached",
      mayAccessNetwork: true,
      mayWriteFilesystem: stdio || mode === "headless",
      changesPermissions: false,
      requiresRoot: false,
    },
    limitations: BINARYNINJA_LIMITATIONS,
  }));
