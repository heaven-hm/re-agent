import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, onTestFinished } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../../src/server/createServer.js";
import { createTestBinarySession } from "../fixtures/binarySession.js";
import { createTestTempDirectory } from "../fixtures/temporaryDirectory.js";
import { cliTest } from "../support/cli/cliFixture.js";

cliTest(
  "autonomy CLI executes identical cases and MCP exposes persisted evidence and resume",
  async ({ cli }) => {
    const root = await createTestTempDirectory("rea-autonomy-cli-");
    const script = join(root, "original.cjs");
    await writeFile(script, "console.log(Number(process.argv[2])*7)");
    const plan = join(root, "plan.json");
    const checkpoint = join(root, "checkpoint.json");
    await writeFile(
      plan,
      JSON.stringify({
        investigation: {
          binaryPath: process.execPath,
          workspace: root,
          original: { command: process.execPath, arguments: [script] },
          replica: { command: process.execPath, arguments: [script] },
          cases: [{ id: "negative", arguments: ["-3"] }],
          dimensions: ["terminal"],
          maxIterations: 1,
          timeoutMs: 30_000,
        },
      }),
    );
    const run = await cli.run({
      arguments: ["autonomy-run", plan, checkpoint, "--json"],
      timeoutMs: 90_000,
    });
    expect(run.exitCode, JSON.stringify(run)).toBe(0);
    expect(run.json).toMatchObject({
      status: "suite-passed",
      iteration: 1,
      results: [{ caseId: "negative", status: "pass" }],
      behavioral_graph: expect.objectContaining({
        schema_version: 1,
        target_sha256: expect.any(String),
        graph_sha256: expect.any(String),
        node_count: expect.any(Number),
        edge_count: expect.any(Number),
      }),
    });
    const resumed = await cli.run({
      arguments: ["autonomy-run", plan, checkpoint, "--resume", "--json"],
      timeoutMs: 30_000,
    });
    expect(resumed.exitCode, resumed.stderr).toBe(0);
    expect(resumed.json).toMatchObject({
      status: "suite-passed",
      iteration: 1,
    });
    const session = createTestBinarySession(() => {
      throw new Error("Status must not open a binary provider");
    });
    const server = createServer({ kind: "session", session });
    const client = new Client({ name: "autonomy-acceptance", version: "1" });
    onTestFinished(async () => {
      await client.close();
      await server.close();
      await session.close();
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: "autonomous_investigation",
      arguments: { action: "status", checkpoint },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      result: {
        status: "suite-passed",
        evidence: expect.arrayContaining([
          expect.objectContaining({ operation: "compare_process_captures" }),
        ]),
        behavioralGraph: expect.objectContaining({
          schemaVersion: 1,
          targetSha256: expect.any(String),
          evidenceIds: expect.any(Array),
        }),
      },
    });
    const saved = JSON.parse(await readFile(checkpoint, "utf8")) as {
      evidence: unknown[];
      behavioralGraph: {
        evidenceIds: string[];
        targetSha256: string;
        coverage: Array<{ facet: string; status: string; omitted: number }>;
      };
    };
    expect(saved.evidence.length).toBeGreaterThanOrEqual(3);
    expect(saved.behavioralGraph.evidenceIds.length).toBeGreaterThan(0);
    expect(saved.behavioralGraph.targetSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(saved.behavioralGraph.coverage).toContainEqual(
      expect.objectContaining({
        facet: "evidence:non-target",
        status: "partial",
      }),
    );
    expect(
      saved.behavioralGraph.evidenceIds.every((id) =>
        (saved.evidence as Array<{ evidence_id: string }>).some(
          (item) => item.evidence_id === id,
        ),
      ),
    ).toBe(true);
  },
  120_000,
);
