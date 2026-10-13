#!/usr/bin/env node
/** One-command real software/game validation with an owned isolated X11 display. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, access, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  spawnOwnedProviderProcess,
  ProviderProcessSupervisor,
} from "../dist/process/ProviderProcess.js";
import { cleanupOwnedProcessGroup } from "../dist/process/ProcessOwnership.js";
import {
  managedBenchmarkCommand as command,
  managedBenchmarkScope,
} from "./lib/managed-benchmark-command.mjs";
const root = resolve(import.meta.dirname, ".."),
  output = resolve(
    process.argv[2] ?? `output/autonomy/managed-suite-${Date.now()}`,
  );
assert.equal(
  process.platform,
  "darwin",
  "This verified integration profile requires macOS",
);
assert.equal(
  process.arch,
  "arm64",
  "This bundled drawing library requires ARM64",
);
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
const abort = new AbortController();
const interrupt = () => abort.abort();
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
let owner, report;
try {
  const original = join(
    root,
    "output/autonomy/windows-software/original/luhn.dll",
  );
  try {
    await access(original);
  } catch (cause) {
    if (cause.code !== "ENOENT") throw cause;
    const response = await fetch(
      "https://static.ltr-data.se/files/net10.0/luhn.zip",
      {
        redirect: "error",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]),
      },
    );
    assert.ok(response.ok);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      "aff368c553a460a4ff2b14046cb1388d38d92b255ba648becb0542041ef885df",
    );
    const zip = join(output, "luhn.zip");
    await writeFile(zip, bytes);
    const directory = resolve(original, "..");
    await mkdir(directory, { recursive: true });
    await command("/usr/bin/unzip", ["-o", zip, "-d", directory], {
      cwd: root,
      signal: abort.signal,
    });
    for (const name of [
      "luhn.dll",
      "luhn.runtimeconfig.json",
      "luhn.deps.json",
    ])
      await chmod(join(directory, name), 0o600);
  }
  assert.equal(
    createHash("sha256")
      .update(await readFile(original))
      .digest("hex"),
    "e30a028e8db474b8a3b17f7088efb8054b818f08b1e30011a50112480d5be353",
  );
  const run = async (name, args, env = process.env) => {
    const functions = {
      "verify-luhn-reconstruction.mjs": "verifyLuhn",
      "recover-tictactoe-replica.mjs": "recoverTicTacToe",
      "verify-tictactoe-reconstruction.mjs": "verifyTicTacToe",
    };
    const stage = await import("./" + name);
    const value = await managedBenchmarkScope(abort.signal, () =>
      stage[functions[name]]([process.execPath, name, ...args], env),
    );
    return { stdout: JSON.stringify(value, null, 2) };
  };
  const software = await run("verify-luhn-reconstruction.mjs", [
    original,
    join(output, "software"),
  ]);
  await writeFile(join(output, "software-report.json"), software.stdout);
  const recovered = await run("recover-tictactoe-replica.mjs", [
    join(output, "game-recovery"),
  ]);
  await writeFile(join(output, "game-recovery-report.json"), recovered.stdout);
  let display;
  for (let n = 190; n < 220; n++) {
    try {
      await access("/private/tmp/.X" + n + "-lock");
      continue;
    } catch (cause) {
      if (cause.code !== "ENOENT") throw cause;
    }
    try {
      await access("/private/tmp/.X11-unix/X" + n);
      continue;
    } catch (cause) {
      if (cause.code !== "ENOENT") throw cause;
    }
    display = ":" + n;
    break;
  }
  assert.ok(display, "No free bounded X11 display");
  const launch = await spawnOwnedProviderProcess({
    command: "/opt/X11/bin/Xvfb",
    arguments: [display, "-screen", "0", "1024x768x24", "-nolisten", "tcp"],
    runId: "rea-engine-display-" + randomUUID(),
    signal: abort.signal,
  });
  owner = new ProviderProcessSupervisor(
    {
      ...launch,
      ownsProcessLifetime: true,
      cleanup: () => cleanupOwnedProcessGroup(launch.ownership),
    },
    { maxDiagnosticBytes: 1000000 },
  );
  let ready = false;
  for (let n = 0; n < 30; n++) {
    abort.signal.throwIfAborted();
    try {
      await command("/opt/X11/bin/xwininfo", ["-display", display, "-root"], {
        cwd: root,
        timeoutMs: 2000,
        signal: abort.signal,
      });
      ready = true;
      break;
    } catch (cause) {
      if (owner.observedExit() !== undefined) throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Owned X11 display did not become ready");
  const game = await run(
    "verify-tictactoe-reconstruction.mjs",
    [
      join(root, "benchmarks/tictactoe/original/TicTacToe.exe"),
      join(output, "game-recovery/Replica.exe"),
      join(output, "game"),
    ],
    {
      ...process.env,
      DISPLAY: display,
      REA_GDIPLUS_DIRECTORY: join(root, "third_party/libgdiplus"),
    },
  );
  await writeFile(join(output, "game-report.json"), game.stdout);
  report = {
    status: "suite-passed",
    software: JSON.parse(software.stdout),
    game: JSON.parse(game.stdout),
    recovery: JSON.parse(recovered.stdout),
    limitations: [
      "Declared terminal/state/PNG comparisons only; whole executables differ.",
      "This verified profile requires installed .NET 10, ARM Mono and its shared-library dependencies, plus XQuartz.",
      "Binary recovery is scoped to the two declared targets; general arbitrary-program fidelity is unproven.",
    ],
  };
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
  if (owner) {
    const cleanup = await owner.stop();
    await writeFile(
      join(output, "display-cleanup.json"),
      JSON.stringify(cleanup, null, 2) + "\n",
    );
    if (report) report.displayCleanup = cleanup;
    assert.ok(
      !["incomplete", "not-owned"].includes(cleanup.status),
      "Owned display cleanup incomplete",
    );
    owner.dispose();
  }
}

if (report) {
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        status: report.status,
        output,
        softwareSuites: report.software.declaredSuites,
        gameBoards: report.game.boardStates,
        identicalFrames: report.game.frames.length,
        displayCleanup: report.displayCleanup,
      },
      null,
      2,
    ),
  );
}
