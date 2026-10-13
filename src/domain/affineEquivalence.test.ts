import { expect, it } from "vitest";
import {
  affineEquivalenceQuery,
  recoverGeneratedAffineModel,
  recoverGhidraAffineModel,
} from "./affineEquivalence.js";
const original =
  "long recovered(long input) { undefined8 temporary; if (input < 0) { input = input * -3; } else { input = input * 5; } temporary = input + 7; return temporary; }";
it("recognizes independent static and generated expressions without guessing unsupported functions", () => {
  const left = recoverGhidraAffineModel(original)!;
  const right = recoverGeneratedAffineModel(
    "long long result = x < 0 ? (-3LL * x + (7LL)) : (5LL * x + (7LL));",
  )!;
  expect(left).toEqual(right);
  expect(
    recoverGhidraAffineModel(
      original.replace("return temporary;", "external(); return temporary;"),
    ),
  ).toBeUndefined();
  expect(
    recoverGhidraAffineModel(
      original.replace("if (input < 0)", "if (other < 0)"),
    ),
  ).toBeUndefined();
  expect(
    recoverGeneratedAffineModel(
      "#if 0\nlong long result = x < 0 ? (-3LL * x + (7LL)) : (5LL * x + (7LL));\n#endif",
    ),
  ).toBeUndefined();
});
it("does not silently model signed overflow or reversed ranges as mathematical integers", () => {
  const model = recoverGhidraAffineModel(original)!;
  expect(() =>
    affineEquivalenceQuery(model, model, { min: 1, max: -1 }),
  ).toThrow();
  const overflow = {
    negative: { slope: 1n << 63n, intercept: 0n },
    positive: { slope: 1n, intercept: 0n },
  };
  expect(() =>
    affineEquivalenceQuery(overflow, model, { min: -2, max: 2 }),
  ).toThrow("overflow");
});
