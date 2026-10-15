import { describe, expect } from "vitest";
import { inspectBundleKeyedArchive } from "../../../src/artifacts/apple/KeyedArchiveReader.js";
import { keyedArchiveResultSchema } from "../../../src/domain/apple/keyedArchive.js";
import { parseEvidence } from "../../../src/domain/evidence.js";
import {
  keyedArchiveIntegerFormats,
  keyedArchiveIntegerCases,
  keyedArchiveIntegerFixtures,
  expectKeyedArchiveIntegerCase,
  type KeyedArchiveIntegerFixtures,
} from "../../fixtures/keyedArchiveIntegers.js";
import { cliTest } from "../../support/cli/cliFixture.js";
import {
  createTestWorkspace,
  removeTestWorkspace,
} from "../../support/workspace/workspaceFixture.js";

const archiveTest = cliTest.extend<{
  $worker: { keyedArchiveIntegerArchives: KeyedArchiveIntegerFixtures };
}>({
  keyedArchiveIntegerArchives: [
    // oxlint-disable-next-line no-empty-pattern -- Vitest parses fixture dependencies from object destructuring.
    async ({}, use) => {
      const workspace = await createTestWorkspace("rea-keyed-integers-");
      try {
        await use(await keyedArchiveIntegerFixtures(workspace.root));
      } finally {
        await removeTestWorkspace(workspace.root);
      }
    },
    { scope: "worker" },
  ],
});

const cases = keyedArchiveIntegerFormats.flatMap((format) =>
  keyedArchiveIntegerCases.map((selectedCase) => ({ format, selectedCase })),
);
// Selected by the existing required native keyed-archive verifier, not Linux skips.
describe.skipIf(process.platform !== "darwin")(
  "Foundation archive integer precision",
  () => {
    archiveTest.for(cases)(
      "filesystem preserves $format $selectedCase numeric meaning",
      async ({ format, selectedCase }, { keyedArchiveIntegerArchives }) => {
        const fixture = keyedArchiveIntegerArchives[format];
        const result = await inspectBundleKeyedArchive({
          bundlePath: fixture.root,
          targetSha256: fixture.digest,
          parameters: { path: fixture.selected.filename, limit: 100 },
        });
        expectKeyedArchiveIntegerCase(
          result,
          selectedCase,
          fixture.selected,
          fixture.digest,
        );
      },
    );
    archiveTest.for(cases)(
      "built CLI preserves $format $selectedCase numeric meaning",
      async (
        { format, selectedCase },
        { cli, keyedArchiveIntegerArchives },
      ) => {
        const fixture = keyedArchiveIntegerArchives[format];
        const output = await cli.run({
          arguments: ["inspect-keyed-archive", fixture.archivePath, "--json"],
          environment: {
            REA_LOG_LEVEL: "silent",
            REA_ANALYSIS_PROVIDER: "auto",
          },
        });
        expect(output.exitCode).toBe(0);
        const result = keyedArchiveResultSchema.parse(
          parseEvidence(output.json).normalized_result,
        );
        expectKeyedArchiveIntegerCase(
          result,
          selectedCase,
          fixture.selected,
          fixture.digest,
        );
      },
    );
  },
);
