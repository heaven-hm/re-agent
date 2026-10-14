/** Real native replica probes; this alone does not establish original equivalence. */
import { runOwnedCommand } from "../../../dist/process/OwnedCommand.js";
import { fdProbeCases, createFdFixture } from "./fd-fixture.mjs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { relative, resolve, sep } from "node:path";

async function fixtureTreeSha256(root) {
  const entries = [];
  async function visit(directory) {
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name);
      const rel = relative(root, path).split(sep).join("/");
      const stat = await lstat(path);
      if (stat.isSymbolicLink())
        entries.push([rel, "L", Buffer.from(await readlink(path))]);
      else if (stat.isFile()) entries.push([rel, "F", await readFile(path)]);
      else if (stat.isDirectory()) {
        entries.push([rel, "D", Buffer.alloc(0)]);
        await visit(path);
      }
    }
  }
  await visit(root);
  const digest = createHash("sha256");
  for (const [rel, kind, payload] of entries.sort((left, right) =>
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0,
  )) {
    const relativeBytes = Buffer.from(rel, "utf8");
    const nameLength = Buffer.alloc(4);
    nameLength.writeUInt32BE(relativeBytes.length);
    const payloadLength = Buffer.alloc(8);
    payloadLength.writeBigUInt64BE(BigInt(payload.length));
    digest
      .update(nameLength)
      .update(relativeBytes)
      .update(kind)
      .update(payloadLength)
      .update(payload);
  }
  return digest.digest("hex");
}

const base = resolve("benchmarks/native-batch-2");
const executable = resolve(
  process.argv[2] ?? base + "/reconstructed/fd/build/fdmac",
);
const directory = resolve("benchmarks/native-batch-2/reports/fd");
await mkdir(directory, { recursive: true });
const cwd = await createFdFixture(
  "benchmarks/native-batch-2/tests/fd-fixture-tree",
);
const fixtureHash = await fixtureTreeSha256(cwd);
const results = [];
for (const item of fdProbeCases) {
  try {
    const runId = "rea-replica-" + randomUUID().replaceAll("-", "");
    const result = await runOwnedCommand(
      {
        command: executable,
        arguments: item.arguments,
        cwd,
        env: process.env,
        runId,
        expectedCommand: null,
      },
      {
        timeoutMs: 15000,
        diagnosticBytes: 1024 * 1024,
        acceptNonZeroExit: true,
      },
    );
    results.push({
      id: item.id,
      arguments: item.arguments,
      status: "OBSERVED",
      runId,
      fixtureTreeSha256: fixtureHash,
      ...result,
    });
  } catch (cause) {
    if (cause.cleanupOwner) throw cause;
    results.push({
      id: item.id,
      status: "UNVERIFIED",
      reason: cause.reason,
      message: cause.message,
      snapshot: cause.snapshot,
    });
  }
}
const report = {
  schema: "rea.native-replica-probes.v1",
  executable,
  executableSha256: createHash("sha256")
    .update(await (await import("node:fs/promises")).readFile(executable))
    .digest("hex"),
  os: process.platform,
  architecture: process.arch,
  workingDirectory: cwd,
  fixtureTreeSha256: fixtureHash,
  scope:
    "Native replica execution observations only. No original-equivalence claim.",
  results,
};
await writeFile(
  directory + "/replica-probes.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    results.map(({ id, status, exitCode }) => ({ id, status, exitCode })),
  ),
);
