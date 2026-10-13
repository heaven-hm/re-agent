import { describe, expect, it } from "vitest";
import { generateNumericExperiments } from "./autonomyExperiments.js";

describe("numeric experiment generation", () => {
  it("covers boundaries and zero, preserves argument context, is reproducible", () => {
    const input = {
      range: { min: -100, max: 100 },
      count: 20,
      seed: 0,
      argumentPrefix: ["--value"],
      argumentSuffix: ["tail"],
    };
    const first = generateNumericExperiments(input);
    expect(first).toEqual(generateNumericExperiments(input));
    expect(first).toHaveLength(20);
    expect(first.map((item) => Number(item.arguments[1]))).toEqual(
      expect.arrayContaining([-100, 100, -99, 99, 0, -1, 1]),
    );
    expect(
      first.every(
        (item) =>
          item.arguments[0] === "--value" && item.arguments[2] === "tail",
      ),
    ).toBe(true);
    expect(new Set(first.map((item) => item.id)).size).toBe(20);
    expect(first).not.toEqual(
      generateNumericExperiments({ ...input, seed: 1 }),
    );
  });
  it("exhausts small ranges without duplicates or exceeding declared boundaries", () => {
    const cases = generateNumericExperiments({
      range: { min: 4, max: 6 },
      count: 100,
      seed: 12,
    });
    expect(cases.map((item) => item.arguments[0])).toEqual(["4", "6", "5"]);
    expect(
      generateNumericExperiments({
        range: { min: 0, max: 0 },
        count: 1,
        seed: 0,
      }),
    ).toHaveLength(1);
  });
  it("rejects reversed, unsafe ranges and insufficient boundary budget", () => {
    expect(() =>
      generateNumericExperiments({
        range: { min: 8, max: 2 },
        count: 5,
        seed: 0,
      }),
    ).toThrow();
    expect(() =>
      generateNumericExperiments({
        range: { min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
        count: 5,
        seed: 0,
      }),
    ).toThrow();
    expect(() =>
      generateNumericExperiments({
        range: { min: 0, max: 5 },
        count: 1,
        seed: 0,
      }),
    ).toThrow();
  });
});
