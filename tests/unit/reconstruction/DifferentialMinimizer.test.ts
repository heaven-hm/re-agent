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
