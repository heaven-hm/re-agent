import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import inventory from "../../third_party/distribution-inventory.json" with { type: "json" };
import {
  verifyPackedThirdPartyDistribution,
  verifyThirdPartyDistributionInventory,
} from "./verify-third-party-distribution-inventory.mjs";

const temporaryRoots = [];
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const validEntry = (overrides = {}) => ({
  id: "fixture-tool",
  name: "Fixture Tool",
  version: "1.0.0",
  integration: "test-only",
  distribution: "npm-allowlisted",
  redistributionApproved: true,
  spdx: "MIT",
  licenseStatus: "verified",
  licenseEvidence: [{ path: "LICENSE", sha256: sha256("license") }],
  notices: [{ path: "NOTICE", sha256: sha256("notice") }],
  artifacts: [
    {
      fileName: "tool.bin",
      path: "tool.bin",
      sha256: sha256("binary"),
      availability: "local",
    },
  ],
  limitations: ["Fixture only"],
  ...overrides,
});

async function createFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "rea-third-party-inventory-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "LICENSE"), "license");
  await writeFile(join(root, "NOTICE"), "notice");
  await writeFile(join(root, "tool.bin"), "binary");
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("third-party distribution inventory gate", () => {
  it("validates the checked-in inventory and all local hashes", async () => {
    assert.deepEqual(await verifyThirdPartyDistributionInventory(inventory), {
      entries: inventory.entries.length,
      repositoryComponents: inventory.repositoryComponents.length,
      redistributionApproved: 0,
    });
  });

  it("accepts approval only with exact files, verified SPDX/license status, and notices", async () => {
    const root = await createFixtureRoot();
    assert.deepEqual(
      await verifyThirdPartyDistributionInventory(
        { schemaVersion: 1, entries: [validEntry()], repositoryComponents: [] },
        root,
      ),
      { entries: 1, repositoryComponents: 0, redistributionApproved: 1 },
    );
  });

  for (const [label, overrides] of [
    ["missing notices", { notices: [] }],
    ["unverified license", { licenseStatus: "incomplete" }],
    ["missing SPDX expression", { spdx: "NOASSERTION" }],
    [
      "external-only artifact",
      {
        artifacts: [
          {
            fileName: "tool.zip",
            sha256: sha256("zip"),
            sourceUrl: "https://example.test/tool.zip",
            availability: "external-release-record",
          },
        ],
      },
    ],
    ["no artifact", { artifacts: [] }],
  ])
    it(`rejects approved entries with ${label}`, async () => {
      const root = await createFixtureRoot();
      await assert.rejects(
        verifyThirdPartyDistributionInventory(
          {
            schemaVersion: 1,
            entries: [validEntry(overrides)],
            repositoryComponents: [],
          },
          root,
        ),
        /Redistribution approval lacks/u,
      );
    });

  it("rejects a changed local file hash even when redistribution is not approved", async () => {
    const root = await createFixtureRoot();
    await assert.rejects(
      verifyThirdPartyDistributionInventory(
        {
          schemaVersion: 1,
          entries: [
            validEntry({
              redistributionApproved: false,
              artifacts: [
                {
                  fileName: "tool.bin",
                  path: "tool.bin",
                  sha256: "0".repeat(64),
                  availability: "local",
                },
              ],
            }),
          ],
          repositoryComponents: [],
        },
        root,
      ),
      /SHA-256 mismatch/u,
    );
  });

  it("rejects local file references outside the repository root", async () => {
    const root = await createFixtureRoot();
    await assert.rejects(
      verifyThirdPartyDistributionInventory(
        {
          schemaVersion: 1,
          entries: [
            validEntry({
              redistributionApproved: false,
              licenseEvidence: [
                { path: "../outside", sha256: sha256("license") },
              ],
            }),
          ],
          repositoryComponents: [],
        },
        root,
      ),
      /Invalid exact file reference/u,
    );
  });

  it("rejects npm package contents that include an unapproved local artifact", () => {
    assert.throws(
      () =>
        verifyPackedThirdPartyDistribution(
          ["package/third_party/fixture/tool.bin"],
          {
            schemaVersion: 1,
            entries: [
              validEntry({
                redistributionApproved: false,
                artifacts: [
                  {
                    fileName: "tool.bin",
                    path: "third_party/fixture/tool.bin",
                    sha256: sha256("binary"),
                    availability: "local",
                  },
                ],
              }),
            ],
            repositoryComponents: [],
          },
        ),
      /included unapproved local tool artifact/u,
    );
  });

  it("rejects common binary and archive formats absent from the inventory", () => {
    for (const name of [
      "new-tool.zip",
      "libnew-tool.so.1.4",
      "new-tool.tar.xz",
      "new-tool.tgz",
      "new-tool.dmg",
      "new-tool.msi",
      "new-tool.apk",
    ])
      assert.throws(
        () =>
          verifyPackedThirdPartyDistribution(
            [`package/third_party/new-tool/${name}`],
            { schemaVersion: 1, entries: [] },
          ),
        /unrecorded third-party artifact/u,
        name,
      );
  });

  it("rejects a source-tree third-party directory without a component record", async () => {
    const root = await createFixtureRoot();
    const directory = join(root, "third_party", "new-tool");
    await mkdir(directory, { recursive: true });
    await assert.rejects(
      verifyThirdPartyDistributionInventory(
        { schemaVersion: 1, entries: [], repositoryComponents: [] },
        root,
      ),
      /unrecorded: third_party\/new-tool/u,
    );
  });

  it("rejects packaged documentation under an unrecorded third-party component", () => {
    assert.throws(
      () =>
        verifyPackedThirdPartyDistribution(
          ["package/third_party/new-tool/README.md"],
          { schemaVersion: 1, entries: [], repositoryComponents: [] },
        ),
      /unrecorded third-party component third_party\/new-tool/u,
    );
  });

  it("checks local package contents for approved artifacts and every proof file", () => {
    const entry = validEntry({
      artifacts: [
        {
          fileName: "tool.bin",
          path: "third_party/fixture/tool.bin",
          sha256: sha256("binary"),
          availability: "local",
        },
      ],
      licenseEvidence: [
        {
          path: "third_party/fixture/LICENSE",
          sha256: sha256("license"),
        },
      ],
      notices: [
        { path: "third_party/fixture/NOTICE", sha256: sha256("notice") },
      ],
    });
    const candidate = { schemaVersion: 1, entries: [entry] };
    candidate.repositoryComponents = [
      { path: "third_party/fixture", entryId: "fixture-tool" },
    ];
    const localPackageFiles = [
      "package/third_party/fixture/tool.bin",
      "package/third_party/fixture/LICENSE",
      "package/third_party/fixture/NOTICE",
    ];
    assert.doesNotThrow(() =>
      verifyPackedThirdPartyDistribution(localPackageFiles, candidate),
    );
    assert.throws(
      () =>
        verifyPackedThirdPartyDistribution(
          localPackageFiles.slice(0, 2),
          candidate,
        ),
      /omitted redistribution proof/u,
    );
  });
});
