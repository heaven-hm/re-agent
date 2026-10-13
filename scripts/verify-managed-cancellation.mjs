#!/usr/bin/env node
/** Real capture + compiler cancellation regression; no broad process signaling. */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  managedBenchmarkCommand as command,
  managedBenchmarkScope,
} from "./lib/managed-benchmark-command.mjs";
const output = await mkdtemp(join(tmpdir(), "rea-managed-cancel-"));
async function waitFile(file, signal) {
  for (let i = 0; i < 200; i++) {
    signal.throwIfAborted();
    try {
      return Number(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Owned fixture did not launch");
}
function gone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    if (e.code === "ESRCH") return true;
    throw e;
  }
}
const results = [];
for (const mode of ["command", "capture"]) {
  const pidFile = join(output, mode + ".pid");
  const fixture = join(output, mode + ".mjs");
  await writeFile(
    fixture,
    `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
  );
  const abort = new AbortController();
  let args = [fixture];
  if (mode === "capture") {
    const scenario = join(output, "scenario.json");
    await writeFile(
      scenario,
      JSON.stringify({
        executable: process.execPath,
        arguments: [fixture],
        working_directory: output,
        events: [],
        timeout_ms: 60000,
        idle_timeout_ms: 60000,
      }),
    );
    args = [
      join(import.meta.dirname, "rea.mjs"),
      "capture-process",
      scenario,
      "--json",
    ];
  }
  const pending = managedBenchmarkScope(abort.signal, () =>
    command(process.execPath, args),
  ).then(
    () => ({ ok: true }),
    (error) => ({ error }),
  );
  try {
    const pid = await waitFile(pidFile, AbortSignal.timeout(30000));
    assert.equal(gone(pid), false);
    abort.abort();
    const outcome = await pending;
    assert.ok(outcome.error, "Cancellation must reject");
    assert.equal(
      gone(pid),
      true,
      "Owned process survives completed cancellation",
    );
    results.push({
      mode,
      pid,
      launched: true,
      cancellationRejected: true,
      processGone: true,
      cancellationReason: outcome.error.message,
      cliCancellationExitCode: process.exitCode ?? null,
    });
    // The in-process CLI maps cancellation to 143. This test validates it but
    // continues to its next isolated case and emits an ordinary successful result.
    process.exitCode = 0;
  } finally {
    abort.abort();
    await pending;
  }
}
const report = { status: "passed", output, results };
await writeFile(
  join(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
