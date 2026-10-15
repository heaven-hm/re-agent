import { expect, it } from "vitest";
import { buildBitvectorEquivalenceQuery, classifyBitvectorSolverResult } from "../../../src/domain/reconstruction/BitvectorProofObligations.js";
it("uses modular bitvector arithmetic, not unbounded integers", () => {
  const query = buildBitvectorEquivalenceQuery({width:8,signed:true,left:{multiplier:2n,offset:-1n},right:{multiplier:2n,offset:255n}});
  expect(query).toContain("QF_BV");
  expect(query).toContain("(_ bv255 8)");
  expect(query).toContain("bvmul");
});
it("fails closed for solver errors and classifies unknown distinctly", () => {
  expect(classifyBitvectorSolverResult("unsat")).toBe("PROVEN_UNDER_ASSUMPTIONS");
  expect(classifyBitvectorSolverResult("unknown")).toBe("UNKNOWN");
  expect(() => classifyBitvectorSolverResult("timeout")).toThrow();
});
