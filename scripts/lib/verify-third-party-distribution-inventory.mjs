#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import inventory from "../../third_party/distribution-inventory.json" with { type: "json" };

const SHA256 = /^[a-f0-9]{64}$/u;
const SPDX_IDENTIFIERS = new Set([
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "LGPL-3.0-only",
  "MIT",
  "NOASSERTION",
]);
const DISTRIBUTIONS = new Set([
  "npm-allowlisted",
  "release-only",
  "byo",
  "source-only",
  "not-approved",
  "not-present",
]);
const THIRD_PARTY_ARTIFACT =
  /(?:\.(?:a|apk|app|bin|bundle|class|deb|dmg|dylib(?:\.\d+)*|dll|exe|framework|ipa|jar|msi|node|nupkg|pyz|rpm|tgz|wasm|whl|zip|7z)|\.so(?:\.\d+)*|\.tar\.(?:bz2|gz|xz|zst)|\.(?:bz2|gz|xz|zst))$/iu;

/** Validate inventory structure and integrity of every referenced local file. */
export async function verifyThirdPartyDistributionInventory(
  candidate = inventory,
  repositoryRoot = process.cwd(),
) {
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.entries) ||
    !Array.isArray(candidate.repositoryComponents)
  )
    throw new Error("Invalid third-party distribution inventory header");

  const ids = new Set();
  let approvedCount = 0;
  for (const entry of candidate.entries) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      ids.has(entry.id)
    )
      throw new Error(
        "Third-party inventory entries need unique non-empty ids",
      );
    ids.add(entry.id);

    if (
      typeof entry.name !== "string" ||
      typeof entry.version !== "string" ||
      typeof entry.integration !== "string" ||
      !DISTRIBUTIONS.has(entry.distribution) ||
      typeof entry.redistributionApproved !== "boolean" ||
      typeof entry.spdx !== "string" ||
      !SPDX_IDENTIFIERS.has(entry.spdx) ||
      typeof entry.licenseStatus !== "string" ||
      ![
        "verified",
        "conditional",
        "incomplete",
        "declared",
        "unknown",
      ].includes(entry.licenseStatus) ||
      !Array.isArray(entry.licenseEvidence) ||
      !Array.isArray(entry.notices) ||
      !Array.isArray(entry.artifacts) ||
      !Array.isArray(entry.limitations) ||
      entry.limitations.length === 0
    )
      throw new Error(`Invalid distribution inventory entry: ${entry.id}`);

    for (const ref of [
      ...entry.licenseEvidence,
      ...entry.notices,
      ...entry.artifacts.filter((artifact) => artifact.path),
    ])
      await verifyLocalFileRef(ref, repositoryRoot, entry.id);

    for (const artifact of entry.artifacts) {
      if (
        typeof artifact.fileName !== "string" ||
        !SHA256.test(artifact.sha256 ?? "")
      )
        throw new Error(`Artifact needs a filename and SHA-256: ${entry.id}`);
      if (artifact.availability === "external-release-record") {
        if (
          typeof artifact.sourceUrl !== "string" ||
          !artifact.sourceUrl.startsWith("https://")
        )
          throw new Error(
            `External artifact needs an HTTPS source URL: ${entry.id}`,
          );
      } else if (artifact.availability !== "local" || !artifact.path) {
        throw new Error(`Artifact availability/path is invalid: ${entry.id}`);
      }
    }

    if (entry.redistributionApproved) {
      approvedCount += 1;
      if (
        !["npm-allowlisted", "release-only"].includes(entry.distribution) ||
        entry.spdx === "NOASSERTION" ||
        entry.licenseStatus !== "verified" ||
        entry.licenseEvidence.length === 0 ||
        entry.notices.length === 0 ||
        entry.artifacts.length === 0 ||
        entry.artifacts.some(
          (artifact) => artifact.availability !== "local" || !artifact.path,
        )
      )
        throw new Error(
          `Redistribution approval lacks exact local artifacts, verified SPDX/license evidence, or notices: ${entry.id}`,
        );
    }
  }

  const components = await verifyRepositoryComponentCoverage(
    candidate,
    repositoryRoot,
    ids,
  );

  return {
    entries: ids.size,
    repositoryComponents: components,
    redistributionApproved: approvedCount,
  };
}

/**
 * Verify that an npm package contains only tool artifacts whose exact bytes,
 * license evidence, and notices have been approved by the inventory.
 * `packedFiles` may contain either npm's `package/...` paths or relative paths.
 */
export function verifyPackedThirdPartyDistribution(
  packedFiles,
  candidate = inventory,
) {
  if (!Array.isArray(packedFiles) || !Array.isArray(candidate?.entries))
    throw new Error("Invalid package file list or third-party inventory");

  const files = new Set(
    packedFiles.map((file) =>
      typeof file === "string" ? file.replace(/^package\//u, "") : "",
    ),
  );
  const repositoryComponentPaths = new Set(
    (candidate.repositoryComponents ?? []).map((component) => component.path),
  );
  const inventoriedArtifactPaths = new Set(
    candidate.entries.flatMap((entry) =>
      (entry.artifacts ?? [])
        .filter((artifact) => artifact.availability === "local")
        .map((artifact) => artifact.path),
    ),
  );
  for (const file of files) {
    if (
      file.startsWith("third_party/") &&
      THIRD_PARTY_ARTIFACT.test(file) &&
      !inventoriedArtifactPaths.has(file)
    )
      throw new Error(
        `Package included an unrecorded third-party artifact ${file}`,
      );
  }
  for (const entry of candidate.entries) {
    for (const artifact of entry.artifacts ?? []) {
      if (
        artifact.availability !== "local" ||
        typeof artifact.path !== "string"
      )
        continue;
      const included = files.has(artifact.path);
      if (!entry.redistributionApproved && included)
        throw new Error(
          `Package included unapproved local tool artifact ${artifact.path} (${entry.id})`,
        );
      if (entry.redistributionApproved && !included)
        throw new Error(
          `Package omitted approved local tool artifact ${artifact.path} (${entry.id})`,
        );
    }

    if (entry.redistributionApproved) {
      for (const proof of [...entry.licenseEvidence, ...entry.notices]) {
        if (!files.has(proof.path))
          throw new Error(
            `Package omitted redistribution proof ${proof.path} (${entry.id})`,
          );
      }
    }
  }
  for (const file of files) {
    if (!file.startsWith("third_party/")) continue;
    const remainder = file.slice("third_party/".length);
    if (!remainder.includes("/")) continue;
    const componentPath = `third_party/${remainder.split("/")[0]}`;
    if (!repositoryComponentPaths.has(componentPath))
      throw new Error(
        `Package included an unrecorded third-party component ${componentPath}`,
      );
  }
}

async function verifyRepositoryComponentCoverage(
  candidate,
  repositoryRoot,
  entryIds,
) {
  const thirdPartyRoot = resolve(repositoryRoot, "third_party");
  let directories;
  try {
    directories = (await readdir(thirdPartyRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => `third_party/${entry.name}`)
      .sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      directories = [];
    else throw error;
  }

  const mapped = new Map();
  for (const component of candidate.repositoryComponents) {
    if (
      component === null ||
      typeof component !== "object" ||
      typeof component.path !== "string" ||
      !/^third_party\/[^/]+$/u.test(component.path) ||
      typeof component.entryId !== "string" ||
      !entryIds.has(component.entryId)
    )
      throw new Error("Invalid third-party repository component mapping");
    if (mapped.has(component.path))
      throw new Error(
        `Duplicate third-party repository component ${component.path}`,
      );
    try {
      if (!(await stat(resolve(repositoryRoot, component.path))).isDirectory())
        throw new Error(
          `Third-party component is not a directory: ${component.path}`,
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Third-party component")
      )
        throw error;
      throw new Error(`Missing third-party component ${component.path}`, {
        cause: error,
      });
    }
    mapped.set(component.path, component.entryId);
  }

  const missing = directories.filter((directory) => !mapped.has(directory));
  const stale = [...mapped.keys()].filter(
    (directory) => !directories.includes(directory),
  );
  if (missing.length > 0 || stale.length > 0)
    throw new Error(
      `Third-party repository component coverage mismatch (unrecorded: ${missing.join(", ") || "none"}; missing directories: ${stale.join(", ") || "none"})`,
    );
  return mapped.size;
}

async function verifyLocalFileRef(ref, repositoryRoot, entryId) {
  if (
    ref === null ||
    typeof ref !== "object" ||
    typeof ref.path !== "string" ||
    ref.path.length === 0 ||
    isAbsolute(ref.path) ||
    ref.path.split(/[\\/]/u).includes("..") ||
    !SHA256.test(ref.sha256 ?? "")
  )
    throw new Error(`Invalid exact file reference in ${entryId}`);

  const root = resolve(repositoryRoot);
  const absolutePath = resolve(root, ref.path);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`))
    throw new Error(`File reference escapes repository root: ${entryId}`);

  let bytes;
  try {
    const realRoot = await realpath(root);
    const realPath = await realpath(absolutePath);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${sep}`))
      throw new Error(`File reference resolves outside repository: ${entryId}`);
    bytes = await readFile(absolutePath);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("File reference resolves")
    )
      throw error;
    throw new Error(`Missing inventory file ${ref.path} (${entryId})`, {
      cause: error,
    });
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== ref.sha256)
    throw new Error(`SHA-256 mismatch for ${ref.path} (${entryId})`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  verifyThirdPartyDistributionInventory()
    .then(({ entries, redistributionApproved }) => {
      console.log(
        `Verified ${entries} third-party inventory entries; ${redistributionApproved} redistribution approvals meet the file/license/notice gate.`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
