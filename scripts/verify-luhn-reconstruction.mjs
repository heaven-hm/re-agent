#!/usr/bin/env node
import { managedBenchmarkCommand as exec } from "./lib/managed-benchmark-command.mjs";
/** Real managed-binary benchmark using REA's existing analysis and capture boundaries. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const original = resolve(
  process.argv[2] ?? "output/autonomy/windows-software/original/luhn.dll",
);
const output = resolve(process.argv[3] ?? `output/autonomy/luhn-${Date.now()}`);
await mkdir(output, { recursive: true });
const sha = (b) => createHash("sha256").update(b).digest("hex");
const originalHash = sha(await readFile(original));
const command = (cmd, args) =>
  exec(cmd, args, {
    cwd: root,
    timeoutMs: 120000,
    outputBytes: 32 * 1024 * 1024,
  });
const cli = async (args) => {
  const r = await command(process.execPath, [
    join(root, "scripts/rea.mjs"),
    ...args,
    "--json",
  ]);
  const value = JSON.parse(r.stdout);
  assert.ok(!value.error, JSON.stringify(value));
  return value;
};
const save = async (name, value) =>
  writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
const members = await cli(["inspect-managed-members", original]);
assert.ok(
  members.normalized_result.methods.some((m) => m.name === "CalculateLuhn"),
);
await save("managed-members.json", members);
await save(
  "managed-artifact.json",
  await cli(["inspect-managed-artifact", original]),
);
await copyFile(
  join(root, "scripts/benchmarks/LuhnReplica.cs"),
  join(output, "LuhnReplica.cs"),
);
await writeFile(
  join(output, "Replica.csproj"),
  '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable></PropertyGroup></Project>',
);
const build = await command("dotnet", [
  "build",
  join(output, "Replica.csproj"),
  "-c",
  "Release",
  "--nologo",
  "--disable-build-servers",
]);
await writeFile(join(output, "build.txt"), build.stdout + build.stderr);
const replica = join(output, "bin/Release/net10.0/Replica.dll");
const dotnet = (await command("/usr/bin/which", ["dotnet"])).stdout.trim();
const lines = [
  "0",
  "1",
  "9",
  "10",
  "99",
  "123",
  "7992739871",
  "000000000",
  "12345678901234567890",
  "1-2 3",
  "abc",
  "é12",
  "١٢٣",
  "１2３",
  "😀12",
];
for (let i = 0; i < 100; i++) lines.push(String((i * 7919) % 100000));
const suites = [
  { id: "normal", args: [], input: lines.join("\n") + "\n\n" },
  { id: "counted", args: ["/PG"], input: lines.join("\n") + "\n\n" },
  { id: "case-insensitive", args: ["/pg", "ignored"], input: "123\n\n" },
  { id: "usage", args: ["invalid"], input: null },
  { id: "blank-termination", args: [], input: "\n123\n" },
];
const results = [];
for (const suite of suites) {
  const captures = [];
  for (const [side, dll] of [
    ["original", original],
    ["replica", replica],
  ]) {
    const scenario = {
      executable: dotnet,
      arguments: [dll, ...suite.args],
      working_directory: output,
      events:
        suite.input === null
          ? []
          : [{ type: "input", at_ms: 500, data: suite.input }],
      timeout_ms: 15000,
      idle_timeout_ms: 15000,
      normalization: {
        paths: false,
        pids: false,
        ports: false,
        time_bucket_ms: 15000,
      },
    };
    const path = join(output, `${suite.id}-${side}-scenario.json`);
    await writeFile(path, JSON.stringify(scenario));
    const e = await cli(["capture-process", path]);
    await save(`${suite.id}-${side}-capture.json`, e);
    const c = e.normalized_result;
    assert.equal(c.exit.code, 0);
    assert.equal(c.exit.reason, "exited");
    assert.equal(c.truncated, false);
    assert.equal(c.settlement.state, "quiesced");
    const raw = Buffer.from(c.frames.map((f) => f.data).join(""), "utf8");
    await writeFile(join(output, `${suite.id}-${side}-terminal.bin`), raw);
    captures.push({ e, c, raw });
  }
  const [a, b] = captures;
  const equal = a.raw.equals(b.raw);
  results.push({
    id: suite.id,
    terminalBytesEqual: equal,
    originalTerminalSha256: sha(a.raw),
    replicaTerminalSha256: sha(b.raw),
    originalEvidenceId: a.e.evidence_id,
    replicaEvidenceId: b.e.evidence_id,
    exitCodes: [a.c.exit.code, b.c.exit.code],
  });
  await save(
    `${suite.id}-comparison.json`,
    await cli([
      "compare-process-captures",
      join(output, `${suite.id}-original-capture.json`),
      join(output, `${suite.id}-replica-capture.json`),
    ]),
  );
}
assert.equal(
  sha(await readFile(original)),
  originalHash,
  "Original did not change",
);
const report = {
  status: results.every((r) => r.terminalBytesEqual)
    ? "suite-passed"
    : "mismatches",
  target: "LTRData published luhn .NET utility",
  originalSha256: originalHash,
  replicaSha256: sha(await readFile(replica)),
  staticEvidenceId: members.evidence_id,
  declaredSuites: suites.length,
  numericAndUnicodeLines: lines.length * 2,
  results,
  executableByteIdentity: false,
  limitations: [
    "Exact captured UTF-8 terminal bytes for the declared suites only; no universal equivalence claim.",
    "Original published managed PE assembly runs on installed macOS .NET 10; Windows OS execution is not established.",
    "Launch runtime identity is separately recorded from the analyzed target DLL identity.",
    "No original source was downloaded; replica was derived from binary CIL and runtime observations.",
    "The original utility is not redistributed by this script.",
  ],
};
await save("report.json", report);
console.log(JSON.stringify(report, null, 2));
assert.equal(report.status, "suite-passed");
