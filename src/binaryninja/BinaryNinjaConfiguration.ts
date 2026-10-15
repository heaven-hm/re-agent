import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { ConfigurationError } from "../domain/configurationErrors.js";
import { err, ok, type Result } from "../domain/result.js";

const common = {
  mode: z.enum(["attached", "headless"]).default("attached"),
  protocol: z.enum(["standard", "native"]).default("standard"),
  timeoutMs: z.number().int().positive().max(2_147_483_647).default(300_000),
  workspaceRoot: z
    .string()
    .refine(isAbsolute, "workspaceRoot must be absolute on the REA host")
    .optional(),
};

const registrationSchema = z.union([
  z
    .object({
      ...common,
      type: z.literal("stdio").optional(),
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
      env: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("http").optional(),
      url: z.url().refine((value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
          url.username === "" &&
          url.password === ""
        );
      }, "Binary Ninja MCP must use a local HTTP endpoint without URL credentials"),
      headers: z.record(z.string(), z.string()).default({}),
    })
    .strict(),
]);

/** An upstream Binary Ninja MCP registration plus REA database lifecycle configuration. */
export type BinaryNinjaConfiguration = z.infer<typeof registrationSchema>;

/** Read one explicit Binary Ninja MCP registration without starting or installing a provider. */
export const readBinaryNinjaConfiguration = (
  path: string,
): Result<BinaryNinjaConfiguration, ConfigurationError> => {
  try {
    if (statSync(path).size > 65_536)
      return err(
        binaryNinjaConfigurationError(
          "REA_BINJA_MCP_CONFIG exceeds the 64 KiB registration size.",
        ),
      );
    const input: unknown = JSON.parse(readFileSync(path, "utf8"));
    const envelope = z
      .object({
        mcpServers: z
          .record(z.string(), z.unknown())
          .optional(),
      })
      .safeParse(input);

    let candidate = input;
    if (envelope.success && envelope.data.mcpServers !== undefined) {
      const servers = envelope.data.mcpServers;
      candidate =
        servers["binaryninja-mcp"] ??
        servers["binary_ninja_mcp"] ??
        servers["binja-mcp"] ??
        servers["binaryninja"] ??
        servers["binja"] ??
        input;
    }

    const parsed = registrationSchema.safeParse(candidate);
    return parsed.success
      ? ok(parsed.data)
      : err(
          binaryNinjaConfigurationError(
            "REA_BINJA_MCP_CONFIG must contain a Binary Ninja MCP command/args or local url registration; see docs/binary-ninja-provider.md.",
            parsed.error,
          ),
        );
  } catch (cause: unknown) {
    return err(
      binaryNinjaConfigurationError(
        `Cannot read Binary Ninja MCP registration ${path}; provide a readable JSON configuration.`,
        cause,
      ),
    );
  }
};

/** A REA_BINJA_MCP_CONFIG rejection that names the setting it concerns. */
export const binaryNinjaConfigurationError = (
  constraint: string,
  cause?: unknown,
): ConfigurationError =>
  new ConfigurationError(constraint, {
    ...(cause === undefined ? {} : { cause }),
    settings: [{ setting: "REA_BINJA_MCP_CONFIG", constraint }],
  });
