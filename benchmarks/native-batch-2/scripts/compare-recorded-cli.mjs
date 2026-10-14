/** Compare retained real original bytes with freshly executed native candidates.
 * Original compatibility observations remain distinct from native Windows evidence.
 */
import {
  readFile,
  mkdir,
  writeFile,
  readdir,
  lstat,
  readlink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, relative, sep, join } from "node:path";
import { runOwnedCommand } from "../../../dist/process/OwnedCommand.js";
import { createEvidence } from "../../../dist/domain/evidence.js";

const root = resolve(import.meta.dirname, "..");
const name = process.argv[2];
const executable = resolve(process.argv[3]);
const definitions = JSON.parse(
  await readFile(
    resolve(root, "tests/runtime-fixtures", name + "-probes.json"),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await readFile(
    resolve(root, "manifests", name + "-acquisition.json"),
    "utf8",
  ),
);
const original = manifest.executables[0];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const directorySha = async (root) => {
  const entries = [];
  const visit = async (directory) => {
    for (const name of await readdir(directory)) {
      const path = join(directory, name),
        info = await lstat(path),
        rel = relative(root, path).split(sep).join("/");
      if (info.isSymbolicLink())
        entries.push({
          rel,
          kind: "L",
          payload: Buffer.from(await readlink(path), "utf8"),
        });
      else if (info.isDirectory()) {
        entries.push({ rel, kind: "D", payload: Buffer.alloc(0) });
        await visit(path);
      } else if (info.isFile())
        entries.push({ rel, kind: "F", payload: await readFile(path) });
      else throw new Error(`Unsupported fixture entry: ${path}`);
    }
  };
  await visit(root);
  entries.sort((a, b) =>
    Buffer.compare(Buffer.from(a.rel), Buffer.from(b.rel)),
  );
  const h = createHash("sha256");
  for (const entry of entries) {
    const rel = Buffer.from(entry.rel, "utf8");
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(entry.payload.length));
    const relSize = Buffer.alloc(4);
    relSize.writeUInt32BE(rel.length);
    h.update(relSize)
      .update(rel)
      .update(entry.kind, "ascii")
      .update(size)
      .update(entry.payload);
  }
  return h.digest("hex");
};
const sourceName = {
  fd: "fdmac.cpp",
  bat: "batmac.cpp",
  ripgrep: "rea-rg.cpp",
}[name];
const candidateSourceSha256 = sourceName
  ? sha(await readFile(resolve(root, "reconstructed", name, sourceName)))
  : null;
const candidateHash = sha(await readFile(executable));
const originalHash = sha(await readFile(resolve(root, original.path)));
if (originalHash !== original.sha256)
  throw new Error("Original artifact changed");
const output = resolve(root, "reports", name);
await mkdir(output, { recursive: true });
const results = [];
for (const item of definitions) {
  const recordPath = resolve(
    root,
    "logs/runtime",
    name + "-" + item.id + ".json",
  );
  const observed = JSON.parse(await readFile(recordPath, "utf8"));
  if (
    observed.status !== "completed" ||
    observed.target_sha256 !== originalHash ||
    JSON.stringify(observed.arguments) !== JSON.stringify(item.arguments)
  )
    throw new Error("Original observation identity/scenario mismatch");
  const originalCwd = observed.cwd;
  const currentFixture = resolve(root, "tests/runtime-fixtures/tree");
  const cwdTail = originalCwd
    .replaceAll("\\", "/")
    .split("/")
    .slice(-3)
    .join("/");
  const currentWorkingDirectory =
    cwdTail === "tests/runtime-fixtures/tree" ? currentFixture : originalCwd;
  const fixtureHash = await directorySha(currentWorkingDirectory);
  const stdout = await readFile(resolve(root, observed.stdout.path));
  const stderr = await readFile(resolve(root, observed.stderr.path));
  if (
    sha(stdout) !== observed.stdout.sha256 ||
    sha(stderr) !== observed.stderr.sha256
  )
    throw new Error("Original retained stream changed");
  const replicaRunId = "rea-replica-" + randomUUID().replaceAll("-", "");
  const comparisonRunId = "rea-comparison-" + randomUUID().replaceAll("-", "");
  const candidate = await runOwnedCommand(
    {
      command: executable,
      arguments: item.arguments,
      cwd: currentWorkingDirectory,
      env: { ...process.env, LC_ALL: "C" },
      runId: replicaRunId,
      expectedCommand: null,
    },
    { timeoutMs: 30000, diagnosticBytes: 1048576, acceptNonZeroExit: true },
  );
  const fixtureBound =
    typeof observed.fixture_tree_sha256 === "string" &&
    observed.fixture_tree_sha256 === fixtureHash &&
    (await directorySha(currentWorkingDirectory)) === fixtureHash &&
    (cwdTail === "tests/runtime-fixtures/tree" ||
      currentWorkingDirectory === originalCwd);
  const out = Buffer.from(candidate.stdout.text, "utf8"),
    err = Buffer.from(candidate.stderr.text, "utf8");
  const complete =
    candidate.stdout.observedBytes === out.length &&
    candidate.stderr.observedBytes === err.length &&
    candidate.signal === null;
  // Windows ripgrep prints `\\` in relative paths; macOS prints `/`. Keep raw
  // byte equality visible and add a narrowly scoped comparison that rewrites
  // only a leading `.<separator>` path prefix. This does not normalize payloads.
  const normalizeRelativePathPrefixes = (bytes) =>
    Buffer.from(
      bytes
        .toString("utf8")
        .replace(
          /^\.\\([^:\r\n]*):/gm,
          (_, path) => `./${path.replaceAll("\\", "/")}:`,
        ),
      "utf8",
    );
  const normalizedOriginal = normalizeRelativePathPrefixes(stdout),
    normalizedCandidate = normalizeRelativePathPrefixes(out);
  const dimensions = {
    stdoutBytes: stdout.equals(out),
    stderrBytes: stderr.equals(err),
    exitCode: observed.exit_code === candidate.exitCode,
  };
  if (name === "ripgrep")
    dimensions.stdoutAfterRelativePathSeparatorNormalization =
      normalizedOriginal.equals(normalizedCandidate);
  const runBound =
    typeof observed.run_id === "string" &&
    observed.run_id.length > 0 &&
    fixtureBound;
  const comparisonSatisfied =
    name === "ripgrep"
      ? dimensions.stdoutBytes ||
        dimensions.stdoutAfterRelativePathSeparatorNormalization
        ? dimensions.stderrBytes && dimensions.exitCode
        : false
      : Object.values(dimensions).every(Boolean);
  const status =
    complete && runBound
      ? comparisonSatisfied
        ? "PASS"
        : "FAIL"
      : "UNVERIFIED";
  const evidence = createEvidence(
    {
      path: resolve(root, original.path),
      sha256: originalHash,
      format: "pe",
      architecture: original.architecture,
    },
    {
      id: "rea-engine-native-cli-benchmark",
      name: "REA Engine recorded CLI byte comparison",
      version: "1",
    },
    {
      operation: "compare_recorded_native_cli_bytes",
      confidence: "observed",
      parameters: {
        case: item.id,
        original_record_sha256: sha(await readFile(recordPath)),
        candidate_sha256: candidateHash,
        candidate_source_sha256: candidateSourceSha256,
        original_run_id: observed.run_id ?? null,
        replica_run_id: replicaRunId,
        comparison_run_id: comparisonRunId,
        fixture_tree_sha256: fixtureHash,
        fixture_bound: fixtureBound,
        working_directory: originalCwd,
        replica_working_directory: currentWorkingDirectory,
        arguments: item.arguments,
      },
      result: {
        status,
        dimensions,
        original: {
          stdoutSha256: sha(stdout),
          stderrSha256: sha(stderr),
          ...(name === "ripgrep"
            ? {
                stdoutAfterRelativePathSeparatorNormalizationSha256:
                  sha(normalizedOriginal),
              }
            : {}),
          exitCode: observed.exit_code,
        },
        replica: {
          stdoutSha256: sha(out),
          stderrSha256: sha(err),
          ...(name === "ripgrep"
            ? {
                stdoutAfterRelativePathSeparatorNormalizationSha256:
                  sha(normalizedCandidate),
              }
            : {}),
          exitCode: candidate.exitCode,
          stdout: candidate.stdout.text,
          stderr: candidate.stderr.text,
        },
      },
      limitations: [
        "Original is a retained CrossOver compatibility observation, not actual Windows OS verification.",
        "Only the declared stdout/stderr/outcome cases are compared. Source/runtime algorithms, tty modes and full program equivalence remain unverified.",
        ...(!runBound
          ? [
              "Original capture lacks a run ID or its fixture tree changed after capture; matching bytes cannot be promoted to a run-bound PASS.",
            ]
          : []),
        "Candidate diagnostic capture is exact for these valid UTF-8 cases; arbitrary invalid UTF-8 output is unsupported.",
        "Original observation did not bind a full filesystem snapshot; fixture ownership/unchanged contents are a stated assumption.",
      ],
    },
  );
  await writeFile(
    resolve(output, "case-" + item.id + ".json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  results.push({
    case: item.id,
    status,
    dimensions,
    evidenceId: evidence.evidence_id,
    file: "case-" + item.id + ".json",
    originalRunId: observed.run_id ?? null,
    replicaRunId,
    comparisonRunId,
    fixtureBound,
  });
}
if (sha(await readFile(executable)) !== candidateHash)
  throw new Error("Candidate changed during comparison");
const report = {
  target: name,
  originalSha256: originalHash,
  candidateSha256: candidateHash,
  candidateSourceSha256,
  candidate: executable,
  os: process.platform,
  architecture: process.arch,
  comparison:
    name === "ripgrep"
      ? "Raw stdout/stderr bytes and exit codes, plus a separately reported normalization of only the leading relative-path separator (`.\\` to `./`) in stdout."
      : "Raw stdout/stderr bytes and exit codes; no normalization.",
  results,
  passed: results.filter((r) => r.status === "PASS").length,
  failed: results.filter((r) => r.status === "FAIL").length,
  unverified: results.filter((r) => r.status === "UNVERIFIED").length,
  scope:
    "Declared compatibility observations only; whole application remains PARTIAL, no whole-binary or universal-equivalence proof.",
};
await writeFile(
  resolve(output, "differential.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
