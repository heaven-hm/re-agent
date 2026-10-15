import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// Owned fixtures exercise CLI wiring, not recovery of a closed-source application.
const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(
  process.argv[2] ?? join(repo, "output", `legacy-maintenance-${Date.now()}`),
);
await mkdir(output); // Refuse to overwrite prior evidence.
const workspace = join(output, "replica");
await mkdir(workspace);
const save = (name, value) =>
  writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
const cli = async (name, args) => {
  let result;
  try {
    result = await exec(
      process.execPath,
      [join(repo, "scripts/rea.mjs"), ...args, "--format", "json"],
      {
        cwd: repo,
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  } catch (error) {
    await writeFile(join(output, `${name}.stdout.json`), error.stdout ?? "");
    await writeFile(
      join(output, `${name}.stderr.txt`),
      error.stderr ?? String(error),
    );
    throw error;
  }
  await writeFile(join(output, `${name}.stdout.json`), result.stdout);
  await writeFile(join(output, `${name}.stderr.txt`), result.stderr);
  return JSON.parse(result.stdout);
};
const original = join(output, "original");
const replica = join(workspace, "rebuilt");
await writeFile(
  join(output, "original.c"),
  '#include <stdio.h>\n#include <stdlib.h>\nint main(int n,char**v){if(n!=2)return 2;printf("%d\\n",atoi(v[1])*3+2);return 0;}\n',
);
await writeFile(
  join(workspace, "rebuilt.c"),
  '#include <stdio.h>\n#include <stdlib.h>\nint main(int n,char**v){if(n!=2)return 2;int x=atoi(v[1]);printf("%d\\n",x+x+x+2);return 0;}\n',
);
const compiler = process.env.CC ?? "cc";
for (const [source, binary] of [
  [join(output, "original.c"), original],
  [join(workspace, "rebuilt.c"), replica],
]) {
  const result = await exec(compiler, [source, "-o", binary], {
    timeout: 60_000,
  });
  await writeFile(`${binary}.build.txt`, result.stdout + result.stderr);
}
const request = join(output, "request.json");
await save("request.json", {
  schema_version: 1,
  target_path: original,
  target_kind: "software",
  target_platform: { darwin: "macos", linux: "linux", win32: "windows" }[
    process.platform
  ],
  support_status: "unsupported",
  support_evidence: [
    "Owned synthetic fixture; no vendor support. Not a legacy application benchmark.",
  ],
  authorization: {
    basis: "owner",
    reference: "Fixture authored by verify-legacy-maintenance.mjs",
  },
  goal: "Verify hosted maintenance CLI and finite process comparison",
  max_repair_iterations: 1,
});
await save("plan.json", {
  investigation: {
    binaryPath: original,
    workspace,
    original: { command: original },
    replica: { command: replica },
    cases: [-3, 0, 5].map((x, i) => ({
      id: `case-${i}`,
      arguments: [String(x)],
    })),
    maxIterations: 1,
    timeoutMs: 5000,
  },
});
const skills = await cli("skills", ["maintenance-skills"]);
assert.equal(skills.status, "VALID");
assert.equal(skills.skills.length, 6);
const prepared = await cli("prepared", ["maintenance-plan", request]);
assert.equal(prepared.status, "READY_FOR_HOST_AGENT");
await writeFile(
  join(output, "snapshot.bin"),
  Buffer.from([0x48, 0x8b, 1, 0x48, 0x8b, 2]),
);
const scan = await cli("snapshot", [
  "memory-snapshot-pattern",
  join(output, "snapshot.bin"),
  "48 8B ??",
]);
assert.deepEqual(scan.match_offsets, [0, 3]);
const run = await cli("controller", [
  "maintenance-run",
  request,
  join(output, "plan.json"),
  join(output, "checkpoint.json"),
]);
assert.equal(run.status, "suite-passed");
const checkpoint = JSON.parse(
  await readFile(join(output, "checkpoint.json"), "utf8"),
);
assert.equal(checkpoint.results.length, 3);
assert(checkpoint.results.every((item) => item.status === "pass"));
const resumed = await cli("resumed", [
  "maintenance-run",
  request,
  join(output, "plan.json"),
  join(output, "checkpoint.json"),
  "--resume",
]);
assert.equal(resumed.status, "suite-passed");
// Prove the verification route does not accept a changed result as equivalent.
await writeFile(
  join(workspace, "rebuilt.c"),
  '#include <stdio.h>\nint main(void){puts("wrong");return 0;}\n',
);
await exec(compiler, [join(workspace, "rebuilt.c"), "-o", replica], {
  timeout: 60_000,
});
const mismatch = await cli("mismatch", [
  "maintenance-run",
  request,
  join(output, "plan.json"),
  join(output, "mismatch-checkpoint.json"),
]);
assert.notEqual(mismatch.status, "suite-passed");
const failed = JSON.parse(
  await readFile(join(output, "mismatch-checkpoint.json"), "utf8"),
);
assert.equal(failed.results.length, 3);
assert(failed.results.every((item) => item.status === "fail"));
await save("summary.json", {
  at: new Date().toISOString(),
  platform: process.platform,
  architecture: process.arch,
  scope:
    "Owned synthetic fixtures; CLI/controller wiring, not reverse-engineering or whole-program equivalence",
  target: prepared.target,
  skills: skills.skills.length,
  cases: checkpoint.results,
  status: run.status,
  resumed: resumed.status,
  mismatch_status: mismatch.status,
  mismatches_detected: failed.results.length,
  evidence_count: run.evidence_count,
  repair_iterations: 0,
  output,
});
console.log(`Verified maintenance fixture suite; evidence: ${output}`);
