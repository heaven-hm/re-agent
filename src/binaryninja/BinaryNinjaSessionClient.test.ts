import { describe, expect, it } from "vitest";
import type { BinaryNinjaConfiguration } from "./BinaryNinjaConfiguration.js";
import type { BinaryNinjaMcpConnection } from "./BinaryNinjaMcpConnection.js";
import { BinaryNinjaSessionClient } from "./BinaryNinjaSessionClient.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import type { JsonValue } from "../domain/jsonValue.js";

const dummyTarget: BinaryTarget = {
  path: "/path/to/binary.elf",
  sha256: "0".repeat(64),
  kind: "executable",
  format: "elf",
  architecture: "x86_64",
  availableArchitectures: ["x86_64"],
};

const dummyConfig: BinaryNinjaConfiguration = {
  mode: "attached",
  protocol: "standard",
  timeoutMs: 30000,
  command: "binaryninja-mcp",
  args: [],
  env: {},
};

const createMockConnection = (
  customTools?: string[],
  handler?: (name: string, args: Record<string, JsonValue>) => JsonValue,
): BinaryNinjaMcpConnection => {
  const tools = customTools ?? [
    "list_functions",
    "list_strings",
    "get_hlil",
    "get_disassembly",
    "get_callers",
    "get_callees",
    "get_xrefs_to",
  ];

  return {
    async connect() {
      return tools;
    },
    async call(name: string, args: Readonly<Record<string, JsonValue>>) {
      if (handler) {
        return handler(name, args as Record<string, JsonValue>);
      }
      switch (name) {
        case "list_functions":
          return [
            { name: "main", start: "0x1000" },
            { name: "process_data", start: "0x1100" },
          ];
        case "list_strings":
          return [
            { address: "0x2000", value: "SecretKey" },
            { address: "0x2020", value: "Usage: %s" },
          ];
        case "get_hlil":
          return "int main() {\n  process_data();\n  return 0;\n}";
        case "get_disassembly":
          return [
            "0x1000: push rbp",
            "0x1001: mov rbp, rsp",
            "0x1004: call 0x1100",
            "0x1009: pop rbp",
            "0x100a: ret",
          ];
        case "get_callers":
          return ["0x1000"];
        case "get_callees":
          return ["0x1100"];
        case "get_xrefs_to":
          return ["0x1004"];
        default:
          throw new Error(`Unhandled mock tool: ${name}`);
      }
    },
    serverInfo() {
      return { name: "mock-binaryninja", version: "1.0.0" };
    },
    async close() {},
  };
};

describe("BinaryNinjaSessionClient", () => {
  it("executes list_procedures and search_procedures", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const listRes = await client.execute("list_procedures", {});
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value.result).toEqual([
      { address: "0x1000", value: "main" },
      { address: "0x1100", value: "process_data" },
    ]);

    const searchRes = await client.execute("search_procedures", {
      mode: "literal",
      pattern: "main",
      case_sensitive: true,
    });
    expect(searchRes.ok).toBe(true);
    if (!searchRes.ok) return;
    expect(searchRes.value.result).toEqual([
      { address: "0x1000", value: "main" },
    ]);
  });

  it("executes list_strings and search_strings", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const listRes = await client.execute("list_strings", {});
    expect(listRes.ok).toBe(true);
    if (!listRes.ok) return;
    expect(listRes.value.result).toEqual([
      { address: "0x2000", value: "SecretKey" },
      { address: "0x2020", value: "Usage: %s" },
    ]);

    const searchRes = await client.execute("search_strings", {
      mode: "literal",
      pattern: "Secret",
      case_sensitive: true,
    });
    expect(searchRes.ok).toBe(true);
    if (!searchRes.ok) return;
    expect(searchRes.value.result).toEqual([
      { address: "0x2000", value: "SecretKey" },
    ]);
  });

  it("executes procedure_address, pseudocode, and assembly", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const addrRes = await client.execute("procedure_address", {
      procedure: "main",
    });
    expect(addrRes.ok).toBe(true);
    if (addrRes.ok) expect(addrRes.value.result).toBe("0x1000");

    const codeRes = await client.execute("procedure_pseudo_code", {
      procedure: "0x1000",
    });
    expect(codeRes.ok).toBe(true);
    if (codeRes.ok) expect(codeRes.value.result).toContain("process_data()");

    const asmRes = await client.execute("procedure_assembly", {
      procedure: "main",
    });
    expect(asmRes.ok).toBe(true);
    if (asmRes.ok) expect(asmRes.value.result).toContain("0x1000: push rbp");
  });

  it("executes callers, callees, and xrefs", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const callersRes = await client.execute("procedure_callers", {
      procedure: "process_data",
    });
    expect(callersRes.ok).toBe(true);
    if (callersRes.ok) expect(callersRes.value.result).toEqual(["0x1000"]);

    const calleesRes = await client.execute("procedure_callees", {
      procedure: "main",
    });
    expect(calleesRes.ok).toBe(true);
    if (calleesRes.ok) expect(calleesRes.value.result).toEqual(["0x1100"]);

    const xrefsRes = await client.execute("xrefs", {
      address: "0x1100",
    });
    expect(xrefsRes.ok).toBe(true);
    if (xrefsRes.ok) expect(xrefsRes.value.result).toEqual(["0x1004"]);
  });

  it("executes analyze_function and produces a complete dossier", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const dossierRes = await client.execute("analyze_function", {
      procedure: "main",
    });
    expect(dossierRes.ok).toBe(true);
    if (!dossierRes.ok) return;

    const dossier = dossierRes.value.result as Record<string, unknown>;
    expect(dossier.procedure).toMatchObject({
      address: "0x1000",
      name: "main",
    });
    expect(dossier.pseudocode).toContain("process_data()");
    expect(Array.isArray(dossier.assembly)).toBe(true);
    expect(Array.isArray(dossier.callees)).toBe(true);
    expect(dossierRes.value.limitations.length).toBeGreaterThan(0);
  });
});

describe("BinaryNinjaSessionClient lifecycle", () => {
  it("reports health and rejects mutating operations", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const healthRes = await client.execute("health", {});
    expect(healthRes.ok).toBe(true);
    if (healthRes.ok) {
      expect(healthRes.value.result).toMatchObject({
        ready: true,
        mode: "attached",
        target: dummyTarget.path,
      });
    }

    const badRes = await client.execute("set_comment" as any, {
      address: "0x1000",
      comment: "evil mutation",
    });
    expect(badRes.ok).toBe(false);
  });

  it("honors cancellation via signal", async () => {
    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      createMockConnection(),
    );

    const controller = new AbortController();
    controller.abort();

    const cancelledRes = await client.execute(
      "list_procedures",
      {},
      { signal: controller.signal },
    );
    expect(cancelledRes.ok).toBe(false);
  });

  it("closes cleanly", async () => {
    let closed = false;
    const connection: BinaryNinjaMcpConnection = {
      async connect() {
        return [];
      },
      async call() {
        return null;
      },
      serverInfo() {
        return null;
      },
      async close() {
        closed = true;
      },
    };

    const client = new BinaryNinjaSessionClient(
      dummyConfig,
      dummyTarget,
      connection,
    );
    const closeRes = await client.close();
    expect(closeRes.ok).toBe(true);
    expect(closed).toBe(true);
  });
});
