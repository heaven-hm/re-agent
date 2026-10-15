import { rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBinaryNinjaConfiguration } from "./BinaryNinjaConfiguration.js";
import { decodeBinaryNinjaToolResult } from "./BinaryNinjaMcpConnection.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

describe("Binary Ninja registration and MCP result boundaries", () => {
  it("reuses a direct or upstream mcpServers registration with no installation", async () => {
    const root = await mkdtemp(join(tmpdir(), "rea-binja-test-"));
    roots.push(root);
    const path = join(root, "mcp.json");
    for (const input of [
      { command: "python", args: ["server.py"] },
      {
        mcpServers: {
          "binaryninja-mcp": { command: "python", args: ["server.py"] },
          unrelated: { command: "untouched" },
        },
      },
      {
        mcpServers: {
          "binja-mcp": { command: "python", args: ["server.py"] },
        },
      },
    ]) {
      await writeFile(path, JSON.stringify(input));
      expect(readBinaryNinjaConfiguration(path)).toMatchObject({
        ok: true,
        value: { command: "python", args: ["server.py"], mode: "attached" },
      });
    }
  });

  it("validates local transport and lifecycle inputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "rea-binja-test-"));
    roots.push(root);
    const path = join(root, "mcp.json");
    for (const input of [
      { url: "https://remote.example.com/mcp" },
      { url: "http://user:pass@127.0.0.1/mcp" },
      { command: "python", mode: "invalid_mode" },
      { command: "python", workspaceRoot: "relative" },
      { command: "python", args: "not-an-array" },
    ]) {
      await writeFile(path, JSON.stringify(input));
      expect(readBinaryNinjaConfiguration(path).ok).toBe(false);
    }
    await writeFile(
      path,
      JSON.stringify({
        url: "http://127.0.0.1:9000/mcp",
        mode: "headless",
        headers: { Authorization: "Bearer test-key" },
      }),
    );
    expect(readBinaryNinjaConfiguration(path).ok).toBe(true);
    await writeFile(path, "not-json");
    expect(readBinaryNinjaConfiguration(path).ok).toBe(false);
    expect(readBinaryNinjaConfiguration(join(root, "absent.json")).ok).toBe(false);
  });

  it("decodes tool results from text, structuredContent, and error blocks", () => {
    expect(
      decodeBinaryNinjaToolResult({
        content: [{ type: "text", text: JSON.stringify({ name: "main" }) }],
      }),
    ).toEqual({ name: "main" });

    expect(
      decodeBinaryNinjaToolResult({
        content: [{ type: "text", text: "raw text string" }],
      }),
    ).toBe("raw text string");

    expect(
      decodeBinaryNinjaToolResult({
        content: [],
        structuredContent: { result: [1, 2, 3] },
      }),
    ).toEqual([1, 2, 3]);

    expect(() =>
      decodeBinaryNinjaToolResult({
        isError: true,
        content: [{ type: "text", text: "Something went wrong" }],
      }),
    ).toThrow("Binary Ninja MCP tool failed: Something went wrong");
  });
});
