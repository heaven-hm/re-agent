import { z } from "zod";

const identifier = "[_a-zA-Z][_a-zA-Z0-9]*";
/** Narrow models have explicit sign branches and integer arithmetic semantics. */
export interface SignedAffineModel {
  readonly negative: { readonly slope: bigint; readonly intercept: bigint };
  readonly positive: { readonly slope: bigint; readonly intercept: bigint };
}

/** Recognize an entire pure Ghidra function; unsupported code is never guessed. */
export const recoverGhidraAffineModel = (
  text: string,
): SignedAffineModel | undefined => {
  const expression = new RegExp(
    `^\\s*long ${identifier}\\s*\\(\\s*long (?<input>${identifier})\\s*\\)\\s*\\{\\s*undefined8 (?<local>${identifier});\\s*if\\s*\\(\\s*\\k<input>\\s*<\\s*0\\s*\\)\\s*\\{\\s*\\k<input>\\s*=\\s*\\k<input>\\s*\\*\\s*(?<negative>-?\\d+)\\s*;\\s*\\}\\s*else\\s*\\{\\s*\\k<input>\\s*=\\s*\\k<input>\\s*\\*\\s*(?<positive>-?\\d+)\\s*;\\s*\\}\\s*\\k<local>\\s*=\\s*\\k<input>\\s*\\+\\s*(?<intercept>-?\\d+)\\s*;\\s*return\\s+\\k<local>\\s*;\\s*\\}\\s*$`,
    "u",
  );
  const groups = expression.exec(text)?.groups;
  if (groups === undefined) return undefined;
  return {
    negative: {
      slope: BigInt(groups.negative!),
      intercept: BigInt(groups.intercept!),
    },
    positive: {
      slope: BigInt(groups.positive!),
      intercept: BigInt(groups.intercept!),
    },
  };
};

/** Extract only the generated arithmetic expression, not a whole-program proof. */
export const recoverGeneratedAffineModel = (
  source: string,
): SignedAffineModel | undefined => {
  const text = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  if (/^\s*#\s*(?!include\b)/mu.test(text)) return undefined;
  const expression =
    /^\s*long long result\s*=\s*x\s*<\s*0\s*\?\s*\((-?\d+)LL\s*\*\s*x\s*\+\s*\((-?\d+)LL\)\)\s*:\s*\((-?\d+)LL\s*\*\s*x\s*\+\s*\((-?\d+)LL\)\)\s*;\s*$/gmu;
  const matches = [...text.matchAll(expression)];
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  return {
    negative: { slope: BigInt(match[1]!), intercept: BigInt(match[2]!) },
    positive: { slope: BigInt(match[3]!), intercept: BigInt(match[4]!) },
  };
};

export const affineProofRangeSchema = z
  .strictObject({ min: z.number().int().safe(), max: z.number().int().safe() })
  .refine((value) => value.min <= value.max, "Proof range must be ordered");
const smtInteger = (value: bigint): string =>
  value < 0n ? `(- ${(-value).toString()})` : value.toString();
const term = (model: SignedAffineModel): string =>
  `(ite (< x 0) (+ (* ${smtInteger(model.negative.slope)} x) ${smtInteger(model.negative.intercept)}) (+ (* ${smtInteger(model.positive.slope)} x) ${smtInteger(model.positive.intercept)}))`;

/** Mathematical integers are justified only where signed 64-bit arithmetic cannot overflow. */
export const affineEquivalenceQuery = (
  left: SignedAffineModel,
  right: SignedAffineModel,
  rangeInput: unknown,
): string => {
  const range = affineProofRangeSchema.parse(rangeInput);
  const limit = (1n << 63n) - 1n;
  const magnitude = BigInt(Math.max(Math.abs(range.min), Math.abs(range.max)));
  for (const model of [left, right])
    for (const branch of [model.negative, model.positive]) {
      const abs = (value: bigint) => (value < 0n ? -value : value);
      if (abs(branch.slope) * magnitude + abs(branch.intercept) > limit)
        throw new Error("Proof range can overflow signed 64-bit arithmetic");
    }
  return `(set-option :timeout 5000)\n(set-logic QF_LIA)\n(declare-const x Int)\n(assert (and (<= ${smtInteger(BigInt(range.min))} x) (<= x ${smtInteger(BigInt(range.max))})))\n(assert (not (= ${term(left)} ${term(right)})))\n(check-sat)\n`;
};
