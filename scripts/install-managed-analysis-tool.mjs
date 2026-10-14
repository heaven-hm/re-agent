#!/usr/bin/env node
import { managedBenchmarkCommand as defaultExec } from "./lib/managed-benchmark-command.mjs";
import {
  readFile,
  mkdir,
  writeFile,
  access,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

export async function readBoundedResponse(
  response,
  maxBytes = MAX_PACKAGE_BYTES,
) {
  if (!response.ok)
    throw Error(`ILSpy download failed: HTTP ${response.status}`);
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw Error("ILSpy package exceeds the download size limit");
  if (!response.body?.getReader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes)
      throw Error("ILSpy package exceeds the download size limit");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw Error("ILSpy package exceeds the download size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, length);
}

async function fetchPinnedPackage(sourceUrl, sha256, fetchImpl = fetch) {
  const url = new URL(sourceUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.nuget.org" ||
    url.username ||
    url.password
  )
    throw Error("ILSpy package source must use https://api.nuget.org");
  const bytes = await readBoundedResponse(
    await fetchImpl(url, { redirect: "error" }),
  );
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) throw Error("Downloaded ILSpy checksum mismatch");
  return bytes;
}

function nugetConfig(feed) {
  const escaped = feed
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return (
    '<configuration><packageSources><clear/><add key="private-feed" value="' +
    escaped +
    '"/></packageSources></configuration>'
  );
}

/** Install or reuse the hash-pinned ILSpy CLI. Options are injectable for tests. */
export async function installManagedTool(
  argv = process.argv,
  envBase = process.env,
  options = {},
) {
  const root = resolve(options.root ?? join(import.meta.dirname, ".."));
  const source = join(root, "third_party/ilspy");
  const manifest = JSON.parse(
    await readFile(join(source, "manifest.json"), "utf8"),
  );
  const directory = resolve(
    argv[2] ?? join(root, "output/autonomy/tools-dotnet"),
  );
  const executable = join(
    directory,
    (options.platform ?? process.platform) === "win32"
      ? "ilspycmd.exe"
      : "ilspycmd",
  );
  const env = { ...envBase, DOTNET_ROLL_FORWARD: "Major" };
  const exec = options.exec ?? defaultExec;
  const health = async () => {
    const r = await exec(executable, ["--version"], { env, timeoutMs: 30000 });
    if (!r.stdout.includes(manifest.version))
      throw Error("Incompatible ILSpy version");
    return r.stdout;
  };

  // A healthy existing installation wins before any artifact lookup or network access.
  try {
    await access(executable);
    return {
      tool: "ilspycmd",
      version: manifest.version,
      executable,
      reused: true,
      packageSha256: manifest.sha256,
      health: await health(),
      rollForward: "Major",
    };
  } catch (cause) {
    if (cause.code !== "ENOENT") throw cause;
  }

  await mkdir(directory, { recursive: true });
  const packagePath = join(source, manifest.package);
  let feed = source;
  let temporary = null;
  let config;
  try {
    let bytes;
    try {
      bytes = await readFile(packagePath);
    } catch (cause) {
      if (cause.code !== "ENOENT") throw cause;
      bytes = await fetchPinnedPackage(
        manifest.source,
        manifest.sha256,
        options.fetch ?? fetch,
      );
      temporary = await mkdtemp(
        join(options.tempRoot ?? tmpdir(), "rea-ilspy-"),
      );
      feed = temporary;
      await writeFile(join(feed, manifest.package), bytes, { flag: "wx" });
    }
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
      throw Error("Bundled ILSpy checksum mismatch");

    config = join(temporary ?? directory, `NuGet.${randomUUID()}.Config`);
    await writeFile(config, nugetConfig(feed), { flag: "wx" });
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
    if (temporary) await rm(temporary, { recursive: true, force: true });
    else if (config) await rm(config, { force: true });
  }
  return {
    tool: "ilspycmd",
    version: manifest.version,
    executable,
    reused: false,
    packageSha256: manifest.sha256,
    health: await health(),
    rollForward: "Major",
  };
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
        await managedBenchmarkScope(abort.signal, () => installManagedTool()),
        null,
        2,
      ),
    );
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
}
