#!/usr/bin/env node
import { managedBenchmarkCommand as exec } from "./lib/managed-benchmark-command.mjs";
/** Recover this published game binary through the existing REA managed workflow. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const original = join(root, "benchmarks/tictactoe/original/TicTacToe.exe");
const output = resolve(
  process.argv[2] ?? `output/autonomy/game-recovery-${Date.now()}`,
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  sha(await readFile(original)),
  "df4aec7299b1e002ca0e1008b20a889e0cfe5b482a19958399fab16ac6090402",
  "This scoped recovery admits only the declared published binary",
);
await mkdir(dirname(output), { recursive: true });
await mkdir(output);
const run = (cmd, args, cwd = root, env = process.env) =>
  exec(cmd, args, {
    cwd,
    env,
    timeoutMs: 180000,
    outputBytes: 32 * 1024 * 1024,
  });
const analyzed = await run(process.execPath, [
  join(root, "scripts/rea.mjs"),
  "inspect-managed-members",
  original,
  "--json",
]);
const evidence = JSON.parse(analyzed.stdout);
assert.ok(!evidence.error);
await writeFile(join(output, "managed-members.json"), analyzed.stdout);
const tool = await run(process.execPath, [
  join(root, "scripts/install-managed-analysis-tool.mjs"),
]);
const executable = JSON.parse(tool.stdout).executable;
await run(executable, ["-p", "-o", output, original], root, {
  ...process.env,
  DOTNET_ROLL_FORWARD: "Major",
});
await run(
  "/opt/homebrew/opt/mono/bin/monodis",
  ["--mresources", original],
  output,
);
const sdk = (await run("dotnet", ["--list-sdks"])).stdout
  .trim()
  .split("\n")
  .filter((l) => l.startsWith("10."))
  .at(-1);
assert.ok(sdk, "Installed .NET 10 SDK required");
const match = /^(\S+) \[(.*)\]$/.exec(sdk);
assert.ok(match);
const csc = join(match[2], match[1], "Roslyn/bincore/csc.dll");
async function files(dir) {
  let r = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) r.push(...(await files(p)));
    else r.push(p);
  }
  return r;
}
const recovered = await files(output),
  sources = recovered.filter((f) => f.endsWith(".cs")),
  resources = recovered.filter((f) => f.endsWith(".resources"));
const reference = "/opt/homebrew/opt/mono/lib/mono/4.5";
const args = [
  csc,
  "-nologo",
  "-target:winexe",
  "-out:" + join(output, "Replica.exe"),
  "-nostdlib+",
  ...[
    "mscorlib",
    "System",
    "System.Core",
    "System.Drawing",
    "System.Windows.Forms",
    "System.Configuration",
    "System.Xml",
  ].map((n) => "-r:" + join(reference, n + ".dll")),
  ...resources.map((f) => "-resource:" + f + "," + f.split("/").at(-1)),
  ...sources,
];
let repaired = false;
try {
  const r = await run("dotnet", args);
  await writeFile(join(output, "build.txt"), r.stdout + r.stderr);
} catch (cause) {
  await writeFile(
    join(output, "initial-build-failure.txt"),
    (cause.stdout ?? "") + (cause.stderr ?? ""),
  );
  if (!String(cause.stdout).includes("error CS1501")) throw cause;
  const source = join(output, "TicTacToe/Form1.cs"),
    text = await readFile(source, "utf8");
  const member = evidence.normalized_result.methods.find(
    (m) => m.name === "Dispose" && m.declaring_type === "TicTacToe.Form1",
  );
  assert.ok(
    member?.body.anchors.some((a) => a.opcode === "call"),
    "Original CIL records a non-virtual base call",
  );
  assert.ok(text.includes("((Form)this).Dispose(disposing);"));
  await writeFile(
    source,
    text.replace(
      "((Form)this).Dispose(disposing);",
      "base.Dispose(disposing);",
    ),
  );
  const r = await run("dotnet", args);
  await writeFile(join(output, "build.txt"), r.stdout + r.stderr);
  repaired = true;
}
const method = evidence.normalized_result.methods.find(
  (m) => m.name === "CheckGameStatus",
);
const source = join(output, "TicTacToe/Form1.cs"),
  text = await readFile(source, "utf8");
const start = text.indexOf("private int CheckGameStatus()"),
  end = text.indexOf("private void RunBot()", start);
assert.ok(start >= 0 && end > start);
const imported = {
  static_members: evidence,
  decompiler: {
    name: "ilspycmd",
    version: "9.1.0.7988",
    family: "ilspy",
    executable_sha256: sha(await readFile(executable)),
    options: ["-p", "-o", output, original],
  },
  methods: [
    {
      token: method.token,
      signature_sha256: method.signature.raw_sha256,
      normalized_il_sha256: method.body.normalized_il_sha256,
      reconstruction: {
        kind: "decompiled-csharp",
        language: "csharp",
        text: text.slice(start, end),
        source_path: source,
      },
    },
  ],
  notes: [
    "Recovered exclusively from the compiled binary; compiler-detected base-call correction grounded in original CIL.",
  ],
};
const request = join(output, "reconstruction-request.json");
await writeFile(request, JSON.stringify(imported));
const result = await run(process.execPath, [
  join(root, "scripts/rea.mjs"),
  "import-managed-reconstruction",
  request,
  "--json",
]);
const reconstruction = JSON.parse(result.stdout);
assert.ok(!reconstruction.error);
await writeFile(join(output, "reconstruction-evidence.json"), result.stdout);
const report = {
  status: "built",
  originalSha256: sha(await readFile(original)),
  replicaSha256: sha(await readFile(join(output, "Replica.exe"))),
  staticEvidenceId: evidence.evidence_id,
  reconstructionEvidenceId: reconstruction.evidence_id,
  compilerRepairApplied: repaired,
  output,
  limitations: [
    "This recovery adapter is scoped to the pinned game; it is not a universal decompiler policy.",
    "Compilation alone establishes no behavioral equivalence; run the game verifier.",
  ],
};
await writeFile(
  join(output, "recovery-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
