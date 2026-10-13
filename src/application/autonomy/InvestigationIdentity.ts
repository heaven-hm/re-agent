import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  investigationConfigSchema,
  type InvestigationConfig,
} from "./InvestigationContracts.js";

export const hashFile = async (path: string): Promise<string> => {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path))
    digest.update(chunk as Buffer);
  return digest.digest("hex");
};
export const normalizeInvestigationConfig = async (
  input: unknown,
): Promise<InvestigationConfig> => {
  const config = investigationConfigSchema.parse(input);
  config.workspace = await realpath(config.workspace);
  config.binaryPath = await realpath(config.binaryPath);
  for (const command of [config.original, config.replica, config.build])
    if (command !== undefined) {
      command.cwd = await realpath(command.cwd ?? config.workspace);
      if (isAbsolute(command.command))
        command.command = resolve(command.command);
    }
  if ((await realpath(config.original.command)) !== config.binaryPath)
    throw new Error("Original command must be the hash-bound binaryPath");
  return config;
};
