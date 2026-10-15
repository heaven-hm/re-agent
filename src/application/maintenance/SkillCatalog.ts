import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { withRegularFile } from "../RegularFileRead.js";
import { readBoundedFileBytes } from "../../process/BoundedFileBytes.js";

export const maintenanceStages = [
  "triage",
  "static-analysis",
  "runtime-analysis",
  "memory-analysis",
  "repair-and-port",
  "verification",
  "release",
] as const;

export const maintenanceSkillSchema = z
  .object({
    schema_version: z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/u),
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    description: z.string().min(1).max(1000),
    license: z.string().min(1).max(120),
    targets: z.array(z.enum(["software", "game"])).min(1),
    platforms: z.array(z.enum(["windows", "linux", "macos"])).min(1),
    stages: z.array(z.enum(maintenanceStages)).min(1),
    tools: z.array(z.string().min(1).max(120)).max(100),
  })
  .strict();

export type MaintenanceSkill = z.infer<typeof maintenanceSkillSchema>;

export const readMaintenanceFile = (
  path: string,
  maxBytes = 262_144,
): Promise<Buffer> =>
  withRegularFile(
    path,
    async (handle, stats) => {
      if (stats.size > maxBytes)
        throw new Error(`File exceeds ${maxBytes} bytes: ${path}`);
      const bytes = await readBoundedFileBytes(
        handle,
        maxBytes,
        undefined,
        stats.size,
      );
      if (bytes === undefined || bytes.length !== stats.size)
        throw new Error(`File changed or exceeded its limit: ${path}`);
      return bytes;
    },
    { symlinks: "reject" },
  );

export const digestMaintenanceBytes = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Catalog metadata and instruction files only. Discovery never imports or executes skill code. */
export const discoverMaintenanceSkills = async (
  directories: readonly string[],
) => {
  const skills: Array<
    MaintenanceSkill & {
      path: string;
      manifest_sha256: string;
      instructions_sha256: string;
    }
  > = [];
  const rejected: Array<{ path: string; reason: string }> = [];
  const roots = [
    ...new Set(directories.map((directory) => resolve(directory))),
  ].sort();
  for (const root of roots) {
    try {
      const rootState = await lstat(root);
      if (rootState.isSymbolicLink() || !rootState.isDirectory())
        throw new Error("Skill root must be a real directory");
      const entries = await readdir(root, { withFileTypes: true });
      if (entries.length > 1024)
        throw new Error("Skill root exceeds the 1024-entry discovery budget");
      for (const entry of entries.sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      )) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const path = join(root, entry.name);
        try {
          if (entry.isSymbolicLink())
            throw new Error("Symbolic skill directories are not admitted");
          const manifestBytes = await readMaintenanceFile(
            join(path, "skill.json"),
          );
          const manifest = maintenanceSkillSchema.parse(
            JSON.parse(manifestBytes.toString("utf8")),
          );
          const instructions = await readMaintenanceFile(
            join(path, "SKILL.md"),
          );
          const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(
            instructions.toString("utf8"),
          )?.[1];
          const name =
            frontmatter === undefined
              ? undefined
              : /^name:[ \t]*([a-z][a-z0-9-]*)[ \t]*$/mu.exec(frontmatter)?.[1];
          if (name !== manifest.id)
            throw new Error(
              "SKILL.md frontmatter name must match skill.json id",
            );
          skills.push({
            ...manifest,
            path,
            manifest_sha256: digestMaintenanceBytes(manifestBytes),
            instructions_sha256: digestMaintenanceBytes(instructions),
          });
        } catch (cause: unknown) {
          rejected.push({
            path,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    } catch (cause: unknown) {
      rejected.push({
        path: root,
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  const duplicated = new Set(
    skills
      .filter(
        (skill, index) =>
          skills.findIndex((other) => other.id === skill.id) !== index,
      )
      .map((skill) => skill.id),
  );
  for (const skill of skills)
    if (duplicated.has(skill.id))
      rejected.push({
        path: skill.path,
        reason: `Ambiguous duplicate skill id: ${skill.id}`,
      });
  return {
    skills: skills.filter((skill) => !duplicated.has(skill.id)),
    rejected,
    executes_skill_code: false as const,
    status: rejected.length ? ("INCOMPLETE" as const) : ("VALID" as const),
  };
};
