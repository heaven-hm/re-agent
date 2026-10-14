#!/usr/bin/env node
/** Compare two ordered PNG frame captures with exact pixel evidence. */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve, basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { comparePngScreenshots } from "../dist/browser/PngVisualDiff.js";
import { createWebScreenshotArtifact } from "../dist/domain/webScreenshot.js";

const usage = () => {
  console.error(
    "Usage: node scripts/compare-game-frames.mjs <original-frame-dir> <replica-frame-dir> [--channel-threshold 0..255]\n" +
      "Each directory must contain PNG frames named identically (for example 000001.png). Frames are paired by filename.",
  );
  process.exitCode = 2;
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const listFrames = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
};

const main = async (args) => {
  if (args.length < 2 || args.length > 4) return usage();
  const [originalArg, replicaArg, ...options] = args;
  let threshold = 0;
  if (options.length > 0) {
    if (options.length !== 2 || options[0] !== "--channel-threshold")
      return usage();
    threshold = Number(options[1]);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255)
      return usage();
  }
  const originalDir = resolve(originalArg);
  const replicaDir = resolve(replicaArg);
  const [originalNames, replicaNames] = await Promise.all([
    listFrames(originalDir),
    listFrames(replicaDir),
  ]);
  const namesMatch =
    originalNames.length === replicaNames.length &&
    originalNames.every((name, index) => name === replicaNames[index]);
  const frameNames = [...new Set([...originalNames, ...replicaNames])].sort(
    (left, right) => left.localeCompare(right, "en", { numeric: true }),
  );
  const frames = [];
  for (const name of frameNames) {
    const originalPresent = originalNames.includes(name);
    const replicaPresent = replicaNames.includes(name);
    if (!originalPresent || !replicaPresent) {
      frames.push({
        frame: name,
        status: "missing_frame",
        original_present: originalPresent,
        replica_present: replicaPresent,
      });
      continue;
    }
    const [originalBytes, replicaBytes] = await Promise.all([
      readFile(join(originalDir, name)),
      readFile(join(replicaDir, name)),
    ]);
    const comparison = comparePngScreenshots({
      before: createWebScreenshotArtifact(originalBytes),
      after: createWebScreenshotArtifact(replicaBytes),
      channel_threshold: threshold,
    });
    const frameStatus =
      comparison.status === "identical" && threshold > 0
        ? "within_channel_threshold"
        : comparison.status;
    frames.push({
      frame: name,
      original_sha256: sha256(originalBytes),
      replica_sha256: sha256(replicaBytes),
      original_bytes: originalBytes.byteLength,
      replica_bytes: replicaBytes.byteLength,
      ...comparison,
      status: frameStatus,
    });
  }
  const pixelMatch =
    namesMatch &&
    frames.length > 0 &&
    frames.every(
      (frame) =>
        frame.status === "identical" ||
        (threshold > 0 && frame.status === "within_channel_threshold"),
    );
  const exact = pixelMatch && threshold === 0;
  const result = {
    schema_version: 1,
    comparison: "ordered-png-frame-sequence",
    status: exact
      ? "pixel_identical"
      : pixelMatch
        ? "within_channel_threshold"
        : "different_or_incomplete",
    original_directory: originalDir,
    replica_directory: replicaDir,
    original_frame_count: originalNames.length,
    replica_frame_count: replicaNames.length,
    frame_names_match: namesMatch,
    channel_threshold: threshold,
    exact_frame_sequence_match: exact,
    frames,
    limitations: [
      "Compares only the supplied PNG frames paired by filename; it does not establish identical gameplay, simulation state, audio, timing, input handling, or behavior outside these captured frames.",
      "A nonzero channel threshold deliberately permits pixel differences and cannot be reported as exact pixel identity.",
      "Capture resolution, color management, frame timing, and capture method must be controlled by the caller for meaningful cross-run comparisons.",
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!exact) process.exitCode = 1;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `${basename(process.argv[1] ?? "compare-game-frames.mjs")}: ${message}\n`,
    );
    process.exitCode = 2;
  });
}
