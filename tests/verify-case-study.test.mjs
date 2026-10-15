import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyCaseStudy } from "../scripts/verify-case-study.mjs";
const sha = x => createHash("sha256").update(x).digest("hex");
const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
async function fixture(change = x => x) {
  const root = await mkdtemp(join(tmpdir(), "re-agent-case-"));
  const a = Buffer.from("identical output"), b = Buffer.from("identical output");
  await writeFile(join(root, "a.out"), a);
  await writeFile(join(root, "b.out"), b);
  await writeFile(join(root, "a.png"), png);
  await writeFile(join(root, "b.png"), png);
  const d = {
    schema_version:1, title:"Test", license_spdx:"MIT",
    permission_reference:"local authored fixture", scope:"two executions",
    limitations:"one case", reproduction_command:"node run",
    original:{sha256:"a".repeat(64)}, candidate:{sha256:"b".repeat(64)},
    scenarios:[{id:"one",input_sha256:"c".repeat(64),status:"PASS",
      comparison_rules:"exact",
      original:{run_id:"original-1",platform:"linux",binary_sha256:"a".repeat(64),
        capture:{path:"a.out",sha256:sha(a)},screenshot:{path:"a.png",sha256:sha(png)}},
      candidate:{run_id:"candidate-1",platform:"linux",binary_sha256:"b".repeat(64),
        capture:{path:"b.out",sha256:sha(b)},screenshot:{path:"b.png",sha256:sha(png)}}}]
  };
  change(d);
  const path = join(root, "case.json");
  await writeFile(path, JSON.stringify(d));
  return {root,path};
}
test("accepts bound evidence", async t => {
  const {root,path} = await fixture();
  t.after(() => rm(root,{recursive:true,force:true}));
  assert.deepEqual(await verifyCaseStudy(path),{valid:true,scenarios:1,screenshot_pairs:1});
});
test("rejects reused run ID", async t => {
  const {root,path} = await fixture(d => d.scenarios[0].candidate.run_id="original-1");
  t.after(() => rm(root,{recursive:true,force:true}));
  await assert.rejects(verifyCaseStudy(path),/distinct/);
});
test("rejects unpaired screenshots", async t => {
  const {root,path} = await fixture(d => delete d.scenarios[0].candidate.screenshot);
  t.after(() => rm(root,{recursive:true,force:true}));
  await assert.rejects(verifyCaseStudy(path),/paired/);
});
test("rejects incorrect artifact hash", async t => {
  const {root,path} = await fixture(d => d.scenarios[0].original.capture.sha256="0".repeat(64));
  t.after(() => rm(root,{recursive:true,force:true}));
  await assert.rejects(verifyCaseStudy(path),/mismatch/);
});
test("rejects traversal", async t => {
  const {root,path} = await fixture(d => d.scenarios[0].candidate.capture.path="../secret");
  t.after(() => rm(root,{recursive:true,force:true}));
  await assert.rejects(verifyCaseStudy(path),/escapes/);
});

test("rejects false PASS claims with mismatched original and candidate observations", async t => {
  const {root,path} = await fixture();
  t.after(() => rm(root,{recursive:true,force:true}));
  const different = Buffer.from("different candidate output");
  await writeFile(join(root, "b.out"), different);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile(path, "utf8"));
  data.scenarios[0].candidate.capture.sha256 = sha(different);
  await writeFile(path, JSON.stringify(data));
  await assert.rejects(verifyCaseStudy(path), /PASS contradicts/u);
});
test("rejects unsupported PASS comparison semantics", async t => {
  const {root,path} = await fixture(d => d.scenarios[0].comparison_rules = "semantic");
  t.after(() => rm(root,{recursive:true,force:true}));
  await assert.rejects(verifyCaseStudy(path), /supported exact/u);
});
