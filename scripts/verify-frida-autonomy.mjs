import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { traceFridaAutonomy } from "../dist/native/FridaAutonomyTrace.js";
import { parseMachoLayout } from "../dist/native/AppleMachoSelection.js";
import { createEvidence } from "../dist/domain/evidence.js";
const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../", import.meta.url));
const gadgetMode = process.argv.includes("--gadget");
const outputArgument = process.argv
  .slice(2)
  .find((value) => !value.startsWith("--"));
const output = resolve(
  outputArgument ?? join(repo, "output/autonomy", `frida-${Date.now()}`),
);
await mkdir(output, { recursive: true });
const binary = join(output, "unknown-native-target");
await exec("clang", [
  "-O0",
  "-g0",
  "-o",
  binary,
  join(repo, "tests/fixtures/autonomy/frida-gated-transform.c"),
]);
const entitlementPath = join(output, "owned-fixture-debug-entitlements.plist");
await writeFile(
  entitlementPath,
  '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>',
);
// Only this authored local fixture is signed for debugging. Proprietary applications are untouched.
await exec("/usr/bin/codesign", [
  "--force",
  "--sign",
  "-",
  "--entitlements",
  entitlementPath,
  binary,
]);
const signing = await exec("/usr/bin/codesign", [
  "-d",
  "--entitlements",
  ":-",
  binary,
]);
await writeFile(
  join(output, "fixture-debug-signing.txt"),
  signing.stdout + signing.stderr,
);
const bytes = await readFile(binary);
const sha256 = createHash("sha256").update(bytes).digest("hex");
// Discovery enumerates the compiled binary; no manually supplied function address.
const analysis = await exec("r2", ["-q", "-c", "aaa;aflj", binary], {
  timeout: 120000,
  maxBuffer: 4 * 1024 * 1024,
});
await writeFile(join(output, "radare2-functions.json"), analysis.stdout);
const functions = JSON.parse(analysis.stdout);
const candidates = functions.filter(
  (entry) =>
    !entry.name.includes("imp.") && entry.name.includes("hidden_transform"),
);
assert.equal(
  candidates.length,
  1,
  "One fixture-local function discovered through actual binary inventory",
);
const selected = candidates[0];
const architecture = process.arch === "arm64" ? "arm64" : "x86_64";
const layout = parseMachoLayout(bytes, architecture);
const staticAddress = `0x${BigInt(selected.addr ?? selected.offset).toString(16)}`;
const prefix = bytes
  .subarray(
    layout.offset(BigInt(staticAddress), 16),
    layout.offset(BigInt(staticAddress), 16) + 16,
  )
  .toString("hex");
const staticEvidence = createEvidence(
  { path: binary, sha256, format: "mach-o", architecture },
  { id: "radare2", name: "radare2", version: null },
  {
    predicateType: "rea.function-inventory",
    operation: "discover_functions",
    parameters: { command: "aaa;aflj", selected_function: selected.name },
    result: { functions, selected },
    confidence: "observed",
    authority: "shipped-artifact",
    limitations: [
      "Authored fixture selected by discovered symbol; general unknown-function prioritization is separate.",
    ],
  },
);
await writeFile(
  join(output, "static-evidence.json"),
  JSON.stringify(staticEvidence, null, 2),
);
async function acquireOfficialGadget() {
  const root = join(repo, "output/autonomy/tools-frida-gadget");
  await mkdir(root, { recursive: true });
  const metadataPath = join(output, "official-gadget-release.json");
  await exec(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--proto",
      "=https",
      "--max-filesize",
      "2097152",
      "--max-time",
      "45",
      "https://api.github.com/repos/frida/frida/releases/tags/17.23.3",
      "-o",
      metadataPath,
    ],
    { timeout: 50000 },
  );
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(metadata.tag_name, "17.23.3");
  const asset = metadata.assets.find(
    (entry) => entry.name === "frida-gadget-17.23.3-macos-universal.dylib.xz",
  );
  const pinned =
    "9de7b1078f49d52648cbafa6fe1d1fd9dfaf6ac4a212cce1be87eb6192505c79";
  assert.equal(
    asset?.digest,
    `sha256:${pinned}`,
    "Official release asset SHA256 matches declared pin",
  );
  assert.equal(
    asset.browser_download_url,
    "https://github.com/frida/frida/releases/download/17.23.3/frida-gadget-17.23.3-macos-universal.dylib.xz",
  );
  const compressedPath = join(root, asset.name);
  let compressed;
  try {
    compressed = await readFile(compressedPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const reusedVerifiedAsset = compressed !== undefined;
  if (compressed === undefined) {
    await exec(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-filesize",
        "67108864",
        "--max-time",
        "120",
        asset.browser_download_url,
        "-o",
        compressedPath,
      ],
      { timeout: 125000 },
    );
    compressed = await readFile(compressedPath);
  }
  assert.equal(createHash("sha256").update(compressed).digest("hex"), pinned);
  assert.equal(compressed.length, asset.size);
  const library = join(root, "FridaGadget-17.23.3.dylib");
  const python =
    process.env.REA_FRIDA_PYTHON ??
    join(repo, "output/autonomy/tools-python/venv/bin/python");
  await exec(
    python,
    [
      "-c",
      "import lzma,pathlib,sys; data=lzma.open(sys.argv[1],'rb').read(128*1024*1024+1); assert len(data)<=128*1024*1024; path=pathlib.Path(sys.argv[2]); old=path.read_bytes() if path.exists() else None; assert old is None or old==data; path.write_bytes(data) if old is None else None",
      compressedPath,
      library,
    ],
    { timeout: 30000 },
  );
  const licenseUrls = [
    "https://raw.githubusercontent.com/frida/frida-core/17.23.3/COPYING",
    "https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/LGPL-2.0-only.txt",
  ];
  for (const licenseUrl of licenseUrls) {
    const notice = join(
      root,
      licenseUrl.endsWith("LGPL-2.0-only.txt")
        ? "COPYING.LIB"
        : licenseUrl.split("/").at(-1),
    );
    await exec(
      "curl",
      [
        "--fail",
        "--silent",
        "--show-error",
        "--proto",
        "=https",
        "--max-filesize",
        "1048576",
        "--max-time",
        "30",
        licenseUrl,
        "-o",
        notice,
      ],
      { timeout: 35000 },
    );
  }
  const libraryBytes = await readFile(library);
  const record = {
    official_repository: "frida/frida",
    release_tag: metadata.tag_name,
    release_published_at: metadata.published_at,
    source_url: asset.browser_download_url,
    expected_official_asset_digest: asset.digest,
    verified_compressed_sha256: pinned,
    compressed_bytes: compressed.length,
    gadget_path: library,
    gadget_sha256: createHash("sha256").update(libraryBytes).digest("hex"),
    expanded_bytes: libraryBytes.length,
    reused_verified_asset: reusedVerifiedAsset,
    upstream_license_notice_urls: licenseUrls,
    scope:
      "Optional private preload in authorized authored fixture; no proprietary binary modification",
  };
  await writeFile(
    join(output, "gadget-provenance.json"),
    JSON.stringify(record, null, 2),
  );
  return { gadgetPath: record.gadget_path, gadgetSha256: record.gadget_sha256 };
}
const gadget = gadgetMode ? await acquireOfficialGadget() : {};
const inputs = [-17, -1, 0, 1, 17];
const expected = [-92, -12, 11, 14, 62];
const evidence = await traceFridaAutonomy({
  binaryPath: binary,
  pythonPath:
    process.env.REA_FRIDA_PYTHON ??
    join(repo, "output/autonomy/tools-python/venv/bin/python"),
  args: [],
  stdin: inputs.map(String).join("\n") + "\n",
  staticAddress,
  preferredBase: `0x${layout.baseAddress.toString(16)}`,
  codePrefix: prefix,
  timeoutMs: 120000,
  maxEvents: 16,
  staticEvidence,
  ...gadget,
});
await writeFile(
  join(output, "runtime-evidence.json"),
  JSON.stringify(evidence, null, 2),
);
const result = evidence.normalized_result;
if (result.status !== "runtime-observed") {
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        status: "failed",
        scope: "Owned authored fixture Frida attachment",
        source_evidence_id: staticEvidence.evidence_id,
        runtime_evidence_id: evidence.evidence_id,
        error: result.error,
        cleanup: result.cleanup ?? null,
        limitations: [
          "Function hooking and static/runtime correlation were not demonstrated; no calls captured.",
          "This failure is retained rather than treated as a successful integration.",
        ],
      },
      null,
      2,
    ),
  );
}
assert.equal(result.status, "runtime-observed", JSON.stringify(result));
assert.equal(result.cleanup.reaped, true);
assert.equal(result.output_truncated, false);
const calls = result.events.filter((event) => event.type === "call");
assert.equal(calls.length, inputs.length);
assert.deepEqual(
  calls.map((call) => call.arg0_signed64_assumption),
  inputs.map(String),
);
assert.deepEqual(
  calls.map((call) => call.return_signed64_assumption),
  expected.map(String),
);
const fixtureStdout = result.stdout.trim().split("\n");
const gadgetDiagnostic = gadgetMode
  ? `[Frida INFO] Listening on 127.0.0.1 TCP port ${result.gadget.loopback_port}`
  : null;
assert.deepEqual(
  fixtureStdout,
  gadgetDiagnostic === null
    ? expected.map(String)
    : [gadgetDiagnostic, ...expected.map(String)],
);
const report = {
  status: "passed",
  scope:
    "Five actually instrumented calls to one automatically enumerated authored native fixture function",
  instrumentation_profile: gadgetMode ? "owned-gadget-preload" : "local-attach",
  function: selected.name,
  static_address: staticAddress,
  binary_sha256: sha256,
  source_evidence_id: staticEvidence.evidence_id,
  runtime_evidence_id: evidence.evidence_id,
  inputs,
  outputs: expected,
  observed_stdout: result.stdout,
  expected_gadget_startup_diagnostic: gadgetDiagnostic,
  cleanup: result.cleanup,
  limitations: [
    "Does not instrument Apple Calculator or bypass hardened runtime.",
    "Optional Gadget changes the fixture instrumentation environment; no claim of original protected-application support.",
    "Register interpretation assumes signed 64-bit fixture ABI; no universal equivalence claim.",
  ],
};
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report }, null, 2));
