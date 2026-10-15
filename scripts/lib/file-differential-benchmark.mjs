/** Bounded file-conversion benchmark using REA's shared owned-process boundary.
 * Work directories are retained evidence, not an OS sandbox. Commands must be
 * authorized and isolated by the caller's selected backend where required.
 */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { runOwnedCommand } from "../../dist/process/OwnedCommand.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dimension = (equal) => ({ status: equal ? "PASS" : "FAIL" });
const positive = (value, name) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new TypeError(`${name} must be a positive safe integer`);
  return value;
};
const vector = (value, name) => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((part) => typeof part !== "string" || part.includes("\0")) ||
    value[0].length === 0
  )
    throw new TypeError(`${name} must be a nonempty command vector`);
  return value;
};
const safeName = (name) => {
  if (
    typeof name !== "string" ||
    !name ||
    basename(name) !== name ||
    name === "." ||
    name === ".." ||
    /[\\/\0]/u.test(name)
  )
    throw new TypeError("outputName must be a single file name");
  return name;
};
const failureProjection = (cause) => ({
  name: cause?.name ?? "Error",
  reason: cause?.reason ?? cause?.code ?? "exception",
  message: cause?.message ?? String(cause),
  ...(typeof cause?.cleanupFailure === "string"
    ? { cleanupFailure: cause.cleanupFailure }
    : {}),
  ...(cause?.cleanupOwner ? { unresolvedCleanupOwner: true } : {}),
  ...(Array.isArray(cause?.resources)
    ? {
        resources: cause.resources.filter((value) => typeof value === "string"),
      }
    : {}),
});
async function atomicReport(path, report) {
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temporary, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function boundedFile(path, limit) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > limit)
      throw new Error(`Not a regular bounded file: ${path}`);
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    if (
      offset !== bytes.length ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error(`File changed during observation: ${path}`);
    return bytes;
  } finally {
    await handle.close();
  }
}

/** Command arguments support {input}, {output}, {workdir}; no shell is used.
 * Cases are serial and both sides receive independent copies of the same input.
 * Missing output, timeouts, cancelled runs and truncated diagnostics never PASS.
 * reportPath is retained on exceptions; onProgress receives a detached journal
 * after each atomic write. Reports are supervision evidence, not a canonical
 * ProcessCapture. Atomic rename prevents partial JSON, not power-loss durability.
 */
export async function runFileDifferentialBenchmark(options) {
  const original = vector(options.originalCommand, "originalCommand");
  const replica = vector(options.replicaCommand, "replicaCommand");
  const timeoutMs = positive(options.timeoutMs ?? 15_000, "timeoutMs");
  const maxFileBytes = positive(
    options.maxFileBytes ?? 16 * 1024 * 1024,
    "maxFileBytes",
  );
  const diagnosticBytes = positive(
    options.diagnosticBytes ?? 1024 * 1024,
    "diagnosticBytes",
  );
  if (
    options.onProgress !== undefined &&
    typeof options.onProgress !== "function"
  )
    throw new TypeError("onProgress must be a function");
  if (!Array.isArray(options.cases) || options.cases.length === 0)
    throw new TypeError("A nonempty declared case suite is required");
  const seen = new Set();
  for (const item of options.cases) {
    if (
      typeof item.id !== "string" ||
      !/^[a-zA-Z0-9_-]+$/u.test(item.id) ||
      seen.has(item.id)
    )
      throw new TypeError("Case IDs must be unique path-safe identifiers");
    seen.add(item.id);
    safeName(item.outputName ?? "output.bin");
    if (
      item.arguments !== undefined &&
      (!Array.isArray(item.arguments) ||
        item.arguments.some(
          (part) => typeof part !== "string" || part.includes("\0"),
        ))
    )
      throw new TypeError("Case arguments must be strings without NUL");
  }
  options.signal?.throwIfAborted();
  const directory = resolve(options.outputDirectory);
  await mkdir(directory, { recursive: true });
  const runDirectory = await mkdtemp(join(directory, "file-diff-"));
  const report = {
    schema: "rea.file-differential-benchmark.v1",
    status: "UNVERIFIED",
    scope:
      "Exact output-file bytes, retained UTF-8 diagnostic text, and exit status on the declared cases only.",
    universalEquivalence: false,
    platform: { os: process.platform, architecture: process.arch },
    limits: { timeoutMs, maxFileBytes, diagnosticBytes },
    runDirectory,
    reportPath: join(runDirectory, "report.json"),
    phase: "running",
    cases: options.cases.map((item) => ({
      id: item.id,
      status: "UNVERIFIED",
      phase: "pending",
    })),
  };
  const persist = async (notify = true) => {
    await atomicReport(report.reportPath, report);
    if (notify && options.onProgress)
      await options.onProgress(structuredClone(report));
  };
  try {
    await persist();
    for (const item of options.cases) {
      options.signal?.throwIfAborted();
      const record = report.cases.find((candidate) => candidate.id === item.id);
      record.phase = "reading-input";
      await persist();
      const input = await boundedFile(resolve(item.inputPath), maxFileBytes);
      record.input = {
        path: resolve(item.inputPath),
        bytes: input.length,
        sha256: hash(input),
      };
      await persist();
      const runSide = async (side, command, environment) => {
        const cwd = join(runDirectory, `${item.id}-${side}`);
        await mkdir(cwd);
        const inputPath = join(
          cwd,
          "input" +
            (basename(item.inputPath).match(/\.[^.]+$/u)?.[0] ?? ".bin"),
        );
        const outputPath = join(cwd, item.outputName ?? "output.bin");
        if (inputPath === outputPath)
          throw new TypeError("Output must differ from staged input");
        await writeFile(inputPath, input, { flag: "wx", mode: 0o600 });
        const expand = (arg) =>
          arg
            .split("{input}")
            .join(inputPath)
            .split("{output}")
            .join(outputPath)
            .split("{workdir}")
            .join(cwd);
        const expanded = [...command, ...(item.arguments ?? [])].map(expand);
        const observation = {
          command: expanded,
          workDirectory: cwd,
          status: "UNVERIFIED",
        };
        record[side] = observation;
        record.phase = `${side}-running`;
        await persist();
        options.signal?.throwIfAborted();
        try {
          const captured = await runOwnedCommand(
            {
              command: expanded[0],
              arguments: expanded.slice(1),
              cwd,
              env: environment ?? process.env,
              runId: "rea-file-benchmark-" + randomUUID(),
              expectedCommand: null,
            },
            { timeoutMs, diagnosticBytes, acceptNonZeroExit: true },
            { signal: options.signal },
          );
          Object.assign(observation, {
            status: "OBSERVED",
            exitCode: captured.exitCode,
            signal: captured.signal,
            stdout: captured.stdout,
            stderr: captured.stderr,
          });
        } catch (cause) {
          // Cleanup failures are exceptional: preserve the owner's error/resources.
          if (cause.cleanupFailure || cause.cleanupOwner) {
            observation.failure = failureProjection(cause);
            if (cause.snapshot) observation.snapshot = cause.snapshot;
            throw cause;
          }
          Object.assign(observation, {
            status: "UNVERIFIED",
            reason: cause.reason ?? "launch",
            message: cause.message,
            snapshot: cause.snapshot ?? null,
          });
        }
        record.phase = `${side}-captured`;
        await persist();
        options.signal?.throwIfAborted();
        let output;
        try {
          output = await boundedFile(outputPath, maxFileBytes);
          observation.output = {
            path: outputPath,
            bytes: output.length,
            sha256: hash(output),
          };
        } catch (cause) {
          observation.output = {
            path: outputPath,
            status: "UNVERIFIED",
            reason: cause.code ?? cause.message,
          };
        }
        record.phase = `${side}-complete`;
        await persist();
        return { observation, output };
      };
      const left = await runSide(
        "original",
        original,
        options.originalEnvironment,
      );
      options.signal?.throwIfAborted();
      const right = await runSide(
        "replica",
        replica,
        options.replicaEnvironment,
      );
      const complete =
        left.observation.status === "OBSERVED" &&
        right.observation.status === "OBSERVED";
      const compare = (equal) =>
        complete ? dimension(equal) : { status: "UNVERIFIED" };
      const dimensions = {
        outputFileBytes:
          complete && left.output && right.output
            ? dimension(left.output.equals(right.output))
            : { status: "UNVERIFIED" },
        stdoutDiagnosticText: compare(
          left.observation.stdout?.text === right.observation.stdout?.text,
        ),
        stderrDiagnosticText: compare(
          left.observation.stderr?.text === right.observation.stderr?.text,
        ),
        exitStatus: compare(
          left.observation.exitCode === right.observation.exitCode &&
            left.observation.signal === null &&
            right.observation.signal === null,
        ),
      };
      const statuses = Object.values(dimensions).map((value) => value.status);
      Object.assign(record, {
        dimensions,
        phase: "complete",
        status: statuses.includes("FAIL")
          ? "FAIL"
          : statuses.every((status) => status === "PASS")
            ? "PASS"
            : "UNVERIFIED",
      });
      await persist();
    }
    options.signal?.throwIfAborted();
    report.status = report.cases.some((item) => item.status === "FAIL")
      ? "FAIL"
      : report.cases.every((item) => item.status === "PASS")
        ? "PASS"
        : "UNVERIFIED";
    report.phase = "complete";
    await persist();
    return report;
  } catch (cause) {
    report.status = "UNVERIFIED";
    report.phase = options.signal?.aborted ? "cancelled" : "interrupted";
    report.failure = failureProjection(cause);
    try {
      await persist(false);
    } catch (journalCause) {
      // A report write failure must not replace unresolved cleanup ownership.
      if (cause && typeof cause === "object" && Object.isExtensible(cause))
        cause.journalFailure = failureProjection(journalCause);
    }
    if (cause && typeof cause === "object" && Object.isExtensible(cause))
      cause.reportPath = report.reportPath;
    throw cause;
  }
}
