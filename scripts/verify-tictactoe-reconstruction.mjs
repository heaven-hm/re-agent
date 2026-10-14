#!/usr/bin/env node
import { managedBenchmarkCommand as exec } from "./lib/managed-benchmark-command.mjs";
/** Execute original/rebuilt managed game code through REA's process capture. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export async function verifyTicTacToe(
  argv = process.argv,
  envBase = process.env,
) {
  const root = resolve(import.meta.dirname, "..");
  const original = resolve(
    argv[2] ?? "benchmarks/tictactoe/original/TicTacToe.exe",
  );
  const replica = resolve(
    argv[3] ?? "benchmarks/tictactoe/reconstructed/Replica.exe",
  );
  const output = resolve(argv[4] ?? `output/autonomy/tictactoe-${Date.now()}`);
  assert.ok(
    envBase.DISPLAY,
    "Set DISPLAY to a local benchmark-owned X11 server",
  );
  const mono = envBase.REA_MONO_COMMAND ?? "/opt/homebrew/opt/mono/bin/mono";
  const gdiplus = resolve(
    envBase.REA_GDIPLUS_DIRECTORY ?? "third_party/libgdiplus",
  );
  await mkdir(output, { recursive: true });
  const h = (b) => createHash("sha256").update(b).digest("hex");
  const run = (cmd, args) =>
    exec(cmd, args, {
      cwd: root,
      env: envBase,
      timeoutMs: 180000,
      outputBytes: 64 * 1024 * 1024,
    });
  const cli = async (args) => {
    const r = await run(process.execPath, [
      join(root, "scripts/rea.mjs"),
      ...args,
      "--json",
    ]);
    const e = JSON.parse(r.stdout);
    assert.ok(!e.error, JSON.stringify(e));
    return e;
  };
  const save = async (name, v) =>
    writeFile(join(output, name), JSON.stringify(v, null, 2) + "\n");
  const staticEvidence = await cli(["inspect-managed-members", original]);
  await save("managed-members.json", staticEvidence);
  assert.ok(
    staticEvidence.normalized_result.methods.some(
      (m) => m.name === "CheckGameStatus",
    ),
  );
  const hashBefore = h(await readFile(original));
  const probe = join(output, "Probe.exe");
  await run("/opt/homebrew/opt/mono/bin/mcs", [
    "-r:System.Drawing",
    "-r:System.Windows.Forms",
    join(root, "scripts/benchmarks/TicTacToeProbe.cs"),
    "-out:" + probe,
  ]);
  const captured = [];
  for (const [side, binary] of [
    ["original", original],
    ["replica", replica],
  ]) {
    const directory = join(output, side + "-frames");
    const scenario = {
      executable: mono,
      arguments: [probe, binary, directory],
      working_directory: output,
      environment: {
        DISPLAY: envBase.DISPLAY,
        MONO_MWF_MAC_FORCE_X11: "1",
        DYLD_FALLBACK_LIBRARY_PATH: gdiplus + ":/opt/homebrew/lib:/opt/X11/lib",
      },
      terminal: { columns: 120, rows: 24, scrollback: 0 },
      events: [],
      timeout_ms: 120000,
      limits: { output_bytes: 64000000 },
      normalization: {
        paths: false,
        pids: false,
        ports: false,
        time_bucket_ms: 120000,
      },
    };
    const path = join(output, side + "-scenario.json");
    await writeFile(path, JSON.stringify(scenario));
    const e = await cli(["capture-process", path]);
    await save(side + "-capture.json", e);
    const c = e.normalized_result;
    assert.equal(c.truncated, false);
    assert.equal(c.exit.code, 0);
    assert.equal(c.exit.reason, "exited");
    assert.equal(c.settlement.state, "quiesced");
    const raw = Buffer.from(c.frames.map((f) => f.data).join(""), "utf8");
    await writeFile(join(output, side + "-terminal.bin"), raw);
    captured.push({ e, c, raw });
  }
  const [a, b] = captured;
  const boardRecords = (raw) =>
    raw
      .toString()
      .split(/\r+\n/)
      .filter((line) => /^\d+:(-1|0|1|2):/.test(line));
  const originalBoards = boardRecords(a.raw);
  const replicaBoards = boardRecords(b.raw);
  assert.equal(originalBoards.length, 19683);
  assert.equal(replicaBoards.length, 19683);
  const boardRecordMismatchCount = originalBoards.reduce(
    (count, record, index) => count + Number(record !== replicaBoards[index]),
    0,
  );
  const boardRecordsEqual = boardRecordMismatchCount === 0;
  const frames = [];
  for (const name of (await readdir(join(output, "original-frames")))
    .filter((n) => n.endsWith(".png"))
    .sort()) {
    const x = await readFile(join(output, "original-frames", name)),
      y = await readFile(join(output, "replica-frames", name));
    frames.push({
      name,
      pngBytesEqual: x.equals(y),
      originalSha256: h(x),
      replicaSha256: h(y),
    });
  }
  assert.equal(h(await readFile(original)), hashBefore);
  const report = {
    status:
      boardRecordsEqual &&
      frames.length === 6 &&
      frames.every((f) => f.pngBytesEqual)
        ? "suite-passed"
        : "mismatches",
    target: "tatlead/TicTacToe-AI published managed Windows game",
    originalSha256: hashBefore,
    replicaSha256: h(await readFile(replica)),
    probeSha256: h(await readFile(probe)),
    boardStates: originalBoards.length,
    boardRecordsEqual,
    boardRecordMismatchCount,
    terminalBytesEqual: a.raw.equals(b.raw),
    originalTerminalSha256: h(a.raw),
    replicaTerminalSha256: h(b.raw),
    originalEvidenceId: a.e.evidence_id,
    replicaEvidenceId: b.e.evidence_id,
    staticEvidenceId: staticEvidence.evidence_id,
    frames,
    executableByteIdentity: false,
    limitations: [
      "Exhaustive board configurations cover only the CheckGameStatus method and observed indicator properties.",
      "Six images are actual Form.DrawToBitmap renders following real button handlers; not Windows OS screenshots.",
      "Raw PTY terminal bytes are retained separately from exact board-record comparisons; an extra carriage return in the terminal capture can make raw streams differ while all 19,683 board records and rendered frames match.",
      "Original and replica are executed on the same macOS ARM Mono/X11 runtime.",
      "AI, RNG, all menus, timing, sound and whole-game equivalence remain unverified.",
      "Probe executes original and reconstructed code; no game logic is implemented in the probe.",
    ],
  };
  await save("report.json", report);
  assert.equal(report.status, "suite-passed");
  return report;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { managedBenchmarkScope } =
    await import("./lib/managed-benchmark-command.mjs");
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    console.log(
      JSON.stringify(
        await managedBenchmarkScope(abort.signal, () => verifyTicTacToe()),
        null,
        2,
      ),
    );
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
