import benchmarkCatalog from "../../benchmarks/catalog.json" with { type: "json" };

export const reconstructionBenchmarkCatalog = benchmarkCatalog;

export function verifyBenchmarkCatalogReferences(pathExists) {
  if (typeof pathExists !== "function")
    throw new TypeError("Benchmark catalog path verifier must be a function");
  const references = [
    ...new Set(
      benchmarkCatalog.targets.flatMap((target) => [
        ...(target.originals ?? []),
        ...target.source,
        ...(target.records ?? []),
        ...(target.buildInputs ?? []),
        ...(target.runtimeAssets ?? []),
        ...target.artifacts,
        ...target.evidence,
        target.report,
      ]),
    ),
  ];
  const missing = references.filter((path) => !pathExists(path)).sort();
  if (missing.length > 0)
    throw new Error(
      `Benchmark catalog references missing repository files: ${missing.join(", ")}`,
    );
  return {
    targets: benchmarkCatalog.targets.length,
    references: references.length,
    missing: 0,
  };
}

const catalogPayloadPaths = [
  "benchmarks/catalog.json",
  ...benchmarkCatalog.targets.flatMap((target) => [
    ...(target.originals ?? []),
    ...target.source,
    ...(target.records ?? []),
    ...(target.buildInputs ?? []),
    ...(target.runtimeAssets ?? []),
    ...target.artifacts,
    ...target.evidence,
    target.report,
  ]),
];

export const requiredReconstructionPayload = [
  ...new Set([
    ...catalogPayloadPaths,
    "scripts/build-benchmarks.mjs",
    "scripts/verify-calculator-reconstruction.mjs",
    "docs/autonomous-reconstruction-benchmark.md",
    "scripts/recover-tictactoe-replica.mjs",
    "scripts/verify-tictactoe-reconstruction.mjs",
    "benchmarks/tictactoe/LICENSE",
    "benchmarks/native-windows-ports/pixeltetris/replica/assets/OFL.txt",
  ]),
];

const catalogCoveragePaths = new Set(
  benchmarkCatalog.targets.flatMap((target) => [
    ...(target.originals ?? []),
    ...target.source,
    ...target.artifacts,
    ...target.evidence,
    ...(target.records ?? []),
    ...(target.buildInputs ?? []),
    ...(target.runtimeAssets ?? []),
    ...(target.localOnlyOriginals ?? []).map((original) => original.path),
    target.report,
  ]),
);

function isBenchmarkInventoryRecord(path) {
  return (
    /^benchmarks\/.*\/manifest\.json$/u.test(path) ||
    /^benchmarks\/native-batch-2\/originals\/.*\.exe$/iu.test(path) ||
    /^benchmarks\/(?:.*\/)?(?:original|original-binaries)\/.*\.(?:exe|dll)$/iu.test(
      path,
    ) ||
    /^benchmarks\/.*\/target-report\.md$/u.test(path) ||
    /^benchmarks\/.*\/screenshots\/.*\.png$/iu.test(path) ||
    /^benchmarks\/native-windows-ports\/reports\/targets\/(?!README\.md$)[^/]+\.md$/u.test(
      path,
    ) ||
    /^benchmarks\/.*\/(?:replica|reconstructed)\/.*\.(?:c|cc|cpp|h|hh|hpp|m|mm|cs|fs|vb|swift|rs|go|java|kt|kts|py|js|jsx|mjs|cjs|ts|tsx)$/iu.test(
      path,
    ) ||
    /^benchmarks\/.*\/(?:build|test|verify|run)\.(?:sh|bash|zsh|py|js|mjs|cjs|ps1|cmd|bat)$/iu.test(
      path,
    ) ||
    /^benchmarks\/.*\/(?:replica|reconstructed)\/.*\.(?:sh|bash|zsh|ps1|cmd|bat)$/iu.test(
      path,
    ) ||
    /^benchmarks\/native-batch-2\/manifests\/.*-acquisition\.json$/u.test(path)
  );
}

export function verifyBenchmarkCatalogCoverage(packagedPaths) {
  const paths =
    packagedPaths instanceof Set ? packagedPaths : new Set(packagedPaths);
  const unlisted = [...paths]
    .filter(isBenchmarkInventoryRecord)
    .filter((path) => !catalogCoveragePaths.has(path))
    .sort();
  if (unlisted.length > 0)
    throw new Error(
      `Benchmark catalog omits repository records: ${unlisted.join(", ")}`,
    );
  return {
    targets: benchmarkCatalog.targets.length,
    inventoryRecords: [...paths].filter(isBenchmarkInventoryRecord).length,
    unlisted: 0,
  };
}

function verifyNoPrivateBenchmarkInputs(paths) {
  const privateGconvPath = [...paths].find((path) =>
    path.startsWith("benchmarks/gconv/"),
  );
  if (privateGconvPath !== undefined)
    throw new Error(
      `Package included private gconv analysis data: ${privateGconvPath}`,
    );

  const privatePath = [...paths].find((path) =>
    /^benchmarks\/native-batch-2\/(?:originals\/|\.runtime-workers\/|logs\/(?:runtime|checkpoints)\/)/u.test(
      path,
    ),
  );
  if (privatePath !== undefined)
    throw new Error(`Package included private Batch 2 data: ${privatePath}`);

  const localOnlyOriginal = benchmarkCatalog.targets
    .flatMap((target) => target.localOnlyOriginals ?? [])
    .find((original) => paths.has(original.path));
  if (localOnlyOriginal !== undefined)
    throw new Error(
      `Package included local-only original binary: ${localOnlyOriginal.path}`,
    );

  const generatedBuildPath = [...paths].find((path) =>
    /^benchmarks\/.*\/build\//u.test(path),
  );
  if (generatedBuildPath !== undefined)
    throw new Error(
      `Package included generated benchmark build output: ${generatedBuildPath}`,
    );
}

function isInvalidCatalogEntry(target) {
  return (
    !["software", "game"].includes(target.kind) ||
    !["feature-pass", "partial", "unverified"].includes(target.status) ||
    (target.originals !== undefined &&
      (!Array.isArray(target.originals) ||
        target.originals.some((path) => typeof path !== "string"))) ||
    (target.records !== undefined &&
      (!Array.isArray(target.records) ||
        target.records.some((path) => typeof path !== "string"))) ||
    (target.missingDeliverables !== undefined &&
      (!Array.isArray(target.missingDeliverables) ||
        target.missingDeliverables.some((item) => typeof item !== "string"))) ||
    (target.localOnlyOriginals !== undefined &&
      (!Array.isArray(target.localOnlyOriginals) ||
        target.localOnlyOriginals.some(
          (original) =>
            typeof original !== "object" ||
            original === null ||
            typeof original.path !== "string" ||
            !original.path.startsWith("benchmarks/native-batch-2/originals/") ||
            !/^[0-9a-f]{64}$/u.test(original.sha256) ||
            !Number.isSafeInteger(original.bytes) ||
            original.bytes < 1 ||
            original.distribution !== "local-only-not-redistributed" ||
            !["analysis-copy", "target-executable"].includes(original.role) ||
            original.architecture !== "x86_64" ||
            original.format !== "PE32+" ||
            typeof original.acquisitionManifest !== "string" ||
            !original.acquisitionManifest.startsWith(
              "benchmarks/native-batch-2/manifests/",
            ),
        ))) ||
    (target.status !== "unverified" &&
      target.source.length + target.artifacts.length === 0)
  );
}

export function verifyReconstructionPayload(packagedPaths) {
  const paths =
    packagedPaths instanceof Set ? packagedPaths : new Set(packagedPaths);

  verifyNoPrivateBenchmarkInputs(paths);

  const ids = new Set();
  for (const target of benchmarkCatalog.targets) {
    if (ids.has(target.id))
      throw new Error(`Duplicate benchmark catalog id: ${target.id}`);
    ids.add(target.id);
    if (isInvalidCatalogEntry(target))
      throw new Error(`Invalid reconstruction catalog entry: ${target.id}`);
  }
  const missing = requiredReconstructionPayload.filter(
    (path) => !paths.has(path),
  );
  if (missing.length > 0)
    throw new Error(
      `Package omitted reconstruction payload: ${missing.join(", ")}`,
    );

  const catalogCoverage = verifyBenchmarkCatalogCoverage(paths);

  return {
    required: requiredReconstructionPayload.length,
    targets: benchmarkCatalog.targets.length,
    privateInputs: 0,
    catalogCoverage,
  };
}
