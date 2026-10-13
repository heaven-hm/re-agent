import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTestTempDirectory } from "../fixtures/temporaryDirectory.js";
import {
  affineEquivalenceQuery,
  recoverGhidraAffineModel,
} from "../../src/domain/affineEquivalence.js";
import { runOwnedCommand } from "../../src/process/OwnedCommand.js";

// Explicit real-tool lane; absent Z3 is a named capability skip, not a fake solver.
it.skipIf(process.env.REA_Z3_COMMAND === undefined)(
  "real Z3 distinguishes an equivalent expression from a hidden negative-branch mismatch",
  async () => {
    const root = await createTestTempDirectory("rea-affine-solver-");
    const original = recoverGhidraAffineModel(
      "long recovered(long input) { undefined8 temporary; if (input < 0) { input = input * -3; } else { input = input * 5; } temporary = input + 7; return temporary; }",
    )!;
    for (const [name, right, expected] of [
      ["matching", original, "unsat"],
      [
        "mismatch",
        { ...original, negative: { slope: -2n, intercept: 7n } },
        "sat",
      ],
    ] as const) {
      const path = join(root, `${name}.smt2`);
      await writeFile(
        path,
        affineEquivalenceQuery(original, right, {
          min: -1000000,
          max: 1000000,
        }),
      );
      const result = await runOwnedCommand(
        {
          command: process.env.REA_Z3_COMMAND!,
          arguments: ["-smt2", path],
          runId: `rea-proof-${name}`,
        },
        { timeoutMs: 10_000, diagnosticBytes: 4096 },
      );
      expect(result.stdout.text.trim()).toBe(expected);
      expect(result.exitCode).toBe(0);
    }
  },
  30000,
);
