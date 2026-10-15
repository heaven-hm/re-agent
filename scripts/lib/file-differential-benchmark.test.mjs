import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runFileDifferentialBenchmark } from "./file-differential-benchmark.mjs";

const fixture = `
const fs = require('node:fs');
const [mode,input,output] = process.argv.slice(1);
if (mode === 'hang') setInterval(() => {},1000);
else if (mode === 'overflow') process.stdout.write('x'.repeat(10000));
else if (mode !== 'missing') {
  const bytes=fs.readFileSync(input);
  if (mode === 'different') bytes[0] ^= 255;
  fs.writeFileSync(output,bytes);
  if (mode === 'stdout') process.stdout.write('different stdout');
  if (mode === 'stderr') process.stderr.write('different stderr');
  if (mode === 'exit') process.exitCode=7;
}
`;
const command = (mode) => [
  process.execPath,
  "-e",
  fixture,
  mode,
  "{input}",
  "{output}",
];
async function scope(operation) {
  const directory = await mkdtemp(join(tmpdir(), "rea-file-diff-test-"));
  try {
    const inputPath = join(directory, "fixture.dat");
    await writeFile(inputPath, Buffer.from([0, 255, 13, 10, 128]));
    return await operation({
      outputDirectory: directory,
      originalCommand: command("copy"),
      replicaCommand: command("copy"),
      cases: [{ id: "binary", inputPath }],
      timeoutMs: 10000,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("exact binary outputs and retained report from independent fresh directories", () =>
  scope(async (options) => {
    const report = await runFileDifferentialBenchmark(options);
    assert.equal(report.status, "PASS");
    assert.equal(report.universalEquivalence, false);
    const item = report.cases[0];
    assert.notEqual(item.original.workDirectory, item.replica.workDirectory);
    assert.equal(item.original.output.sha256, item.input.sha256);
    assert.equal(item.replica.output.sha256, item.input.sha256);
    assert.deepEqual(
      JSON.parse(await readFile(report.reportPath, "utf8")),
      report,
    );
    const repeat = await runFileDifferentialBenchmark(options);
    assert.notEqual(report.runDirectory, repeat.runDirectory);
  }));

for (const [mode, dimension] of [
  ["different", "outputFileBytes"],
  ["stdout", "stdoutDiagnosticText"],
  ["stderr", "stderrDiagnosticText"],
  ["exit", "exitStatus"],
]) {
  test(`reports ${dimension} mismatch independently`, () =>
    scope(async (options) => {
      const report = await runFileDifferentialBenchmark({
        ...options,
        replicaCommand: command(mode),
      });
      assert.equal(report.status, "FAIL");
      for (const [name, value] of Object.entries(report.cases[0].dimensions))
        assert.equal(value.status, name === dimension ? "FAIL" : "PASS");
    }));
}

for (const mode of ["missing", "hang", "overflow"]) {
  test(`never passes ${mode}`, () =>
    scope(async (options) => {
      const report = await runFileDifferentialBenchmark({
        ...options,
        originalCommand: command(mode),
        replicaCommand: command(mode),
        timeoutMs: mode === "hang" ? 100 : 10000,
        diagnosticBytes: 1000,
      });
      assert.equal(report.status, "UNVERIFIED");
      assert.equal(
        report.cases[0].dimensions.outputFileBytes.status,
        "UNVERIFIED",
      );
      if (mode !== "missing") {
        assert.equal(report.cases[0].original.status, "UNVERIFIED");
        assert.equal(
          report.cases[0].original.reason,
          mode === "hang" ? "timeout" : "output-limit",
        );
      }
    }));
}

test("rejects duplicate IDs and output path traversal before target execution", () =>
  scope(async (options) => {
    await assert.rejects(
      runFileDifferentialBenchmark({
        ...options,
        cases: [options.cases[0], options.cases[0]],
      }),
      /unique/u,
    );
    await assert.rejects(
      runFileDifferentialBenchmark({
        ...options,
        cases: [{ ...options.cases[0], outputName: "../escape" }],
      }),
      /single file/u,
    );
  }));

test("pre-cancelled suite cannot run or pass", () =>
  scope(async (options) => {
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      runFileDifferentialBenchmark({ ...options, signal: abort.signal }),
      { name: "AbortError" },
    );
  }));

test("retains completed first case when second input is missing", () =>
  scope(async (options) => {
    let failure;
    try {
      await runFileDifferentialBenchmark({
        ...options,
        cases: [
          options.cases[0],
          {
            id: "absent",
            inputPath: join(options.outputDirectory, "missing.dat"),
          },
        ],
      });
    } catch (cause) {
      failure = cause;
    }
    assert.equal(failure?.code, "ENOENT");
    const report = JSON.parse(await readFile(failure.reportPath, "utf8"));
    assert.equal(report.status, "UNVERIFIED");
    assert.equal(report.phase, "interrupted");
    assert.equal(report.cases[0].status, "PASS");
    assert.equal(
      report.cases[0].original.output.sha256,
      report.cases[0].input.sha256,
    );
    assert.equal(report.cases[1].phase, "reading-input");
    assert.equal(report.failure.reason, "ENOENT");
  }));

test("cancellation between cases preserves earlier real observations", () =>
  scope(async (options) => {
    const abort = new AbortController();
    let failure;
    try {
      await runFileDifferentialBenchmark({
        ...options,
        signal: abort.signal,
        cases: [options.cases[0], { ...options.cases[0], id: "second" }],
        onProgress(report) {
          if (report.cases[0].phase === "complete") abort.abort();
        },
      });
    } catch (cause) {
      failure = cause;
    }
    assert.equal(failure?.name, "AbortError");
    const report = JSON.parse(await readFile(failure.reportPath, "utf8"));
    assert.equal(report.status, "UNVERIFIED");
    assert.equal(report.phase, "cancelled");
    assert.equal(report.cases[0].status, "PASS");
    assert.equal(report.cases[1].phase, "pending");
    assert.equal(report.cases[1].original, undefined);
  }));

test("failure projection preserves original owner error and prior evidence (simulated fault)", () =>
  scope(async (options) => {
    // This tests exceptional journal propagation, not real cleanup failure.
    const fault = new Error("simulated unresolved cleanup");
    fault.cleanupOwner = { simulated: true };
    fault.cleanupFailure = "simulated failure";
    fault.resources = ["simulated-owned-resource"];
    let failure;
    try {
      await runFileDifferentialBenchmark({
        ...options,
        cases: [options.cases[0], { ...options.cases[0], id: "second" }],
        onProgress(report) {
          if (report.cases[1].phase === "original-captured") throw fault;
        },
      });
    } catch (cause) {
      failure = cause;
    }
    assert.equal(failure, fault);
    assert.equal(failure.cleanupOwner.simulated, true);
    const report = JSON.parse(await readFile(failure.reportPath, "utf8"));
    assert.equal(report.status, "UNVERIFIED");
    assert.equal(report.cases[0].status, "PASS");
    assert.equal(report.cases[1].original.status, "OBSERVED");
    assert.equal(report.failure.unresolvedCleanupOwner, true);
    assert.equal(report.failure.cleanupFailure, "simulated failure");
    assert.deepEqual(report.failure.resources, ["simulated-owned-resource"]);
  }));
