import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runOwnedCommand } from "../../process/OwnedCommand.js";

export interface BitvectorObligation {
  width: 8 | 16 | 32 | 64;
  left: { multiplier: bigint; offset: bigint };
  right: { multiplier: bigint; offset: bigint };
  /** Input interpretation only. Equality of affine wraparound expressions is identical for signed and unsigned bit patterns. */
  signed: boolean;
}
/** Valid QF_BV obligation for wraparound machine arithmetic, not full executable equivalence. */
export const buildBitvectorEquivalenceQuery = (input: BitvectorObligation): string => {
  const {width, left, right, signed} = input;
  if (![8,16,32,64].includes(width)) throw new Error("Unsupported bitvector width");
  const constant = (value: bigint) => {
    const unsigned = ((value % (1n << BigInt(width))) + (1n << BigInt(width))) % (1n << BigInt(width));
    return `(_ bv${unsigned} ${width})`;
  };
  const expression = (affine: typeof left) =>
    `(bvadd (bvmul ${constant(affine.multiplier)} x) ${constant(affine.offset)})`;
  return [
    "(set-logic QF_BV)",
    `(declare-const x (_ BitVec ${width}))`,
    `; ${signed ? "signed" : "unsigned"} input interpretation; arithmetic wraps modulo 2^${width}`,
    `(assert (not (= ${expression(left)} ${expression(right)})))`,
    "(check-sat)",
    "",
  ].join("\n");
};
export const classifyBitvectorSolverResult = (output: string):
  "PROVEN_UNDER_ASSUMPTIONS" | "COUNTEREXAMPLE_EXISTS" | "UNKNOWN" => {
  const first = output.trim().split(/\s+/u)[0];
  // A proof verdict must be the first solver token; comments, errors and empty output fail closed.
  if (!first || !/^(unsat|sat|unknown)$/u.test(first)) throw new Error("Invalid SMT solver result");
  if (first === "unsat") return "PROVEN_UNDER_ASSUMPTIONS";
  if (first === "sat") return "COUNTEREXAMPLE_EXISTS";
  if (first === "unknown") return "UNKNOWN";
  throw new Error("Invalid SMT solver result");
};

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
  await writeFile(queryPath, query, { flag: "wx", mode: 0o600 });
  const version = await runOwnedCommand(
    { command: solver, arguments: ["-version"], runId: "bitvector-version-" + sha256.slice(0, 16) },
    { timeoutMs: 10_000, diagnosticBytes: 4096 },
    signal === undefined ? {} : { signal },
  );
  const execution = await runOwnedCommand(
    { command: solver, arguments: ["-smt2", queryPath], runId: "bitvector-proof-" + sha256.slice(0, 16) },
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
    scope: "Modulo-affine equality over bounded-width bitvectors; not native binary equivalence",
  };
};
