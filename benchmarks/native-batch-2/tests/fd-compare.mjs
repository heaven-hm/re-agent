/** Compare retained actual original bytes with actual native probe results.
 * Search-result path normalization is an explicitly separate dimension.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
const base = resolve("benchmarks/native-batch-2");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const replica = JSON.parse(
  await readFile(base + "/reports/fd/replica-probes.json", "utf8"),
);
const relocation = JSON.parse(
  await readFile(base + "/reports/fd/original-relocation.json", "utf8"),
);
const pathCases = new Set([
  "all",
  "regex",
  "glob",
  "extension",
  "hidden",
  "no-ignore",
  "files",
  "directories",
  "symlinks",
  "depth",
  "unicode",
]);
const normalize = (text) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replaceAll("\\", "/").replace(/^\.\//u, ""))
    .sort();
const results = [];
for (const actual of replica.results) {
  const binding = relocation.cases[actual.id];
  if (!binding)
    throw new Error(`No archived original capture is bound for ${actual.id}`);
  const originalBytes = await readFile(`${base}/${binding.recordPath}`);
  if (hash(originalBytes) !== binding.recordSha256)
    throw new Error(
      `Archived original record commitment mismatch for ${actual.id}`,
    );
  const original = JSON.parse(originalBytes);
  if (
    original.run_id !== binding.runId ||
    original.target_sha256 !== relocation.targetSha256 ||
    original.fixture_tree_sha256 !== replica.fixtureTreeSha256 ||
    JSON.stringify(original.arguments) !== JSON.stringify(actual.arguments) ||
    original.cwd !== relocation.originalWorkingDirectory ||
    replica.workingDirectory !== relocation.replicaWorkingDirectory
  )
    throw new Error(
      `Original/replica relocation binding mismatch for ${actual.id}`,
    );
  const stdout = await readFile(resolve(base, original.stdout.path));
  const stderr = await readFile(resolve(base, original.stderr.path));
  if (
    hash(stdout) !== original.stdout.sha256 ||
    hash(stderr) !== original.stderr.sha256
  )
    throw new Error(
      `Original ${actual.id} stream does not match its capture commitment`,
    );
  const observed =
    actual.status === "OBSERVED" && original.status === "completed";
  const compare = (equal) =>
    observed ? (equal ? "PASS" : "FAIL") : "UNVERIFIED";
  const dimensions = {
    stdoutBytes: compare(stdout.equals(Buffer.from(actual.stdout?.text ?? ""))),
    stderrBytes: compare(stderr.equals(Buffer.from(actual.stderr?.text ?? ""))),
    exitStatus: compare(original.exit_code === actual.exitCode),
  };
  let normalizedSearch = "NOT_APPLICABLE",
    platformReason;
  if (pathCases.has(actual.id)) {
    normalizedSearch = compare(
      JSON.stringify(normalize(stdout.toString("utf8"))) ===
        JSON.stringify(normalize(actual.stdout?.text ?? "")),
    );
    if (["files", "symlinks"].includes(actual.id)) {
      platformReason =
        "Wine maps the fixture symlink as a regular file; native macOS preserves it as a symlink. Raw and normalized mismatches remain visible.";
    }
  }
  results.push({
    id: actual.id,
    arguments: original.arguments,
    dimensions,
    normalizedSearch,
    originalRecordPath: binding.recordPath,
    originalRecordSha256: binding.recordSha256,
    fixtureTreeSha256: relocation.fixtureTreeSha256,
    originalRunId: original.run_id,
    replicaRunId: actual.runId,
    comparisonRunId: "rea-comparison-" + randomUUID().replaceAll("-", ""),
    ...(platformReason ? { platformReason } : {}),
    original: {
      targetSha256: original.target_sha256,
      stdoutSha256: hash(stdout),
      stderrSha256: hash(stderr),
      exitCode: original.exit_code,
    },
    replica: {
      stdoutDiagnosticSha256: hash(Buffer.from(actual.stdout?.text ?? "")),
      stderrDiagnosticSha256: hash(Buffer.from(actual.stderr?.text ?? "")),
      exitCode: actual.exitCode,
    },
    rawStatus: Object.values(dimensions).every((value) => value === "PASS")
      ? "PASS"
      : observed
        ? "FAIL"
        : "UNVERIFIED",
  });
}
const report = {
  schema: "rea.fd-candidate-comparison.v1",
  status: "PARTIAL",
  universalEquivalence: false,
  scope:
    "15 declared fd probes. Replica diagnostics are retained UTF-8 text; original streams are raw files. Paths and ordering are normalized only in the separately labelled search dimension.",
  sourceSha256: hash(await readFile(base + "/reconstructed/fd/fdmac.cpp")),
  replicaSha256: replica.executableSha256,
  counts: {
    declared: results.length,
    rawPass: results.filter((item) => item.rawStatus === "PASS").length,
    normalizedSearchPass: results.filter(
      (item) => item.normalizedSearch === "PASS",
    ).length,
  },
  results,
};
await writeFile(
  base + "/reports/fd/comparison.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report.counts));
