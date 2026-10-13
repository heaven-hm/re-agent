import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  unlink,
  realpath,
  rename,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { createEvidence, type Evidence } from "../../domain/evidence.js";
import type {
  InvestigationState,
  RepairCandidate,
} from "./InvestigationContracts.js";

export const AUTONOMY_PROVIDER = {
  id: "rea-autonomous-reconstruction",
  name: "REA autonomous reconstruction",
  version: "1",
};

/** File transaction authority confined to the reconstruction workspace. */
export class InvestigationWorkspace {
  constructor(
    private readonly state: InvestigationState,
    private readonly storePath: string,
    private readonly save: (event: string, detail: string) => Promise<void>,
    private readonly record: (value: Evidence) => Evidence,
  ) {}
  async safePatchPath(path: string): Promise<string> {
    if (!isAbsolute(path))
      throw new Error("Candidate file paths must be absolute");
    const parent = await realpath(dirname(path));
    const resolved = resolve(parent, basename(path));
    const rel = relative(this.state.config.workspace, resolved);
    if (rel.startsWith("..") || isAbsolute(rel) || rel === "")
      throw new Error("Candidate escapes reconstruction workspace");
    if (
      resolved === this.state.config.binaryPath ||
      resolved === this.storePath ||
      resolved in this.state.originalArgumentSha256
    )
      throw new Error("Candidate cannot overwrite original or checkpoint");
    try {
      if ((await realpath(resolved)) !== resolved)
        throw new Error("Candidate cannot modify symlinks");
    } catch (cause) {
      if (
        !(cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      )
        throw cause;
    }
    return resolved;
  }
  async apply(candidate: RepairCandidate): Promise<void> {
    for (const evidence of candidate.evidence ?? []) this.record(evidence);
    const files = await Promise.all(
      candidate.files.map(async (file) => ({
        ...file,
        path: await this.safePatchPath(file.path),
      })),
    );
    if (new Set(files.map((file) => file.path)).size !== files.length)
      throw new Error("Duplicate candidate file");
    this.state.pendingRollback = await Promise.all(
      files.map(async (file) => {
        try {
          return {
            path: file.path,
            originalBase64: (await readFile(file.path)).toString("base64"),
          };
        } catch (cause) {
          if (
            cause instanceof Error &&
            "code" in cause &&
            cause.code === "ENOENT"
          )
            return { path: file.path, originalBase64: null };
          throw cause;
        }
      }),
    );
    this.state.pendingCandidate = { files };
    await this.save(
      "candidate-staged",
      "Rollback journal committed before modifying source files",
    );
    for (const file of files) await this.replace(file.path, file.content);
    this.record(
      createEvidence(undefined, AUTONOMY_PROVIDER, {
        predicateType: "rea.reconstruction-candidate",
        operation: "apply_reconstruction_candidate",
        parameters: { original_sha256: this.state.binarySha256 },
        result: {
          files: files.map((file) => ({
            path: file.path,
            sha256: createHash("sha256").update(file.content).digest("hex"),
          })),
        },
        confidence: "inferred",
        authority: "analyst-inference",
        evidenceLinks: this.state.evidence.map((item) => item.evidence_id),
        limitations: [
          "Candidate behavior remains unverified until independent original and replica experiments pass.",
        ],
      }),
    );
    await this.save(
      "candidate-applied",
      "Source hashes and input Evidence links committed",
    );
  }
  async rollback(preserveCandidate = false): Promise<void> {
    for (const file of this.state.pendingRollback) {
      await this.safePatchPath(file.path);
      if (file.originalBase64 === null)
        await unlink(file.path).catch((cause: unknown) => {
          if (
            !(
              cause instanceof Error &&
              "code" in cause &&
              cause.code === "ENOENT"
            )
          )
            throw cause;
        });
      else
        await this.replace(
          file.path,
          Buffer.from(file.originalBase64, "base64"),
        );
    }
    this.state.pendingRollback = [];
    if (!preserveCandidate) this.state.pendingCandidate = null;
    await this.save("rollback", "Restored pre-candidate source bytes");
  }
  private async replace(path: string, content: string | Buffer): Promise<void> {
    const temporary = `${path}.${randomUUID()}.candidate`;
    try {
      await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((cause: unknown) => {
        if (
          !(
            cause instanceof Error &&
            "code" in cause &&
            cause.code === "ENOENT"
          )
        )
          throw cause;
      });
    }
  }
}
