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
