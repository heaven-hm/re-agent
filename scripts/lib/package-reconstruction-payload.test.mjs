import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  reconstructionBenchmarkCatalog,
  requiredReconstructionPayload,
  verifyBenchmarkCatalogCoverage,
  verifyBenchmarkCatalogReferences,
  verifyReconstructionPayload,
} from "./package-reconstruction-payload.mjs";

test("accepts the checked in reconstruction source, evidence, and recipes", () => {
  const result = verifyReconstructionPayload(requiredReconstructionPayload);
  assert.equal(result.required, requiredReconstructionPayload.length);
  assert.equal(result.targets, 17);
  assert.ok(
    reconstructionBenchmarkCatalog.targets.some(
      (target) => target.id === "openlierox",
    ),
  );
  assert.ok(
    reconstructionBenchmarkCatalog.targets.some(
      (target) => target.id === "calculator",
    ),
  );
  for (const id of ["openlierox", "supertux", "powder-toy"]) {
    const target = reconstructionBenchmarkCatalog.targets.find(
      (candidate) => candidate.id === id,
    );
    assert.ok(target);
    assert.equal(target.status, "unverified");
    assert.ok(target.missingDeliverables.length >= 3);
  }
  assert.ok(
    requiredReconstructionPayload.includes("scripts/build-benchmarks.mjs"),
  );
  assert.ok(
    reconstructionBenchmarkCatalog.targets.every(
      (target) => target.report.length > 0 && Array.isArray(target.records),
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-windows-ports/notepad/manifest.json",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-batch-2/manifests/openlierox-acquisition.json",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-batch-2/reconstructed/fd/README.md",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-windows-ports/pixeltetris/replica/assets/tetrominoSprites.png",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/tictactoe/reconstructed/TicTacToe.Form1.resources",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/tictactoe/upstream-source-for-license.zip",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-windows-ports/tetris/replica/build.sh",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/plink/replica/goldens/plinkmac-golden-version.txt",
    ),
  );
});

test("catalogs finite ripgrep results without implying whole-application equivalence", () => {
  const ripgrep = reconstructionBenchmarkCatalog.targets.find(
    (target) => target.id === "ripgrep",
  );
  assert.ok(ripgrep);
  assert.equal(ripgrep.status, "partial");
  assert.equal(
    ripgrep.evidence.filter((path) => path.includes("reports/ripgrep/case-"))
      .length,
    8,
  );
  assert.ok(ripgrep.source.length > 0);
  assert.doesNotThrow(() =>
    verifyReconstructionPayload(requiredReconstructionPayload),
  );
});

test("records Batch 2 original PE identities without distributing the binaries", () => {
  const localOriginals = reconstructionBenchmarkCatalog.targets.flatMap(
    (target) => target.localOnlyOriginals ?? [],
  );
  assert.equal(localOriginals.length, 7);
  for (const original of localOriginals) {
    assert.match(original.sha256, /^[0-9a-f]{64}$/u);
    assert.ok(original.bytes > 0);
    assert.equal(original.distribution, "local-only-not-redistributed");
    assert.ok(["analysis-copy", "target-executable"].includes(original.role));
    assert.equal(original.architecture, "x86_64");
    assert.equal(original.format, "PE32+");
    assert.ok(original.path.startsWith("benchmarks/native-batch-2/originals/"));
    assert.ok(original.acquisitionManifest);
    assert.ok(!requiredReconstructionPayload.includes(original.path));
    if (existsSync(join(process.cwd(), original.path))) {
      const digest = createHash("sha256")
        .update(readFileSync(join(process.cwd(), original.path)))
        .digest("hex");
      assert.equal(digest, original.sha256, `${original.path} SHA-256`);
    }
    assert.throws(
      () =>
        verifyReconstructionPayload([
          ...requiredReconstructionPayload,
          original.path,
        ]),
      /private Batch 2 data/u,
    );
  }
});

test("catalogs every benchmark manifest, report, acquisition record, and build script", () => {
  const result = verifyBenchmarkCatalogCoverage(requiredReconstructionPayload);
  assert.equal(result.targets, 17);
  assert.equal(result.unlisted, 0);
  assert.ok(result.inventoryRecords >= 30);
});

test("every catalog reference resolves to a repository file", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
    /[\\/]+$/u,
    "",
  );
  const result = verifyBenchmarkCatalogReferences(
    (path) =>
      statSync(join(root, path), { throwIfNoEntry: false })?.isFile() ?? false,
  );
  assert.equal(result.targets, 17);
  assert.ok(result.references >= 100);
  assert.equal(result.missing, 0);
  assert.throws(
    () => verifyBenchmarkCatalogReferences(() => false),
    /Benchmark catalog references missing repository files/u,
  );
});

test("rejects a newly packaged benchmark record absent from the catalog", () => {
  assert.throws(
    () =>
      verifyBenchmarkCatalogCoverage([
        ...requiredReconstructionPayload,
        "benchmarks/new-game/manifest.json",
      ]),
    /Benchmark catalog omits repository records: benchmarks\/new-game\/manifest.json/u,
  );
});

test("catalog scan covers portable source languages and script recipes", () => {
  const candidates = [
    "benchmarks/new-game/replica/main.m",
    "benchmarks/new-app/replica/main.py",
    "benchmarks/new-app/replica/main.ts",
    "benchmarks/new-app/replica/main.go",
    "benchmarks/new-app/replica/run.ps1",
    "benchmarks/new-game/verify.py",
  ];
  for (const path of candidates) {
    assert.throws(
      () =>
        verifyBenchmarkCatalogCoverage([
          ...requiredReconstructionPayload,
          path,
        ]),
      /Benchmark catalog omits repository records/u,
    );
  }
});

test("repository scan finds no unlisted benchmark project records", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
    /[\\/]+$/u,
    "",
  );
  const discover = (directory) =>
    readdirSync(directory).flatMap((name) => {
      if ([".runtime-workers", "build", "node_modules"].includes(name))
        return [];
      const path = join(directory, name);
      if (statSync(path).isDirectory()) return discover(path);
      return [path.slice(root.length + 1).replaceAll("\\", "/")];
    });
  const inventoryPaths = discover(join(root, "benchmarks"));
  const result = verifyBenchmarkCatalogCoverage(inventoryPaths);
  assert.equal(result.unlisted, 0);
  assert.ok(result.inventoryRecords >= 30);
});

test("fails if a reconstructed application source is omitted", () => {
  assert.throws(
    () => verifyReconstructionPayload([]),
    /Package omitted reconstruction payload/u,
  );
});

test("rejects private original binaries and worker state", () => {
  assert.throws(
    () =>
      verifyReconstructionPayload([
        ...requiredReconstructionPayload,
        "benchmarks/native-batch-2/originals/fd/fd.exe",
      ]),
    /private Batch 2 data/u,
  );
});

test("rejects generated benchmark build directories from the package", () => {
  assert.throws(
    () =>
      verifyReconstructionPayload([
        ...requiredReconstructionPayload,
        "benchmarks/native-windows-ports/notepad/replica/build/module-cache/SwiftShims.pcm",
      ]),
    /generated benchmark build output/u,
  );
});

test("excludes private gconv analysis while retaining the public replica", () => {
  const gconv = reconstructionBenchmarkCatalog.targets.find(
    (target) => target.id === "gconv-qvm-toolchain",
  );
  assert.ok(gconv);
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-windows-ports/gconv/replica/qvmtool.c",
    ),
  );
  assert.ok(
    requiredReconstructionPayload.includes(
      "benchmarks/native-windows-ports/reports/targets/gconv.md",
    ),
  );
  assert.ok(requiredReconstructionPayload.includes(gconv.report));

  assert.throws(
    () =>
      verifyReconstructionPayload([
        ...requiredReconstructionPayload,
        "benchmarks/gconv/analysis-dll/gconvapi-function-0x10007070.json",
      ]),
    /private gconv analysis data/u,
  );
});

test("fails when any cataloged target evidence is missing from the package", () => {
  const packagedPaths = new Set(requiredReconstructionPayload);
  packagedPaths.delete(
    "benchmarks/native-batch-2/reports/openlierox/target-report.md",
  );
  assert.throws(
    () => verifyReconstructionPayload(packagedPaths),
    /Package omitted reconstruction payload/u,
  );
});
