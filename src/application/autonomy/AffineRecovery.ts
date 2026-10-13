import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createEvidence,
  parseEvidence,
  type Evidence,
} from "../../domain/evidence.js";
import { runOwnedCommand } from "../../process/OwnedCommand.js";
import type {
  InvestigationHooks,
  InvestigationState,
  RepairCandidate,
} from "./InvestigationContracts.js";

/** Failed hypotheses retain the runtime observations that rejected them. */
export class AffineRecoveryFailure extends Error {
  constructor(
    message: string,
    readonly evidence: readonly Evidence[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AffineRecoveryFailure";
  }
}
interface Affine {
  readonly slope: bigint;
  readonly intercept: bigint;
}
export interface AffineRecoveryConfig {
  readonly range: { readonly min: number; readonly max: number };
  readonly sourcePath: string;
}
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const abs = (value: bigint): bigint => (value < 0n ? -value : value);
const provider = {
  id: "rea-affine-experiments",
  name: "REA bounded affine recovery",
  version: "1",
};
const limits = [
  "Hypothesis class: integer affine functions, optionally split at x < 0; finite observations do not prove this class or universal equivalence.",
  "Numeric command-line output only; UI, timing, audio, graphics, file and network behavior remain unverified.",
  "Only canonical decimal integer arguments in the declared range are reconstructed; invalid input acceptance is unverified.",
];
const requireStaticEvidence = (
  state: Readonly<InvestigationState>,
): readonly Evidence[] => {
  const evidence = state.evidence
    .map(parseEvidence)
    .filter((item) => item.subject?.digest.sha256 === state.binarySha256);
  if (
    !evidence.some((item) => item.operation === "search_procedures") ||
    !evidence.some((item) => item.operation === "analyze_function")
  )
    throw new Error(
      "Affine recovery requires hash-bound static function inventory and dossier evidence",
    );
  return evidence.filter((item) =>
    ["search_procedures", "analyze_function"].includes(item.operation),
  );
};
const probe = async (
  state: Readonly<InvestigationState>,
  x: number,
  signal: AbortSignal,
): Promise<{ value: bigint; evidence: Evidence }> => {
  signal.throwIfAborted();
  const actualHash = createHash("sha256")
    .update(await readFile(state.config.binaryPath))
    .digest("hex");
  if (actualHash !== state.binarySha256)
    throw new Error("Original binary changed before affine experiment");
  const command = state.config.original;
  if (resolve(command.command) !== resolve(state.config.binaryPath))
    throw new Error(
      "Runtime experiment must execute hash-bound original binary",
    );
  const output = await runOwnedCommand(
    {
      command: command.command,
      arguments: [...command.arguments, String(x)],
      cwd: command.cwd ?? state.config.workspace,
      runId: `${state.id}-affine-${String(state.iteration)}-${String(x)}`,
    },
    {
      timeoutMs: Math.min(state.config.timeoutMs, 10_000),
      diagnosticBytes: Math.min(state.config.outputLimitBytes, 4096),
    },
    { signal },
  );
  if (
    createHash("sha256")
      .update(await readFile(state.config.binaryPath))
      .digest("hex") !== state.binarySha256
  )
    throw new Error("Original binary changed during affine experiment");
  const text = output.stdout.text.trim();
  const evidence = createEvidence(
    {
      path: state.config.binaryPath,
      sha256: state.binarySha256,
      format: "file",
    },
    provider,
    {
      operation: "affine_runtime_probe",
      predicateType: "rea.numeric-experiment",
      parameters: {
        input: x,
        command: command.command,
        arguments: [...command.arguments, String(x)],
      },
      result: {
        input: x,
        output: text,
        stdout: output.stdout.text,
        stderr: output.stderr.text,
        exit_code: output.exitCode ?? null,
      },
      confidence: "observed",
      authority: "controlled-replay",
      limitations: limits,
    },
  );
  if (
    output.exitCode !== 0 ||
    output.stderr.text.length !== 0 ||
    output.stdout.text !== `${text}\n` ||
    !/^-?\d+$/u.test(text)
  )
    throw new AffineRecoveryFailure(
      "Original does not expose a successful single-integer output contract",
      [evidence],
    );
  const value = BigInt(text);
  if (abs(value) > MAX)
    throw new AffineRecoveryFailure(
      "Observed result exceeds supported safe integer range",
      [evidence],
    );

  return { value, evidence };
};
const ensureArithmetic = (
  branch: Affine,
  minimum: number,
  maximum: number,
): void => {
  const magnitude =
    abs(BigInt(minimum)) > abs(BigInt(maximum))
      ? abs(BigInt(minimum))
      : abs(BigInt(maximum));
  if (abs(branch.slope) * magnitude + abs(branch.intercept) > MAX)
    throw new Error(
      "Recovered arithmetic can exceed safe integer bounds in declared range",
    );
};
const source = (
  config: AffineRecoveryConfig,
  positive: Affine,
  negative: Affine | undefined,
  ids: readonly string[],
): string => {
  ensureArithmetic(positive, 0, config.range.max);
  ensureArithmetic(negative ?? positive, config.range.min, -1);
  const expression = (branch: Affine): string =>
    `(${branch.slope.toString()}LL * x + (${branch.intercept.toString()}LL))`;
  return `/* Recovered from REA evidence ${ids.join(", ")}.\n * ${limits.join("\n * ")}\n * ${negative ? "Both sign branches observed and sampled." : "Negative branch unresolved; initial single-branch hypothesis awaits differential tests."}\n */
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <ctype.h>
#include <limits.h>
int main(int argc, char **argv) {
  if (argc != 2 || argv[1][0] == '\\0' || isspace((unsigned char)argv[1][0])) return 2;
  errno = 0;
  char *end = NULL;
  long long x = strtoll(argv[1], &end, 10);
  if (errno == ERANGE || end == argv[1] || *end != '\\0') return 2;
  if (x < ${String(config.range.min)}LL || x > ${String(config.range.max)}LL) return 2;
  long long result = ${negative ? `x < 0 ? ${expression(negative)} : ${expression(positive)}` : expression(positive)};
  printf("%lld\\n", result);
  return 0;
}
`;
};

const hypothesisEvidence = (
  state: Readonly<InvestigationState>,
  config: AffineRecoveryConfig,
  facts: {
    repair: boolean;
    positive: Affine;
    negative: Affine | undefined;
    inputs: number[];
    ids: string[];
  },
): Evidence => {
  const { repair, positive, negative, inputs, ids } = facts;
  return createEvidence(
    {
      path: state.config.binaryPath,
      sha256: state.binarySha256,
      format: "file",
    },
    provider,
    {
      operation: "affine_reconstruction_hypothesis",
      predicateType: "rea.behavior-hypothesis",
      parameters: { range: config.range, repairing: repair },
      result: {
        positive: {
          slope: positive.slope.toString(),
          intercept: positive.intercept.toString(),
        },
        negative: negative
          ? {
              slope: negative.slope.toString(),
              intercept: negative.intercept.toString(),
            }
          : null,
        validation_inputs: inputs,
      },
      confidence: "inferred",
      authority: "analyst-inference",
      evidenceLinks: ids,
      limitations: [
        ...limits,
        ...(negative
          ? []
          : [
              "Negative input behavior unresolved; extrapolation must be tested.",
            ]),
      ],
    },
  );
};

const collectProbes = async (
  state: Readonly<InvestigationState>,
  inputs: readonly number[],
  signal: AbortSignal,
): Promise<{ observations: Map<number, bigint>; evidence: Evidence[] }> => {
  const observations = new Map<number, bigint>();
  const evidence: Evidence[] = [];
  for (const input of inputs) {
    try {
      const result = await probe(state, input, signal);
      observations.set(input, result.value);
      evidence.push(result.evidence);
    } catch (error) {
      throw new AffineRecoveryFailure(
        error instanceof Error ? error.message : String(error),
        [
          ...evidence,
          ...(error instanceof AffineRecoveryFailure ? error.evidence : []),
        ],
        { cause: error },
      );
    }
  }
  return { observations, evidence };
};
/** Investigate a bounded numeric hypothesis; differential mismatches trigger sign-branch recovery. */
export const createAffineRecoveryHooks = (
  config: AffineRecoveryConfig,
): InvestigationHooks => {
  if (
    !Number.isSafeInteger(config.range.min) ||
    !Number.isSafeInteger(config.range.max) ||
    config.range.min > -2 ||
    config.range.max < 2
  )
    throw new Error(
      "Affine probe range must contain -2,-1,0,1,2 and safe integer endpoints",
    );
  if (!config.sourcePath.trim())
    throw new Error("Reconstruction source path required");
  const recover = async (
    state: Readonly<InvestigationState>,
    signal: AbortSignal,
    repair: boolean,
  ): Promise<RepairCandidate> => {
    const staticEvidence = requireStaticEvidence(state);
    const inputs = [
      ...new Set([
        0,
        1,
        2,
        config.range.max,
        Math.floor(config.range.max / 2),
        ...(repair
          ? [-1, -2, config.range.min, Math.ceil(config.range.min / 2)]
          : []),
      ]),
    ];
    const { observations, evidence } = await collectProbes(
      state,
      inputs,
      signal,
    );
    const positive: Affine = {
      slope: observations.get(1)! - observations.get(0)!,
      intercept: observations.get(0)!,
    };
    const negative: Affine | undefined = repair
      ? {
          slope: observations.get(-1)! - observations.get(-2)!,
          intercept: 2n * observations.get(-1)! - observations.get(-2)!,
        }
      : undefined;
    for (const [input, actual] of observations) {
      const branch = input < 0 ? negative : positive;
      if (
        branch === undefined ||
        branch.slope * BigInt(input) + branch.intercept !== actual
      )
        throw new AffineRecoveryFailure(
          "Runtime validation rejects the sign-split affine hypothesis; nonlinear or unsupported behavior remains unresolved",
          evidence,
        );
    }
    const ids = [...staticEvidence, ...evidence].map(
      (item) => item.evidence_id,
    );
    const hypothesis = hypothesisEvidence(state, config, {
      repair,
      positive,
      negative,
      inputs,
      ids,
    });
    evidence.push(hypothesis);
    let content: string;
    try {
      content = source(config, positive, negative, [
        ...ids,
        hypothesis.evidence_id,
      ]);
    } catch (error) {
      throw new AffineRecoveryFailure(
        error instanceof Error ? error.message : String(error),
        evidence,
        { cause: error },
      );
    }
    return {
      files: [
        {
          path: resolve(state.config.workspace, config.sourcePath),
          content,
        },
      ],
      evidence,
    };
  };
  return {
    reconstruct: (state, signal) => recover(state, signal, false),
    repair: (state, signal) =>
      state.results.some((item) => item.status === "fail")
        ? recover(state, signal, true)
        : Promise.resolve(undefined),
  };
};
