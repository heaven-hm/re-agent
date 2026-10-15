import { createPackageWithOptions } from "@electron/asar";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseApplicationGraphEvidence } from "../../src/application/javascript/JavaScriptApplicationEvidenceGraph.js";
import { AutonomousInvestigation } from "../../src/application/autonomy/AutonomousInvestigation.js";
import { runAutonomousPlan } from "../../src/composition/autonomy.js";
import { analyzeJavaScriptApplication } from "../support/javascriptApplicationScope.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("autonomous application artifact discovery", () => {
  it("analyzes declared app artifacts through the production plan workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "rea-autonomy-application-"));
    roots.push(root);
    const original = join(root, "original.cjs");
    const replica = join(root, "replica.cjs");
    await writeFile(original, "console.log(Number(process.argv[2]) * 2)");
    await writeFile(replica, "console.log(Number(process.argv[2]) * 2)");

    const applicationSource = join(root, "application");
    await mkdir(applicationSource);
    await writeFile(
      join(applicationSource, "main.mjs"),
      'import { helper } from "./helper.mjs";\nexport const value = helper();\n',
    );
    await writeFile(
      join(applicationSource, "helper.mjs"),
      "export const helper = () => 7;\n",
    );
    const applicationPath = join(root, "application.asar");
    await createPackageWithOptions(applicationSource, applicationPath, {
      unpack: "**/*.node",
    });
    const analysis = await analyzeJavaScriptApplication({
      input_path: applicationPath,
      format: "asar",
    });
    if (!analysis.ok) throw analysis.error;
    const parsedSource = parseApplicationGraphEvidence(analysis.value);
    if (!parsedSource.ok)
      throw new Error("Application Evidence must authenticate");

    const checkpoint = join(root, "checkpoint.json");
    const state = await runAutonomousPlan(
      {
        investigation: {
          binaryPath: process.execPath,
          workspace: root,
          original: { command: process.execPath, arguments: [original] },
          replica: { command: process.execPath, arguments: [replica] },
          cases: [{ id: "positive", arguments: ["2"] }],
          maxIterations: 1,
          timeoutMs: 5000,
          applicationArtifacts: [
            {
              path: applicationPath,
              sha256: parsedSource.value.rootArtifactSha256,
            },
          ],
        },
      },
      checkpoint,
    );
    expect(state.binarySha256).not.toBe(parsedSource.value.rootArtifactSha256);
    expect(state.version).toBe(2);
    expect(
      state.evidence.some(
        (item) => item.operation === "analyze_javascript_application",
      ),
    ).toBe(true);
    expect(state.behavioralGraph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "imports" }),
      ]),
    );

    const reopened = await AutonomousInvestigation.open(checkpoint);
    expect(reopened.state.version).toBe(2);
    expect(reopened.state.behavioralGraph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "imports" }),
      ]),
    );
    expect(await readFile(checkpoint, "utf8")).toContain(
      "applicationArtifacts",
    );
  });
});
