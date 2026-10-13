import { z } from "zod";

/** A finite reproducible integer experiment budget, separate from proof claims. */
export const numericExperimentSchema = z
  .strictObject({
    range: z.strictObject({
      min: z.number().int().safe(),
      max: z.number().int().safe(),
    }),
    count: z.number().int().min(1).max(10_000),
    seed: z.number().int().min(0).max(0xffff_ffff),
    idPrefix: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .default("experiment"),
    argumentPrefix: z.array(z.string()).default([]),
    argumentSuffix: z.array(z.string()).default([]),
  })
  .superRefine((value, context) => {
    const width = value.range.max - value.range.min;
    if (width < 0 || !Number.isSafeInteger(width))
      context.addIssue({
        code: "custom",
        message: "Range must be ordered and its width a safe integer",
        path: ["range"],
      });
    if (width > 0 && value.count < 2)
      context.addIssue({
        code: "custom",
        message: "At least two cases required to cover both boundaries",
        path: ["count"],
      });
  });
export type NumericExperimentConfig = z.infer<typeof numericExperimentSchema>;
export interface NumericExperimentCase {
  readonly id: string;
  readonly arguments: readonly string[];
}

/** Includes declared endpoints, neighbors and zero boundaries before seeded exploration. */
export const generateNumericExperiments = (
  input: unknown,
): readonly NumericExperimentCase[] => {
  const config = numericExperimentSchema.parse(input);
  const { min, max } = config.range;
  const width = max - min;
  const limit = width < config.count ? width + 1 : config.count;
  const selected = new Set<number>();
  const add = (value: number): void => {
    if (value >= min && value <= max && selected.size < limit)
      selected.add(value);
  };
  for (const value of [min, max, min + 1, max - 1, 0, -1, 1]) add(value);
  // Mulberry32 has a defined unsigned 32-bit state and permits seed zero.
  let state = config.seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  // Duplicate samples cannot create an unbounded loop in small integer ranges.
  for (
    let attempts = 0;
    selected.size < limit && attempts < limit * 20;
    attempts += 1
  ) {
    add(min + Math.floor(random() * (width + 1)));
  }
  for (let value = min; selected.size < limit; value += 1) add(value);
  return [...selected].map((value, index) => ({
    id: `${config.idPrefix}-${String(config.seed)}-${String(index).padStart(5, "0")}`,
    arguments: [
      ...config.argumentPrefix,
      String(value),
      ...config.argumentSuffix,
    ],
  }));
};
