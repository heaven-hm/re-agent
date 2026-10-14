/** One serial binary-only REA/Ghidra investigation with host-resource guards.
 * RSS monitoring is observational; it is not an OS-enforced memory sandbox.
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, statfs, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const exec = promisify(execFile);
const target = resolve(
  "benchmarks/native-batch-2/originals/fd/extracted/fd-v10.5.0-x86_64-pc-windows-msvc/fd.exe",
);
const applicationMain = process.argv.includes("--application-main");
const followEntry = process.argv.includes("--follow-entry") || applicationMain;
const output = resolve(
  "benchmarks/native-batch-2/analysis/fd/" +
    (applicationMain
      ? "resilience-application"
      : followEntry
        ? "resilience-main"
        : "resilience"),
);
await mkdir(output, { recursive: true });
const limits = {
  startupMs: 240000,
  totalMs: 300000,
  javaHeap: "1G",
  familyRssBytes: 1536 * 1024 * 1024,
  freeDiskReserveBytes: 1024 * 1024 * 1024,
};
const report = {
  status: "UNVERIFIED",
  target,
  limits,
  phase: "preflight",
  startedAt: new Date().toISOString(),
  samples: [],
  completedOperations: [],
  limitations: [
    "RSS monitoring is observed, not an enforced OS memory limit.",
    "Disabled decompiler auto-analyzers change analysis coverage; function dossiers still require actual evidence.",
    "Static inventory or function pseudocode does not establish runtime behavior or reconstructed equivalence.",
  ],
};
const save = async (name, value) =>
  writeFile(`${output}/${name}.json`, JSON.stringify(value, null, 2) + "\n");
const disk = async () => {
  const fs = await statfs(output);
  return fs.bavail * fs.bsize;
};
report.preflightFreeDiskBytes = await disk();
if (report.preflightFreeDiskBytes < limits.freeDiskReserveBytes) {
  report.reason = "insufficient_disk_reserve";
  await save("summary", report);
  process.exit(1);
}
const client = new Client({ name: "rea-fd-analysis-resilience", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("scripts/rea.mjs"), "mcp"],
  env: {
    PATH: process.env.PATH,
    GHIDRA_INSTALL_DIR: process.env.GHIDRA_INSTALL_DIR,
    JAVA_HOME: process.env.JAVA_HOME,
    GHIDRA_HEADLESS_MAXMEM: limits.javaHeap,
    REA_GHIDRA_STARTUP_TIMEOUT_MS: String(limits.startupMs),
    REA_GHIDRA_DISABLED_ANALYZERS:
      "Decompiler Switch Analysis,Decompiler Parameter ID",
    REA_LOG_LEVEL: "silent",
  },
  stderr: "pipe",
});
let monitorBusy = false,
  stopping = false;
async function stop(reason) {
  if (stopping) return;
  stopping = true;
  report.reason = reason;
  report.phase = "resource_stop";
  await save("summary", report);
  await client.close();
}
async function monitor() {
  if (monitorBusy || stopping) return;
  monitorBusy = true;
  try {
    const { stdout } = await exec("/bin/ps", ["-axo", "pid=,ppid=,rss="], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const processes = stdout
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/u).map(Number));
    const pids = new Set([process.pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [pid, parent] of processes)
        if (pids.has(parent) && !pids.has(pid)) {
          pids.add(pid);
          changed = true;
        }
    }
    const familyRssBytes = processes
      .filter(([pid]) => pids.has(pid))
      .reduce((sum, [, , rss]) => sum + rss * 1024, 0);
    const freeDiskBytes = await disk();
    report.samples.push({
      at: new Date().toISOString(),
      familyRssBytes,
      freeDiskBytes,
    });
    if (familyRssBytes > limits.familyRssBytes)
      await stop("family_rss_limit_observed");
    else if (freeDiskBytes < limits.freeDiskReserveBytes)
      await stop("disk_reserve_breached");
    else await save("summary", report);
  } catch (cause) {
    report.monitorFailure = { message: cause.message };
    await stop("resource_monitor_unavailable");
  } finally {
    monitorBusy = false;
  }
}
const timer = setInterval(() => {
  void monitor();
}, 3000);
const deadline = setTimeout(() => {
  void stop("total_deadline");
}, limits.totalMs);
async function call(name, args, label) {
  if (stopping) throw new Error(report.reason);
  report.phase = label;
  await save("summary", report);
  const result = await client.callTool(
    { name, arguments: args },
    { timeout: limits.totalMs },
  );
  const value = result.structuredContent ?? result;
  await save(label, value);
  if (result.isError)
    throw new Error(`${label}: ${JSON.stringify(value).slice(0, 700)}`);
  report.completedOperations.push(label);
  await save("summary", report);
  return value;
}
try {
  await client.connect(transport);
  await monitor();
  await call("open_binary", { path: target, provider_id: "ghidra" }, "open");
  await call("binary_overview", {}, "overview");
  await call("list_procedures", {}, "procedures");
  await call("analyze_function", { procedure: "entry" }, "entry-dossier");
  if (followEntry) {
    // This selector comes from the retained entry's actual typed tail reference.
    const crt = await call(
      "analyze_function",
      { procedure: "0x14027cc20" },
      "crt-dossier",
    );
    const dossier = crt.normalized_result ?? crt.result?.normalized_result;
    const candidates = (dossier?.callees ?? [])
      .filter(
        (item) =>
          /^0x[0-9a-f]+$/u.test(item.address) &&
          BigInt(item.address) < 0x140270000n &&
          !item.classification?.external &&
          !item.classification?.thunk,
      )
      .slice(0, 4);
    report.applicationMainCandidates = candidates.map((item) => ({
      address: item.address,
      name: item.name,
      status: "INFERRED_CANDIDATE",
    }));
    for (const candidate of candidates)
      await call(
        "analyze_function",
        { procedure: candidate.address },
        `startup-candidate-${candidate.address}`,
      );
    if (applicationMain) {
      // Both locations are observed in the earlier startup candidate dossier:
      // startup passes the second procedure's address to the first procedure.
      await call(
        "analyze_function",
        { procedure: "0x1400165d0" },
        "rust-start-wrapper-dossier",
      );
      await call(
        "analyze_function",
        { procedure: "0x14002b5f0" },
        "application-main-candidate-dossier",
      );
    }
  }
  report.status = "PARTIAL";
  report.phase = "static_evidence_complete";
  report.reason =
    "Entry dossier and inventory only; application main identity and runtime behavior unverified";
  await call("close_binary", {}, "close");
} catch (cause) {
  report.failure = { message: cause.message };
  report.status = "UNVERIFIED";
} finally {
  clearInterval(timer);
  clearTimeout(deadline);
  await client.close();
  report.finishedAt = new Date().toISOString();
  await save("summary", report);
}
