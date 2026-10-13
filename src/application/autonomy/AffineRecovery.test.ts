import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvidence, parseEvidence } from "../../domain/evidence.js";
import { execFileOutput } from "../../process/ExecFileOutput.js";
import {
  AffineRecoveryFailure,
  createAffineRecoveryHooks,
} from "./AffineRecovery.js";
import { investigationStateSchema } from "./InvestigationContracts.js";

const fixture = async (body: string) => {
  const directory = await mkdtemp(join(tmpdir(), "rea-affine-"));
  const binary = join(directory, "original");
  await writeFile(
    join(directory, "original.c"),
    `#include <stdlib.h>\n#include <stdio.h>\nint main(int argc,char **argv){if(argc!=2)return 2; long long x=atoll(argv[1]); printf("%lld\\n", ${body});return 0;}\n`,
  );
  await execFileOutput("clang", [join(directory, "original.c"), "-o", binary], {
    timeout: 20_000,
  });
  const hash = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  const staticEvidence = ["search_procedures", "analyze_function"].map(
    (operation) =>
      createEvidence(
        { path: binary, sha256: hash, format: "file" },
        { id: "static-fixture", name: "Static fixture", version: "1" },
        { operation, parameters: {}, result: {}, confidence: "observed" },
      ),
  );
  const state = investigationStateSchema.parse({
    version: 1,
    id: "affine-test",
    binarySha256: hash,
    config: {
      binaryPath: binary,
      workspace: directory,
      original: { command: binary },
      replica: { command: join(directory, "replica") },
      cases: [{ id: "negative", arguments: ["-5"] }],
      timeoutMs: 10000,
    },
    status: "ready",
    iteration: 0,
    evidence: staticEvidence,
    regressions: [],
    functions: [],
    history: [],
    results: [],
    pendingRollback: [],
    limitations: [],
  });
  return { directory, state };
};

describe("bounded affine runtime recovery", { timeout: 60_000 }, () => {
  it("derives coefficients from original execution, repairs unseen sign branch, compiles independently", async () => {
    const { directory, state } = await fixture(
      "x < 0 ? -4LL*x+9LL : 7LL*x-3LL",
    );
    try {
      const hooks = createAffineRecoveryHooks({
        range: { min: -20, max: 20 },
        sourcePath: "replica.c",
      });
      const initial = await hooks.reconstruct!(
        state,
        new AbortController().signal,
      );
      expect(initial?.files[0]?.content).toContain(
        "Negative branch unresolved",
      );
      expect(
        initial?.evidence?.filter(
          (item) => item.operation === "affine_runtime_probe",
        ),
      ).toHaveLength(5);
      state.results = [
        {
          caseId: "negative",
          comparisonEvidenceId: state.evidence[0]!.evidence_id,
          status: "fail",
        },
      ];
      const repair = await hooks.repair!(state, new AbortController().signal);
      expect(
        repair?.evidence?.every(
          (item) => parseEvidence(item).evidence_id === item.evidence_id,
        ),
      ).toBe(true);
      const recovered = repair?.evidence?.find(
        (item) => item.operation === "affine_reconstruction_hypothesis",
      );
      expect(recovered?.confidence).toBe("inferred");
      expect(recovered?.normalized_result).toMatchObject({
        positive: { slope: "7", intercept: "-3" },
        negative: { slope: "-4", intercept: "9" },
      });
      await writeFile(join(directory, "replica.c"), repair!.files[0]!.content);
      await execFileOutput(
        "clang",
        [join(directory, "replica.c"), "-o", join(directory, "replica")],
        { timeout: 20_000 },
      );
      for (const input of [-20, -17, -2, -1, 0, 1, 7, 20]) {
        const original = await execFileOutput(state.config.binaryPath, [
          String(input),
        ]);
        const replica = await execFileOutput(join(directory, "replica"), [
          String(input),
        ]);
        expect(replica.stdout).toBe(original.stdout);
      }
      await expect(
        execFileOutput(join(directory, "replica"), [
          "99999999999999999999999999999",
        ]),
      ).rejects.toThrow();
      await expect(
        execFileOutput(join(directory, "replica"), ["5junk"]),
      ).rejects.toThrow();
      await expect(
        execFileOutput(join(directory, "replica"), ["21"]),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects nonlinear observations and absent static provenance", async () => {
    const { directory, state } = await fixture("x*x+1LL");
    try {
      const hooks = createAffineRecoveryHooks({
        range: { min: -10, max: 10 },
        sourcePath: "replica.c",
      });
      try {
        await hooks.reconstruct!(state, new AbortController().signal);
        throw new Error("Unexpected accepted nonlinear hypothesis");
      } catch (error) {
        expect(error).toBeInstanceOf(AffineRecoveryFailure);
        expect((error as AffineRecoveryFailure).evidence).toHaveLength(5);
        expect((error as Error).message).toContain("rejects");
      }
      state.evidence = [];
      await expect(
        hooks.reconstruct!(state, new AbortController().signal),
      ).rejects.toThrow("static");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects unsupported range and arithmetic overflow", async () => {
    expect(() =>
      createAffineRecoveryHooks({
        range: { min: 0, max: 10 },
        sourcePath: "x.c",
      }),
    ).toThrow("range");
    const { directory, state } = await fixture("x*1000000000000000LL");
    try {
      const hooks = createAffineRecoveryHooks({
        range: { min: -10, max: 10 },
        sourcePath: "replica.c",
      });
      await expect(
        hooks.reconstruct!(state, new AbortController().signal),
      ).rejects.toThrow("safe integer");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
