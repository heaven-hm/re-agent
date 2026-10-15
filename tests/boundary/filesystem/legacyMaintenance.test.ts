import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { discoverMaintenanceSkills } from "../../../src/application/maintenance/SkillCatalog.js";
import {
  inspectMemorySnapshotPattern,
  prepareLegacyMaintenance,
  admitLegacyControllerPlan,
} from "../../../src/application/maintenance/LegacyMaintenance.js";

const bundled = fileURLToPath(
  new URL("../../../maintenance-skills/", import.meta.url),
);
const cleanup: string[] = [];
const temporary = async () => {
  const root = await mkdtemp(join(tmpdir(), "re-agent-maintenance-"));
  cleanup.push(root);
  return root;
};
afterEach(async () => {
  for (const path of cleanup.splice(0))
    await rm(path, { recursive: true, force: true });
});

it("prepares all maintenance stages from shipped skills and hashes the actual target without executing it", async () => {
  const root = await temporary();
  const target = join(root, "original.bin");
  await writeFile(target, Buffer.from([0x4d, 0x5a, 0, 1]));
  const request = join(root, "request.json");
  await writeFile(
    request,
    JSON.stringify({
      schema_version: 1,
      target_path: target,
      target_kind: "game",
      target_platform: "macos",
      support_status: "unsupported",
      support_evidence: ["test fixture, no vendor support"],
      authorization: { basis: "owner", reference: "test fixture owner" },
      goal: "Test the planner",
      max_repair_iterations: 2,
    }),
  );
  const before = await readFile(target);
  const result = await prepareLegacyMaintenance(request, [bundled]);
  expect(result.status).toBe("READY_FOR_HOST_AGENT");
  expect(result.verification_status).toBe("UNVERIFIED");
  expect(result.stages).toHaveLength(7);
  expect(result.stages.every((stage) => stage.skills.length > 0)).toBe(true);
  expect(result.target.sha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(
    result.catalog.skills.every(
      (skill) => skill.instructions_sha256.length === 64,
    ),
  ).toBe(true);
  expect(await readFile(target)).toEqual(before);
  const plan = {
    investigation: {
      binaryPath: target,
      workspace: join(root, "replica"),
      original: { command: target },
      replica: { command: join(root, "replica", "rebuilt") },
      maxIterations: 2,
      cases: [{ id: "startup", arguments: [] }],
    },
  };
  expect(admitLegacyControllerPlan(result, plan).investigation.binaryPath).toBe(
    target,
  );
  expect(() =>
    admitLegacyControllerPlan(result, {
      investigation: {
        ...plan.investigation,
        binaryPath: join(root, "unauthorized"),
      },
    }),
  ).toThrow(/authorized maintenance target/u);
  expect(() =>
    admitLegacyControllerPlan(result, {
      investigation: { ...plan.investigation, maxIterations: 3 },
    }),
  ).toThrow(/repair budget/u);
});

it("ships the documented nine maintenance skills with valid manifests and covered stages", async () => {
  const catalog = await discoverMaintenanceSkills([bundled]);
  expect(catalog.status).toBe("VALID");
  expect(catalog.rejected).toEqual([]);
  expect(catalog.executes_skill_code).toBe(false);
  expect(catalog.skills.map((skill) => skill.id).sort()).toEqual([
    "legacy-bug-repair",
    "legacy-cross-platform-port",
    "legacy-port-verification",
    "legacy-release-review",
    "legacy-repair-port",
    "legacy-rights-provenance",
    "legacy-runtime-memory",
    "legacy-static-diagnosis",
    "legacy-triage",
  ]);
  for (const stage of [
    "triage",
    "static-analysis",
    "runtime-analysis",
    "memory-analysis",
    "repair-and-port",
    "verification",
    "release",
  ]) {
    expect(catalog.skills.some((skill) => skill.stages.includes(stage as (typeof catalog.skills)[number]["stages"][number]))).toBe(true);
  }
  for (const skill of catalog.skills) {
    expect(skill.manifest_sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(skill.instructions_sha256).toMatch(/^[a-f0-9]{64}$/u);
  }
});

it("discovers an added skill without registration and rejects executable manifest fields", async () => {
  const root = await temporary();
  const base = JSON.parse(
    await readFile(join(bundled, "legacy-triage", "skill.json"), "utf8"),
  );
  const skill = join(root, "community-triage");
  await mkdir(skill);
  base.id = "community-triage";
  await writeFile(
    join(skill, "SKILL.md"),
    "---\nname: community-triage\ndescription: Fixture\n---\nInspect only.\n",
  );
  await writeFile(join(skill, "skill.json"), JSON.stringify(base));
  const found = await discoverMaintenanceSkills([root]);
  expect(found.skills.map((value) => value.id)).toEqual(["community-triage"]);
  expect(found.executes_skill_code).toBe(false);
  await writeFile(
    join(skill, "skill.json"),
    JSON.stringify({ ...base, command: "untrusted-script" }),
  );
  const rejected = await discoverMaintenanceSkills([root]);
  expect(rejected.status).toBe("INCOMPLETE");
  expect(rejected.skills).toHaveLength(0);
  expect(rejected.rejected).toHaveLength(1);
});

it("rejects ambiguous skill IDs instead of allowing community override", async () => {
  const root = await temporary();
  for (const name of ["first", "second"]) {
    const path = join(root, name);
    await mkdir(path);
    for (const file of ["skill.json", "SKILL.md"])
      await writeFile(
        join(path, file),
        await readFile(join(bundled, "legacy-triage", file)),
      );
  }
  const result = await discoverMaintenanceSkills([root]);
  expect(result.status).toBe("INCOMPLETE");
  expect(result.skills).toHaveLength(0);
  expect(result.rejected).toHaveLength(2);
});

it("does not accept a frontmatter name supplied only in the document body", async () => {
  const root = await temporary();
  const path = join(root, "test");
  await mkdir(path);
  await writeFile(
    join(path, "skill.json"),
    await readFile(join(bundled, "legacy-triage", "skill.json")),
  );
  await writeFile(
    join(path, "SKILL.md"),
    "---\ndescription: Fixture\n---\nname: legacy-triage\n",
  );
  expect((await discoverMaintenanceSkills([root])).skills).toHaveLength(0);
});

it.skipIf(process.platform === "win32")(
  "rejects symbolic community skill roots",
  async () => {
    const root = await temporary();
    const link = join(root, "linked");
    await symlink(bundled, link);
    expect((await discoverMaintenanceSkills([link])).status).toBe("INCOMPLETE");
  },
);

it("reports truncated buffer searches and rejects invalid patterns without broadening them", async () => {
  const root = await temporary();
  const path = join(root, "memory.bin");
  await writeFile(
    path,
    Buffer.from([0x48, 0x8b, 0x01, 0x90, 0x48, 0x8b, 0x02, 0x90]),
  );
  const all = await inspectMemorySnapshotPattern(path, "48 8B ?? 90", 2);
  expect(all.status).toBe("COMPLETE");
  expect(all.match_offsets).toEqual([0, 4]);
  const limited = await inspectMemorySnapshotPattern(path, "48 8B ?? 90", 1);
  expect(limited.status).toBe("PARTIAL");
  expect(limited.match_offsets).toEqual([0]);
  for (const pattern of ["48 ZZ", "1FF", "?? ??", "48 8Btrailing", ""])
    await expect(
      inspectMemorySnapshotPattern(path, pattern, 2),
    ).rejects.toThrow();
});

it("rejects a request lacking explicit support scope and authorization", async () => {
  const root = await temporary();
  const path = join(root, "request.json");
  await writeFile(
    path,
    JSON.stringify({ schema_version: 1, target_path: "/missing" }),
  );
  await expect(prepareLegacyMaintenance(path, [bundled])).rejects.toThrow();
});
