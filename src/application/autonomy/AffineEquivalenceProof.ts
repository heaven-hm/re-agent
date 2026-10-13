import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  createEvidence,
  parseEvidence,
  type Evidence,
} from "../../domain/evidence.js";
import { functionDossierSchema } from "../../domain/hopperValues.js";
import {
  recoverGhidraAffineModel,
  recoverGeneratedAffineModel,
  affineEquivalenceQuery,
  affineProofRangeSchema,
} from "../../domain/affineEquivalence.js";
import { runOwnedCommand } from "../../process/OwnedCommand.js";
import { parseInvestigationState } from "./InvestigationContracts.js";
import { hashFile } from "./InvestigationIdentity.js";

/** Prove extracted expressions under named assumptions; never universal binary equivalence. */
export const proveAffineExpressions = async (
  input: {
    readonly checkpoint: string;
    readonly source: string;
    readonly outputDirectory: string;
    readonly range: { readonly min: number; readonly max: number };
    readonly solver?: string;
  },
  signal?: AbortSignal,
): Promise<Evidence> => {
  const state = parseInvestigationState(
    JSON.parse(await readFile(input.checkpoint, "utf8")),
  );
  if (state.status !== "suite-passed")
    throw new Error(
      "Expression proof requires a completed empirical checkpoint",
    );
  if ((await hashFile(state.config.binaryPath)) !== state.binarySha256)
    throw new Error("Original binary changed before proof");
  const range = affineProofRangeSchema.parse(input.range);
  const source = await readFile(input.source, "utf8");
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const candidate = [...state.evidence].reverse().find((record) => {
    if (record.operation !== "apply_reconstruction_candidate") return false;
    const result = record.normalized_result;
    return (
      typeof result === "object" &&
      result !== null &&
      !Array.isArray(result) &&
      Array.isArray(result.files) &&
      result.files.some(
        (file) =>
          typeof file === "object" &&
          file !== null &&
          !Array.isArray(file) &&
          file.path === resolve(input.source) &&
          file.sha256 === sourceSha256,
      )
    );
  });
  if (candidate === undefined)
    throw new Error(
      "Source is not an evidence-linked reconstruction candidate",
    );
  const right = recoverGeneratedAffineModel(source);
  if (right === undefined)
    throw new Error("Unsupported generated C expression; no proof inferred");
  const functions = state.evidence
    .filter(
      (record) =>
        record.operation === "analyze_function" &&
        record.subject?.digest.sha256 === state.binarySha256 &&
        record.provider.id === "ghidra",
    )
    .map((record) => ({
      record,
      dossier: functionDossierSchema.parse(record.normalized_result),
    }))
    .flatMap(({ record, dossier }) => {
      const model =
        dossier.pseudocode === null
          ? undefined
          : recoverGhidraAffineModel(dossier.pseudocode);
      return model === undefined ? [] : [{ record, dossier, model }];
    });
  if (functions.length !== 1)
    throw new Error(
      "Exactly one supported static function model is required; correspondence is ambiguous or unavailable",
    );
  const selected = functions[0]!;
  const subject = selected.record.subject;
  if (
    subject === null ||
    !["mach-o", "elf"].includes(subject.format) ||
    !["arm64", "x86_64"].includes(subject.architecture ?? "")
  )
    throw new Error("Expression proof requires a declared LP64 native target");
  const query = affineEquivalenceQuery(selected.model, right, range);
  const directory = resolve(input.outputDirectory);
  await mkdir(directory); // A proof never overwrites an earlier experiment.
  const queryPath = join(directory, "equivalence.smt2");
  await writeFile(queryPath, query, { flag: "wx", mode: 0o600 });
  const solver = input.solver ?? "z3";
  const version = await runOwnedCommand(
    {
      command: solver,
      arguments: ["-version"],
      runId: `${state.id}-proof-version`,
    },
    { timeoutMs: 10_000, diagnosticBytes: 4096 },
    (signal === undefined ? {} : { signal }),
  );
  const output = await runOwnedCommand(
    {
      command: solver,
      arguments: ["-smt2", queryPath],
      runId: `${state.id}-proof`,
    },
    { timeoutMs: 10_000, diagnosticBytes: 64 * 1024 },
    (signal === undefined ? {} : { signal }),
  );
  if (
    (await hashFile(state.config.binaryPath)) !== state.binarySha256 ||
    (await hashFile(input.source)) !== sourceSha256
  )
    throw new Error("Proof input changed during solver execution");
  const answer = output.stdout.text.trim();
  if (
    !["sat", "unsat", "unknown"].includes(answer) ||
    output.stderr.text !== ""
  )
    throw new Error("Solver returned an unsupported or incomplete response");
  const evidence = createEvidence(
    {
      path: state.config.binaryPath,
      sha256: state.binarySha256,
      format: subject.format,
      ...(subject.architecture === null
        ? {}
        : { architecture: subject.architecture }),
    },
    {
      id: "rea-z3-affine-proof",
      name: "REA Z3 extracted expression equivalence",
      version: version.stdout.text.trim(),
    },
    {
      predicateType: "rea.formal-expression-equivalence",
      operation: "prove_affine_expressions",
      parameters: {
        source_path: resolve(input.source),
        source_sha256: sourceSha256,
        function_address: selected.dossier.procedure.address,
        range,
        query_sha256: createHash("sha256").update(query).digest("hex"),
      },
      result: {
        status:
          answer === "unsat"
            ? "equivalent-under-assumptions"
            : answer === "sat"
              ? "counterexample-exists"
              : "unknown",
        solver_result: answer,
        query,
        stdout: output.stdout.text,
        stderr: output.stderr.text,
        scope:
          "signed 64-bit scalar arithmetic expression over the declared integer range",
        assumptions: [
          "Ghidra's recognized decompilation faithfully represents the selected native function's scalar arithmetic.",
          "The generated C result expression is executed with its declared integer input, and the compiler preserves its semantics.",
          "Signed 64-bit arithmetic does not overflow within the checked range; parser, ABI, UI, timing and external effects are outside the proof.",
          "Function correspondence is the unique recognized model among the analyzed functions, not a universal correspondence proof.",
        ],
      },
      confidence: "derived",
      authority: "analyst-inference",
      evidenceLinks: [selected.record.evidence_id, candidate.evidence_id],
      limitations: [
        "UNSAT proves equality of the extracted mathematical expressions under the listed assumptions; it does not prove the original binary and replica universally equivalent.",
      ],
    },
  );
  await writeFile(
    join(directory, "static-source-evidence.json"),
    JSON.stringify(parseEvidence(selected.record), null, 2),
  );
  await writeFile(
    join(directory, "candidate-evidence.json"),
    JSON.stringify(parseEvidence(candidate), null, 2),
  );
  await writeFile(
    join(directory, "proof.json"),
    JSON.stringify(evidence, null, 2),
  );
  return evidence;
};
