import { snapshotEnvironment } from "../process/snapshotEnvironment.js";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  DEFAULT_INHERITED_ENV_VARS,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import { z } from "zod";
import type { BinaryNinjaConfiguration } from "./BinaryNinjaConfiguration.js";
import { jsonValueSchema, type JsonValue } from "../domain/jsonValue.js";
import { AnalysisProtocolError } from "../domain/analysisErrorCore.js";

/** Injectable MCP boundary used by Binary Ninja provider and transport tests. */
export interface BinaryNinjaMcpConnection {
  connect(): Promise<readonly string[]>;
  call(
    name: string,
    args: Readonly<Record<string, JsonValue>>,
  ): Promise<JsonValue>;
  readResource?(uri: string): Promise<JsonValue>;
  serverInfo(): JsonValue;
  close(): Promise<void>;
}

const toolResultSchema = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.record(z.string(), z.unknown()).optional(),
  content: z.array(
    z.object({ type: z.string(), text: z.string().optional() }).passthrough(),
  ),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export const decodeBinaryNinjaToolResult = (input: unknown): JsonValue => {
  const result = toolResultSchema.parse(input);
  const blocks = result.content.flatMap((block) =>
    block.type === "text" && block.text !== undefined ? [block.text] : [],
  );
  if (result.isError === true) {
    throw new AnalysisProtocolError(
      `Binary Ninja MCP tool failed: ${blocks.join("\n")}`,
    );
  }
  if (result.structuredContent !== undefined) {
    const value = result.structuredContent;
    return jsonValueSchema.parse(
      Object.keys(value).length === 1 && "result" in value ? value.result : value,
    );
  }
  if (blocks.length === 0) return null;
  if (blocks.length === 1) {
    const text = blocks[0] ?? "";
    try {
      return jsonValueSchema.parse(JSON.parse(text));
    } catch {
      return text;
    }
  }
  return blocks;
};

/** Redact configured transport authentication values from diagnostics only. */
export const redactBinaryNinjaTransportFailure = (
  cause: unknown,
  config: BinaryNinjaConfiguration,
): Error => {
  let message =
    cause instanceof Error
      ? cause.message
      : "Unknown Binary Ninja MCP transport failure";
  if ("headers" in config) {
    for (const [name, value] of Object.entries(config.headers)) {
      if (!/^(?:authorization|proxy-authorization|cookie)$/iu.test(name))
        continue;
      const credential = value.match(/^(?:Bearer|Basic)\s+([\s\S]+)$/iu)?.[1];
      for (const secret of [value, credential])
        if (secret !== undefined && secret.length > 0)
          message = message
            .split(secret)
            .join("[redacted transport credential]");
    }
  }
  return new Error(message, { cause });
};

/** Create a standard MCP SDK connection to an existing Binary Ninja MCP registration. */
export const createBinaryNinjaMcpConnection = (
  config: BinaryNinjaConfiguration,
  environment: Readonly<NodeJS.ProcessEnv>,
): BinaryNinjaMcpConnection => {
  const client = new Client({ name: "rea-binaryninja-provider", version: "1" });
  const transportFailure = (cause: unknown): never => {
    throw redactBinaryNinjaTransportFailure(cause, config);
  };
  const transport =
    "command" in config
      ? new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: {
            ...Object.fromEntries(
              DEFAULT_INHERITED_ENV_VARS.map((key) => [key, ""]),
            ),
            ...Object.fromEntries(
              Object.entries(snapshotEnvironment(environment)).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
            ...Object.fromEntries(
              Object.entries(snapshotEnvironment(config.env)).filter(
                (entry): entry is [string, string] => entry[1] !== undefined,
              ),
            ),
          },
          stderr: "pipe",
        })
      : new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: {
            headers: {
              Accept: "application/json, text/event-stream",
              ...config.headers,
            },
          },
        });

  let toolNames: readonly string[] = [];
  return {
    async connect(): Promise<readonly string[]> {
      try {
        await client.connect(transport);
        const tools = await client.listTools();
        toolNames = tools.tools.map((t) => t.name);
        return toolNames;
      } catch (cause) {
        throw redactBinaryNinjaTransportFailure(cause, config);
      }
    },
    async call(
      name: string,
      args: Readonly<Record<string, JsonValue>>,
    ): Promise<JsonValue> {
      try {
        const raw = await client.callTool({
          name,
          arguments: args as Record<string, unknown>,
        });
        return decodeBinaryNinjaToolResult(raw);
      } catch (cause) {
        if (cause instanceof AnalysisProtocolError) throw cause;
        throw redactBinaryNinjaTransportFailure(cause, config);
      }
    },
    serverInfo(): JsonValue {
      return (client.getServerVersion() as JsonValue) ?? { name: "binaryninja-mcp" };
    },
    async close(): Promise<void> {
      try {
        await client.close();
      } catch {
        // Safe fail-closed teardown
      }
    },
  };
};
