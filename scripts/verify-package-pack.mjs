import { statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CATALOG_IDENTITY } from "../dist/catalogIdentity.js";

import { exec } from "./lib/verify-package-core.mjs";
import { verifyPackedBridge } from "./verify-packed-bridge.mjs";
import {
  verifyBenchmarkCatalogReferences,
  verifyReconstructionPayload,
} from "./lib/package-reconstruction-payload.mjs";
import {
  verifyPackedThirdPartyDistribution,
  verifyThirdPartyDistributionInventory,
} from "./lib/verify-third-party-distribution-inventory.mjs";

function verifyNoPrivateBatchTwoInputs(packedFiles) {
  if (
    packedFiles.some((path) =>
      /^package\/benchmarks\/native-batch-2\/(?:originals\/|\.runtime-workers\/|logs\/(?:runtime|checkpoints)\/)/u.test(
        path,
      ),
    )
  )
    throw new Error(
      "package included private Batch 2 originals or runtime-worker data",
    );
}

function verifyBenchmarkBuilderScript(packedManifest) {
  if (
    packedManifest.scripts?.["benchmarks:build"] !==
    "node scripts/build-benchmarks.mjs"
  )
    throw new Error("package omitted the one-command macOS benchmark builder");
}

/** Create a tarball and assert production packaging constraints. */
export async function verifyPackagePack({ root, workspace }) {
  verifyBenchmarkCatalogReferences(
    (path) =>
      statSync(resolve(root, path), { throwIfNoEntry: false })?.isFile() ??
      false,
  );
  await verifyThirdPartyDistributionInventory(undefined, root);
  const packDirectory = join(workspace, "pack");
  await mkdir(packDirectory);
  const tarball = join(
    packDirectory,
    (
      await exec(
        "npm",
        ["pack", "--silent", "--pack-destination", packDirectory],
        {
          cwd: root,
        },
      )
    ).stdout.trim(),
  );
  const packedFiles = (await exec("tar", ["-tf", tarball])).stdout.split("\n");
  verifyPackedThirdPartyDistribution(packedFiles);
  if (!packedFiles.includes("package/third_party/distribution-inventory.json"))
    throw new Error("package omitted the third-party distribution inventory");
  verifyReconstructionPayload(
    new Set(packedFiles.map((path) => path.replace(/^package\//u, ""))),
  );
  verifyNoPrivateBatchTwoInputs(packedFiles);
  const packedManifest = JSON.parse(
    (await exec("tar", ["-xOf", tarball, "package/package.json"])).stdout,
  );
  if (
    packedManifest.scripts?.postinstall !== undefined ||
    packedManifest.dependencies?.["node-pty"] !== undefined ||
    packedManifest.dependencies?.["@lydell/node-pty"] !== "1.1.0"
  )
    throw new Error("package retained a lifecycle-dependent PTY installation");
  if (
    packedManifest.bin?.rea !== "scripts/rea.mjs" ||
    packedManifest.bin?.["rea-agents"] !== "scripts/rea.mjs"
  )
    throw new Error("package did not expose both rea command entry points");
  if (packedManifest.mcpName !== "io.github.heaven-hm/rea-engine")
    throw new Error("package did not retain its MCP Registry ownership marker");
  verifyBenchmarkBuilderScript(packedManifest);
  if (packedFiles.some((path) => path.startsWith("package/.agents/")))
    throw new Error(
      "package included authored skill sources instead of only the generated bundle",
    );
  if (packedFiles.some((path) => path.startsWith("package/.cache/")))
    throw new Error("package included development cache or test metadata");
  const skill = (
    await exec("tar", [
      "-xOf",
      tarball,
      "package/skills/reverse-engineer-anything/SKILL.md",
    ])
  ).stdout;
  if (
    !skill.includes(
      `  tool_count: ${String(CATALOG_IDENTITY.counts.mcp_tools)}\n`,
    ) ||
    skill.includes("  catalog_digest:")
  )
    throw new Error(
      "packaged skill metadata did not match the catalog shipped in the package",
    );
  if (
    packedFiles.some(
      (path) => path.includes("__pycache__") || path.endsWith(".pyc"),
    )
  ) {
    throw new Error("package contained generated Python bytecode");
  }
  await verifyPackedBridge({ workspace, tarball, packedFiles });
  return { tarball };
}
