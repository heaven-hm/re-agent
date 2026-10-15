import { expect, it } from "vitest";
import { minimizeDifferentialInput } from "../../../src/domain/reconstruction/DifferentialMinimizer.js";

it("minimizes reproducible divergent input with a bounded oracle", async () => {
  const observe = async (input: Uint8Array) => ({
    reference: new Uint8Array([input.includes(42) ? 1 : 0]),
    candidate: new Uint8Array([0]),
  });
  const result = await minimizeDifferentialInput(new Uint8Array([1, 2, 42, 3, 4]), observe);
  expect([...result.counterexample.input]).toEqual([42]);
  expect(result.executions).toBeLessThanOrEqual(256);
});
it("rejects non-divergent initial observations", async () => {
  await expect(minimizeDifferentialInput(new Uint8Array([1]), async () => ({reference:new Uint8Array([0]),candidate:new Uint8Array([0])}))).rejects.toThrow(/not a differential/u);
});

it("preserves a caller-defined differential failure class", async () => {
  const observe = async (input: Uint8Array) => ({reference:new Uint8Array([input.includes(42) ? 7 : input.includes(9) ? 3 : 0]), candidate:new Uint8Array([0])});
  const result = await minimizeDifferentialInput(new Uint8Array([9,42]), observe, 256, (initial, candidate) =>
    candidate.reference[0] === initial.reference[0] && candidate.candidate[0] === initial.candidate[0]);
  expect([...result.counterexample.input]).toEqual([42]);
});
