#!/usr/bin/env node
import { managedBenchmarkCommand as exec } from "./lib/managed-benchmark-command.mjs";
/** Install the bundled, hash-pinned ILSpy package into a workspace directory. */
import { readFile, mkdir, writeFile, access, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const source = join(root, "third_party/ilspy");
const manifest = JSON.parse(
  await readFile(join(source, "manifest.json"), "utf8"),
);
const bytes = await readFile(join(source, manifest.package));
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
  throw Error("Bundled ILSpy checksum mismatch");
const directory = resolve(
  process.argv[2] ?? join(root, "output/autonomy/tools-dotnet"),
);
const executable = join(
  directory,
  process.platform === "win32" ? "ilspycmd.exe" : "ilspycmd",
);
const env = { ...process.env, DOTNET_ROLL_FORWARD: "Major" };
const health = async () => {
  const r = await exec(executable, ["--version"], { env, timeoutMs: 30000 });
  if (!r.stdout.includes(manifest.version))
    throw Error("Incompatible ILSpy version");
  return r.stdout;
};
let reused = false;
try {
  await access(executable);
  await health();
  reused = true;
} catch (cause) {
  if (cause.code !== "ENOENT") throw cause;
  await mkdir(directory, { recursive: true });
  const config = join(directory, `NuGet.${randomUUID()}.Config`);
  await writeFile(
    config,
    '<configuration><packageSources><clear/><add key="bundled" value="' +
      source.replaceAll("&", "&amp;").replaceAll('"', "&quot;") +
      '"/></packageSources></configuration>',
    { flag: "wx" },
  );
  try {
    await exec(
      "dotnet",
      [
        "tool",
        "install",
        "ilspycmd",
        "--version",
        manifest.version,
        "--tool-path",
        directory,
        "--configfile",
        config,
      ],
      { env, timeoutMs: 120000, outputBytes: 8 * 1024 * 1024 },
    );
  } finally {
    await unlink(config);
  }
}
console.log(
  JSON.stringify(
    {
      tool: "ilspycmd",
      version: manifest.version,
      executable,
      reused,
      packageSha256: manifest.sha256,
      health: await health(),
      rollForward: "Major",
    },
    null,
    2,
  ),
);
