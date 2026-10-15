import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runOwnedCommand } from "../../process/OwnedCommand.js";

import {
  buildBitvectorEquivalenceQuery,
  classifyBitvectorSolverResult,
  type BitvectorObligation,
} from "../../domain/reconstruction/BitvectorProofObligations.js";

/** Execute the exact obligation using RE-Agent owned-process supervision. */
export const executeBitvectorObligation = async (
  obligation: BitvectorObligation,
  outputDirectory: string,
  solver = "z3",
  signal?: AbortSignal,
) => {
  const query = buildBitvectorEquivalenceQuery(obligation);
  const sha256 = createHash("sha256").update(query).digest("hex");
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  const queryPath = join(directory, sha256 + ".smt2");
  try {
    await writeFile(queryPath, query, { flag: "wx", mode: 0o600 });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    const previous = await readFile(queryPath, "utf8");
    if (previous !== query)
      throw new Error("Existing SMT obligation differs from expected query");
  }
  const version = await runOwnedCommand(
    {
      command: solver,
      arguments: ["-version"],
      runId: "bitvector-version-" + sha256.slice(0, 16),
    },
    { timeoutMs: 10_000, diagnosticBytes: 4096 },
    signal === undefined ? {} : { signal },
  );
  const execution = await runOwnedCommand(
    {
      command: solver,
      arguments: ["-smt2", queryPath],
      runId: "bitvector-proof-" + sha256.slice(0, 16),
    },
    { timeoutMs: 10_000, diagnosticBytes: 64 * 1024 },
    signal === undefined ? {} : { signal },
  );
  if (execution.stderr.text.trim() !== "")
    throw new Error("SMT solver returned diagnostics");
  const verdict = classifyBitvectorSolverResult(execution.stdout.text);
  return {
    verdict,
    querySha256: sha256,
    queryPath,
    solver,
    solverVersion: version.stdout.text.trim(),
    scope:
      "Modulo-affine equality over bounded-width bitvectors; not native binary equivalence",
  };
};
