import { z } from "zod";
import { analysisSearchInput } from "../contracts/analysisSearchContract.js";
import {
  AnalysisInputError,
  AnalysisProtocolError,
} from "../domain/analysisErrorCore.js";
import {
  functionDossierSchema,
  functionInstructionWindowSchema,
} from "../domain/hopperValues.js";
import type { JsonValue } from "../domain/jsonValue.js";
import type { RelationshipCoverage } from "../domain/relationshipCoverage.js";
import type { EvidenceLocation } from "../domain/evidence.js";
import type { BinaryNinjaMcpConnection } from "./BinaryNinjaMcpConnection.js";
import {
  BINARYNINJA_LIMITATIONS,
  type BinaryNinjaOperation,
} from "./BinaryNinjaProviderCapabilities.js";
import {
  binjaAddressListSchema,
  binjaAddressSchema,
  binjaDisassemblyLineSchema,
  binjaFunctionSchema,
  binjaStringItemSchema,
  type BinjaFunction,
} from "./BinaryNinjaProtocolValues.js";

const unknownBody = {
  available: false,
  reason: "Binary Ninja MCP does not report complete function body ranges.",
} as const;

const procedureIdentity = (fn: BinjaFunction) => ({
  address: fn.address,
  name: fn.name,
  classification: null,
  body: unknownBody,
});

const searchQuerySchema = z.object(analysisSearchInput);

export interface BinaryNinjaRawObservation {
  readonly tool: string;
  readonly arguments: Readonly<Record<string, JsonValue>>;
  readonly result: JsonValue;
}

/** Translate analyst questions into read-only Binary Ninja MCP tool invocations. */
export class BinaryNinjaOperationRunner {
  readonly raw: BinaryNinjaRawObservation[] = [];
  readonly locations: EvidenceLocation[] = [];
  readonly limitations: string[] = [...BINARYNINJA_LIMITATIONS];
  relationshipCoverage: RelationshipCoverage | undefined;
  #cachedFunctions: BinjaFunction[] | undefined;

  constructor(
    private readonly connection: BinaryNinjaMcpConnection,
    private readonly availableTools: readonly string[] = [],
    private readonly options: {
      readonly signal?: AbortSignal | undefined;
      readonly selectorOrigin?: "provider" | undefined;
    } = {},
  ) {}

  async call(
    tool: string,
    args: Readonly<Record<string, JsonValue>>,
  ): Promise<JsonValue> {
    if (this.options.signal?.aborted === true) {
      throw new AnalysisProtocolError("Binary Ninja operation cancelled");
    }
    const result = await this.connection.call(tool, args);
    this.raw.push({ tool, arguments: args, result });
    return result;
  }

  async callWithFallback(
    candidateTools: readonly string[],
    args: Readonly<Record<string, JsonValue>>,
  ): Promise<JsonValue> {
    const selected =
      candidateTools.find((name) => this.availableTools.includes(name)) ??
      candidateTools[0];
    if (selected === undefined) {
      throw new AnalysisProtocolError("No tool candidate available");
    }
    try {
      return await this.call(selected, args);
    } catch (cause) {
      // If the selected tool fails and there are alternatives in availableTools, try them
      const alternatives = candidateTools.filter(
        (name) => name !== selected && this.availableTools.includes(name),
      );
      for (const alt of alternatives) {
        try {
          return await this.call(alt, args);
        } catch {
          // continue fallback
        }
      }
      throw cause;
    }
  }

  async functions(): Promise<BinjaFunction[]> {
    if (this.#cachedFunctions !== undefined) return this.#cachedFunctions;
    const candidates = [
      "list_functions",
      "get_functions",
      "list_procedures",
      "functions",
    ] as const;
    const raw = await this.callWithFallback(candidates, {});
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (
      raw !== null &&
      typeof raw === "object" &&
      "functions" in raw &&
      Array.isArray(raw.functions)
    ) {
      items = raw.functions;
    } else if (
      raw !== null &&
      typeof raw === "object" &&
      "result" in raw &&
      Array.isArray(raw.result)
    ) {
      items = raw.result;
    }

    const functions: BinjaFunction[] = [];
    for (const item of items) {
      const parsed = binjaFunctionSchema.safeParse(item);
      if (parsed.success) {
        functions.push(parsed.data);
      }
    }
    this.#cachedFunctions = functions;
    return functions;
  }

  async resolve(
    identifier: string,
    sourceOperation?: string,
  ): Promise<BinjaFunction> {
    const fns = await this.functions();
    const addressParsed = binjaAddressSchema.safeParse(identifier);
    if (addressParsed.success) {
      const match = fns.find((f) => f.address === addressParsed.data);
      if (match !== undefined) return match;
    }
    const nameMatch = fns.find((f) => f.name === identifier);
    if (nameMatch !== undefined) return nameMatch;

    // Direct lookup tool query
    const candidates = [
      "get_function_by_name",
      "get_function_by_address",
      "get_function",
    ] as const;
    const args: Record<string, JsonValue> = addressParsed.success
      ? { address: addressParsed.data }
      : { name: identifier };
    try {
      const raw = await this.callWithFallback(candidates, args);
      const parsed = binjaFunctionSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // not found via direct tool
    }

    if (this.options.selectorOrigin !== "provider" && sourceOperation) {
      throw new AnalysisInputError(sourceOperation, undefined, [
        {
          path: ["procedure"],
          reason: "invalid_value",
          message: `Procedure '${identifier}' not found in Binary Ninja analysis.`,
        },
      ]);
    }
    throw new AnalysisProtocolError(
      `Procedure '${identifier}' not found in Binary Ninja analysis.`,
    );
  }

  async strings(): Promise<{ address: string; value: string }[]> {
    const candidates = ["list_strings", "get_strings", "strings"] as const;
    const raw = await this.callWithFallback(candidates, {});
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (
      raw !== null &&
      typeof raw === "object" &&
      "strings" in raw &&
      Array.isArray(raw.strings)
    ) {
      items = raw.strings;
    }

    const result: { address: string; value: string }[] = [];
    for (const item of items) {
      const parsed = binjaStringItemSchema.safeParse(item);
      if (parsed.success) {
        result.push({
          address: parsed.data.address,
          value: parsed.data.value,
        });
      }
    }
    return result;
  }

  async pseudocode(fn: BinjaFunction): Promise<string | null> {
    const candidates = [
      "get_hlil",
      "decompile_function",
      "decompile",
      "get_pseudocode",
      "get_pseudo_code",
    ] as const;
    const args: Record<string, JsonValue> = {
      address: fn.address,
      name: fn.name,
    };
    try {
      const raw = await this.callWithFallback(candidates, args);
      if (typeof raw === "string") return raw;
      if (raw !== null && typeof raw === "object") {
        if ("pseudocode" in raw && typeof raw.pseudocode === "string")
          return raw.pseudocode;
        if ("code" in raw && typeof raw.code === "string") return raw.code;
        if ("hlil" in raw && typeof raw.hlil === "string") return raw.hlil;
      }
      return null;
    } catch {
      return null;
    }
  }

  async assembly(fn: BinjaFunction): Promise<string[]> {
    const candidates = [
      "get_disassembly",
      "disassemble_function",
      "disassemble",
      "get_assembly",
    ] as const;
    const args: Record<string, JsonValue> = {
      address: fn.address,
      name: fn.name,
    };
    try {
      const raw = await this.callWithFallback(candidates, args);
      if (typeof raw === "string") return raw.split("\n");
      if (Array.isArray(raw)) {
        return raw.map((line) => {
          const parsed = binjaDisassemblyLineSchema.safeParse(line);
          return parsed.success ? parsed.data : String(line);
        });
      }
      if (raw !== null && typeof raw === "object" && "lines" in raw && Array.isArray(raw.lines)) {
        return raw.lines.map((line) => {
          const parsed = binjaDisassemblyLineSchema.safeParse(line);
          return parsed.success ? parsed.data : String(line);
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  async callers(fn: BinjaFunction): Promise<string[]> {
    const candidates = [
      "get_callers",
      "callers",
      "get_xrefs_to",
      "xrefs_to",
    ] as const;
    const args: Record<string, JsonValue> = {
      address: fn.address,
      name: fn.name,
    };
    try {
      const raw = await this.callWithFallback(candidates, args);
      const parsed = binjaAddressListSchema.safeParse(raw);
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  async callees(fn: BinjaFunction): Promise<string[]> {
    const candidates = ["get_callees", "callees"] as const;
    const args: Record<string, JsonValue> = {
      address: fn.address,
      name: fn.name,
    };
    try {
      const raw = await this.callWithFallback(candidates, args);
      const parsed = binjaAddressListSchema.safeParse(raw);
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  async xrefs(address: string): Promise<string[]> {
    const candidates = [
      "get_xrefs_to",
      "xrefs_to",
      "get_xrefs",
      "xrefs",
    ] as const;
    const args: Record<string, JsonValue> = { address };
    try {
      const raw = await this.callWithFallback(candidates, args);
      const parsed = binjaAddressListSchema.safeParse(raw);
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  private searchPredicate(
    query: z.infer<typeof searchQuerySchema>,
  ): (value: string) => boolean {
    if (query.mode === "regex") {
      try {
        const regex = new RegExp(
          query.pattern,
          query.case_sensitive ? "u" : "iu",
        );
        return (value) => regex.test(value);
      } catch (cause: unknown) {
        throw new AnalysisInputError("search", { cause });
      }
    }
    const needle = query.case_sensitive
      ? query.pattern
      : query.pattern.toLowerCase();
    return (value) =>
      (query.case_sensitive ? value : value.toLowerCase()).includes(needle);
  }

  private async dossier(fn: BinjaFunction): Promise<JsonValue> {
    const asm = await this.assembly(fn);
    const pseudocode = await this.pseudocode(fn);
    const callerAddresses = await this.callers(fn);
    const calleeAddresses = await this.callees(fn);

    const fns = await this.functions();
    const byAddress = new Map(fns.map((f) => [f.address, f]));

    const callerIdentities = callerAddresses.map((addr) => {
      const match = byAddress.get(addr);
      return procedureIdentity(match ?? { address: addr, name: `sub_${addr.replace(/^0x/iu, "")}` });
    });

    const calleeIdentities = calleeAddresses.map((addr) => {
      const match = byAddress.get(addr);
      return procedureIdentity(match ?? { address: addr, name: `sub_${addr.replace(/^0x/iu, "")}` });
    });

    this.relationshipCoverage = {
      status: "complete",
    };

    return functionDossierSchema.parse({
      procedure: {
        ...procedureIdentity(fn),
        signature: null,
        locals: [],
      },
      pseudocode: pseudocode ?? "",
      assembly: asm,
      comments: [],
      callers: callerIdentities,
      callees: calleeIdentities,
      incoming_references: [],
      outgoing_references: [],
      referenced_strings: [],
      referenced_names: [],
      basic_blocks: [],
      native_api: null,
      native_value_flow: null,
      limitations: this.limitations,
    });
  }

  async run(
    operation: BinaryNinjaOperation,
    parameters: Readonly<Record<string, JsonValue>>,
  ): Promise<JsonValue> {
    const query =
      operation === "search_procedures" || operation === "search_strings"
        ? searchQuerySchema.parse(parameters)
        : undefined;
    const matches =
      query === undefined ? undefined : this.searchPredicate(query);

    if (operation === "list_procedures" || operation === "search_procedures") {
      const items = (await this.functions()).map((fn) => ({
        address: fn.address,
        value: fn.name,
      }));
      return matches === undefined
        ? items
        : items.filter(({ value }) => matches(value));
    }

    if (operation === "list_strings" || operation === "search_strings") {
      const items = await this.strings();
      return matches !== undefined
        ? items.filter(({ value }) => matches(value))
        : parameters.address === undefined
          ? items
          : items.filter(
              ({ address }) =>
                address === binjaAddressSchema.parse(parameters.address),
            );
    }

    if (operation === "xrefs") {
      const inspectedAddress = binjaAddressSchema.parse(parameters.address);
      this.locations.push({ kind: "address", address: inspectedAddress });
      return await this.xrefs(inspectedAddress);
    }

    const fn = await this.resolve(
      z.string().min(1).parse(parameters.procedure),
      this.options.selectorOrigin === "provider" ? undefined : operation,
    );
    this.locations.push({ kind: "address", address: fn.address });

    switch (operation) {
      case "procedure_address":
        return fn.address;
      case "procedure_pseudo_code":
        return await this.pseudocode(fn);
      case "procedure_assembly":
        return (await this.assembly(fn)).join("\n");
      case "procedure_callers":
        return await this.callers(fn);
      case "procedure_callees":
        return await this.callees(fn);
      case "read_function_instructions":
        return functionInstructionWindowSchema.parse({
          procedure: procedureIdentity(fn),
          instructions: await this.assembly(fn),
          limitations: this.limitations,
        });
      case "analyze_function":
        return await this.dossier(fn);
    }
  }
}
