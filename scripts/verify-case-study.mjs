import { readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, relative, isAbsolute, sep } from "node:path";

const fail = (message) => { throw new Error(message); };
const hex = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const requiredString = (v, k) => typeof v === "string" && v.trim() ? v : fail(`Missing ${k}`);
async function checkArtifact(root, item, label) {
  const raw = requiredString(item?.path, `${label}.path`);
  if (isAbsolute(raw)) fail(`${label} must be relative`);
  const path = resolve(root, raw);
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
    fail(`${label} escapes case study root`);
  const st = await lstat(path);
  if (!st.isFile() || st.isSymbolicLink()) fail(`${label} must be regular file`);
  const bytes = await readFile(path);
  if (!hex(item.sha256)) fail(`${label} needs SHA-256`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== item.sha256) fail(`${label} SHA-256 mismatch`);
  if (label.includes("screenshot") && !(bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))))
    fail(`${label} is not a PNG`);
  return { path, bytes: bytes.length };
}
export async function verifyCaseStudy(manifestPath) {
  const root = dirname(resolve(manifestPath));
  const doc = JSON.parse(await readFile(manifestPath, "utf8"));
  if (doc.schema_version !== 1) fail("Unsupported schema_version");
  for (const key of ["title", "license_spdx", "permission_reference", "scope", "limitations", "reproduction_command"])
    requiredString(doc[key], key);
  if (!Array.isArray(doc.scenarios) || doc.scenarios.length === 0)
    fail("At least one scenario required");
  if (!hex(doc.original?.sha256) || !hex(doc.candidate?.sha256))
    fail("Original/candidate SHA-256 required");
  const runIds = new Set();
  let screenshotPairs = 0;
  for (const scenario of doc.scenarios) {
    requiredString(scenario.id, "scenario.id");
    if (!hex(scenario.input_sha256)) fail("Input SHA-256 invalid");
    const a = scenario.original, b = scenario.candidate;
    for (const [kind, entry] of [["original", a], ["candidate", b]]) {
      requiredString(entry?.run_id, `${kind}.run_id`);
      if (runIds.has(entry.run_id)) fail("Execution run IDs must be distinct");
      runIds.add(entry.run_id);
      requiredString(entry?.platform, `${kind}.platform`);
      if (entry.binary_sha256 !== doc[kind].sha256)
        fail(`${kind} run binary mismatch`);
      await checkArtifact(root, entry.capture, `${kind}.capture`);
    }
    if (a.screenshot || b.screenshot) {
      if (!a.screenshot || !b.screenshot) fail("Screenshot evidence must be paired");
      await checkArtifact(root, a.screenshot, "original.screenshot");
      await checkArtifact(root, b.screenshot, "candidate.screenshot");
      screenshotPairs++;
    }
    if (!["PASS", "FAIL", "INCONCLUSIVE"].includes(scenario.status))
      fail("Invalid status");
    if (scenario.status === "PASS" && !scenario.comparison_rules)
      fail("PASS requires comparison_rules");
  }
  return { valid: true, scenarios: doc.scenarios.length, screenshot_pairs: screenshotPairs };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try { console.log(JSON.stringify(await verifyCaseStudy(process.argv[2]))); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
