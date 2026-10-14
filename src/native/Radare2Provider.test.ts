import { describe, expect, it } from "vitest";

import { Radare2Provider } from "../radare2/Radare2Provider.js";
import { nativeMachoTargetForFile } from "../../tests/fixtures/nativeCommands.js";
import { OwnedCommandFailure } from "../process/OwnedCommand.js";
import type { ProviderProcessSnapshot } from "../process/ProviderProcess.js";

const snapshot = (text: string): ProviderProcessSnapshot => ({
  stdout: {
    text,
    bytes: Buffer.byteLength(text),
    observedBytes: Buffer.byteLength(text),
  },
  stderr: { text: "", bytes: 0, observedBytes: 0 },
  exitCode: 0,
  signal: null,
});

describe("Radare2Provider", () => {
  it("binds the caller-selected binary and inferred inventory to execution evidence", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const calls: string[][] = [];
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) => {
        calls.push([...spawn.arguments]);
        return spawn.arguments[0] === "-v"
          ? snapshot("radare2 6.2.0\n")
          : snapshot(
              '[{"addr":4096,"name":"entry0","size":24,"type":"fcn","nbbs":2}]\n',
            );
      },
    );
    const client = provider.createClient(target);
    try {
      const result = await client.execute(
        "inspect_radare2_function_inventory",
        { max_functions: 1 },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect(result.value.result).toMatchObject({
        artifact: { sha256: target.sha256 },
        engine: { sha256: target.sha256, version: "6.2.0" },
        command: {
          arguments: [
            "-q",
            "-A",
            "-c",
            "aflj",
            expect.stringContaining("target.macho"),
          ],
          stdout: { complete: true },
        },
        functions: [
          {
            address: "0x1000",
            name: "entry0",
            size: 24,
            type: "fcn",
            basic_blocks: 2,
          },
        ],
      });
      expect(calls).toEqual([
        ["-v"],
        ["-q", "-A", "-c", "aflj", expect.any(String)],
      ]);
    } finally {
      await client.close();
    }
  });

  it("rejects malformed aflj output as an analysis protocol error", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) =>
        spawn.arguments[0] === "-v"
          ? snapshot("radare2 6.2.0\n")
          : snapshot('{"unexpected":true}\n'),
    );
    const client = provider.createClient(target);
    try {
      const result = await client.execute(
        "inspect_radare2_function_inventory",
        { max_functions: 1 },
      );
      expect(result.ok).toBe(false);
      if (result.ok)
        throw new Error("Expected malformed radare2 output to fail");
      expect(result.error.message).toContain("function array");
    } finally {
      await client.close();
    }
  });

  it("reports a failed owned-process invocation without accepting its output", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) =>
        spawn.arguments[0] === "-v"
          ? snapshot("radare2 6.2.0\n")
          : { ...snapshot(""), exitCode: 2 },
    );
    const client = provider.createClient(target);
    try {
      const result = await client.execute(
        "inspect_radare2_function_inventory",
        { max_functions: 1 },
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failed radare2 process to fail");
      expect(result.error.message).toContain("status 2");
    } finally {
      await client.close();
    }
  });
});

describe("Radare2 bounded disassembly", () => {
  it("disassembles only the selected bounded range and preserves target/tool Evidence", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const calls: string[][] = [];
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) => {
        calls.push([...spawn.arguments]);
        return spawn.arguments[0] === "-v"
          ? snapshot("radare2 6.2.0\n")
          : snapshot(
              '[{"addr":4096,"size":1,"opcode":"90","disasm":"nop","bytes":"90"},{"addr":4097,"size":1,"opcode":"c3","disasm":"ret","bytes":"c3"}]\n',
            );
      },
    );
    const client = provider.createClient(target);
    try {
      const result = await client.execute("inspect_radare2_disassembly", {
        address: "0x1000",
        count: 2,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect(result.value.result).toMatchObject({
        artifact: { sha256: target.sha256 },
        engine: { sha256: target.sha256, version: "6.2.0" },
        selection: { address: "0x1000", requested_instructions: 2 },
        command: {
          arguments: [
            "-q",
            "-c",
            "pdj 2 @ 0x1000",
            expect.stringContaining("target.macho"),
          ],
          stdout: { complete: true },
        },
        coverage: "complete",
        instructions: [
          {
            address: "0x1000",
            size: 1,
            opcode: "90",
            disassembly: "nop",
            bytes: "90",
          },
          {
            address: "0x1001",
            size: 1,
            opcode: "c3",
            disassembly: "ret",
            bytes: "c3",
          },
        ],
      });
      expect(calls).toEqual([
        ["-v"],
        ["-q", "-c", "pdj 2 @ 0x1000", expect.any(String)],
      ]);
    } finally {
      await client.close();
    }
  });

  it("rejects malformed, nonsequential, and over-bound pdj results", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    for (const body of [
      '{"unexpected":true}',
      '[{"addr":4096,"size":1,"opcode":"90"},{"addr":4098,"size":1,"opcode":"90"}]',
      '[{"addr":4096,"size":1,"opcode":"90"},{"addr":4097,"size":1,"opcode":"90"},{"addr":4098,"size":1,"opcode":"90"}]',
    ]) {
      const provider = new Radare2Provider(
        { REA_RADARE2_PATH: process.execPath },
        async (spawn) =>
          spawn.arguments[0] === "-v"
            ? snapshot("radare2 6.2.0\n")
            : snapshot(body),
      );
      const client = provider.createClient(target);
      try {
        const result = await client.execute("inspect_radare2_disassembly", {
          address: "0x1000",
          count: 2,
        });
        expect(result.ok).toBe(false);
      } finally {
        await client.close();
      }
    }
  });

  it("rejects invalid addresses and counts before launching analysis", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const calls: string[][] = [];
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) => {
        calls.push([...spawn.arguments]);
        return snapshot("radare2 6.2.0\n");
      },
    );
    const client = provider.createClient(target);
    try {
      for (const parameters of [
        { address: "0x1000; q", count: 1 },
        { address: "0xffffffffffffffff", count: 1 },
        { address: "0x1000", count: 513 },
      ]) {
        const result = await client.execute(
          "inspect_radare2_disassembly",
          parameters,
        );
        expect(result.ok).toBe(false);
      }
      expect(calls).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("maps cancellation to the disassembly operation", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const controller = new AbortController();
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) => {
        if (spawn.arguments[0] === "-v") return snapshot("radare2 6.2.0\n");
        throw new OwnedCommandFailure("cancelled", "test cancellation");
      },
    );
    const client = provider.createClient(target);
    try {
      const result = await client.execute(
        "inspect_radare2_disassembly",
        { address: "0x1000", count: 1 },
        { signal: controller.signal },
      );
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected cancellation");
      expect(result.error).toHaveProperty("_tag", "AnalysisCancelledError");
      expect(result.error.message).toContain("inspect_radare2_disassembly");
    } finally {
      await client.close();
    }
  });
});

describe("Radare2 disassembly failures and cleanup", () => {
  it("reports failed pdj exits against the disassembly operation", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn) =>
        spawn.arguments[0] === "-v"
          ? snapshot("radare2 6.2.0\n")
          : { ...snapshot("decoder failure\n"), exitCode: 2 },
    );
    const client = provider.createClient(target);
    try {
      const result = await client.execute("inspect_radare2_disassembly", {
        address: "0x1000",
        count: 1,
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected failed pdj invocation to fail");
      expect(result.error.message).toContain("inspect_radare2_disassembly");
      expect(result.error.message).toContain("status 2");
    } finally {
      await client.close();
    }
  });

  it("retains unresolved cleanup ownership until a later close confirms cleanup", async () => {
    const target = await nativeMachoTargetForFile(process.execPath);
    let stopAttempts = 0;
    const owner = {
      stop: async () => {
        stopAttempts += 1;
        return stopAttempts === 1
          ? { status: "incomplete", reason: "test cleanup pending" }
          : { status: "stopped" };
      },
    };
    const provider = new Radare2Provider(
      { REA_RADARE2_PATH: process.execPath },
      async (spawn, _limits, { retainCleanup }) => {
        if (spawn.arguments[0] === "-v") return snapshot("radare2 6.2.0\n");
        retainCleanup(owner as never);
        return snapshot("[]\n");
      },
    );
    const client = provider.createClient(target);
    const result = await client.execute("inspect_radare2_disassembly", {
      address: "0x1000",
      count: 1,
    });
    expect(result.ok).toBe(false);
    const firstClose = await client.close();
    expect(firstClose.ok).toBe(false);
    if (firstClose.ok)
      throw new Error("Expected first cleanup attempt to remain incomplete");
    expect(firstClose.error).toMatchObject({
      operation: "inspect_radare2_disassembly",
    });
    expect(stopAttempts).toBe(1);
    const secondClose = await client.close();
    expect(secondClose.ok).toBe(true);
    expect(stopAttempts).toBe(2);
  });
});
