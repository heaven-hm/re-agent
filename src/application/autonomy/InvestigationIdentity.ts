import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ArtifactResourceScope } from "../../artifacts/ArtifactResourceScope.js";
import { scanCanonicalArtifactInventoryInScope } from "../../artifacts/inventory/scanCanonical.js";
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
  if (config.applicationArtifacts?.length === 0)
    delete config.applicationArtifacts;
  config.workspace = await realpath(config.workspace);
  config.binaryPath = await realpath(config.binaryPath);
  if (config.applicationArtifacts !== undefined)
    for (const artifact of config.applicationArtifacts)
      artifact.path = await realpath(artifact.path);
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

/** Rehash configured application artifacts before creating or resuming a run. */
export const validateApplicationArtifactBindings = async (
  config: InvestigationConfig,
): Promise<void> => {
  const artifacts = config.applicationArtifacts ?? [];
  if (artifacts.length === 0) return;
  const resources = new ArtifactResourceScope();
  try {
    for (const artifact of artifacts) {
      const snapshot = await scanCanonicalArtifactInventoryInScope(
        artifact.path,
        { resourceScope: resources },
      );
      if (snapshot.manifest.root_sha256 !== artifact.sha256)
        throw new Error(
          `Application artifact changed: ${artifact.path}; expected SHA-256 ${artifact.sha256}, observed ${snapshot.manifest.root_sha256}`,
        );
    }
  } finally {
    await resources.close();
  }
};
