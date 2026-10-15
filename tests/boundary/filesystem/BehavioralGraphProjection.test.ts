import { describe, expect, it } from "vitest";

import { createEvidence, type Evidence } from "../../../src/domain/evidence.js";
import { parseApplicationGraphEvidence } from "../../../src/application/javascript/JavaScriptApplicationEvidenceGraph.js";
import { analyzeJavaScriptApplication } from "../../support/javascriptApplicationScope.js";
import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { writeFixtureFiles } from "../../support/javascriptApplicationFixture.js";
import {
  BEHAVIORAL_GRAPH_MAX_EDGES,
  BEHAVIORAL_GRAPH_MAX_NODES,
} from "../../../src/domain/reconstruction/BehavioralEvidenceGraph.js";
import {
  projectEvidenceToBehavioralGraph,
  type BehavioralEvidenceProjectionInput,
} from "../../../src/application/investigation/BehavioralGraphProjection.js";

const sha = "a".repeat(64);
const target = {
  path: "/tmp/fixture.bin",
  sha256: sha,
  format: "elf" as const,
};
const provider = { id: "fixture", name: "Fixture Provider", version: "1" };
const evidence = (value: string) =>
  createEvidence(target, provider, {
    operation: "inspect_fixture",
    parameters: {},
    result: { value },
    confidence: "observed",
  });

describe("behavioral evidence projection", () => {
  it("imports only exact-binary Evidence and keeps deterministic references", () => {
    const record = evidence("one");
    const input: BehavioralEvidenceProjectionInput = {
      records: [record],
      nativeGraphs: [],
      applicationSources: [],
    };
    const graph = projectEvidenceToBehavioralGraph(sha, input);
    expect(graph.targetSha256).toBe(sha);
    expect(graph.evidenceIds).toEqual([record.evidence_id]);
    expect(graph.nodes[0]?.evidenceIds).toEqual([record.evidence_id]);
    expect(
      projectEvidenceToBehavioralGraph(sha, {
        ...input,
        records: [record, record],
      }),
    ).toEqual(graph);
  });

  it("rejects a mismatched target and dangling Evidence links", () => {
    const record = evidence("one");
    expect(() =>
      projectEvidenceToBehavioralGraph("c".repeat(64), {
        records: [record],
        nativeGraphs: [],
        applicationSources: [],
      }),
    ).toThrow(/target hash/iu);
    const linked = createEvidence(target, provider, {
      operation: "linked_fixture",
      parameters: {},
      result: { value: "two" },
      evidenceLinks: [`ev_${"e".repeat(64)}`],
    });
    const graph = projectEvidenceToBehavioralGraph(sha, {
      records: [linked],
      nativeGraphs: [],
      applicationSources: [],
    });
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      to: null,
      resolution: "unresolved",
    });
  });

  it("rejects a conflicting duplicate Evidence ID rather than accepting overwritten content", () => {
    const record = evidence("one");
    expect(() =>
      projectEvidenceToBehavioralGraph(sha, {
        records: [
          record,
          { ...record, normalized_result: { value: "tampered" } },
        ],
        nativeGraphs: [],
        applicationSources: [],
      }),
    ).toThrow();
  });

  it("fails before materializing projected nodes or edges past the graph budgets", () => {
    const oversizedRecords = new Array(
      BEHAVIORAL_GRAPH_MAX_NODES + 1,
    ) as Evidence[];
    expect(() =>
      projectEvidenceToBehavioralGraph(sha, {
        records: oversizedRecords,
        nativeGraphs: [],
        applicationSources: [],
      }),
    ).toThrow(/node budget/iu);
    const record = evidence("one");
    const oversizedEdges = {
      ...record,
      evidence_links: new Array(BEHAVIORAL_GRAPH_MAX_EDGES + 1).fill(
        record.evidence_id,
      ),
    } as Evidence;
    expect(() =>
      projectEvidenceToBehavioralGraph(sha, {
        records: [oversizedEdges],
        nativeGraphs: [],
        applicationSources: [],
      }),
    ).toThrow(/edge budget/iu);
  });

  it("retains missing source identity and location uncertainty as coverage", () => {
    const evidenceWithoutSubject = createEvidence(undefined, provider, {
      operation: "observe_without_target",
      parameters: {},
      result: { value: true },
      subjectUnavailableReason: "target unavailable",
    }) as Evidence;
    expect(() =>
      projectEvidenceToBehavioralGraph(sha, {
        records: [evidenceWithoutSubject],
        nativeGraphs: [],
        applicationSources: [],
      }),
    ).toThrow(/target hash/iu);
  });
});

describe("behavioral evidence source projections", () => {
  it("records native graph input as a provenance gap when its facts lack Evidence IDs", () => {
    const record = evidence("native target");
    const nativeGraph = {
      target_sha256: sha,
      provider: { id: "ghidra", version: "12", tool_version: "12.1" },
      nodes: [
        {
          id: "native-function-1",
          kind: "function" as const,
          name: "entry",
          location: { address: "0x1000", file_offset: null },
          attributes: {},
          evidence: [
            {
              kind: "symbol" as const,
              description: "provider symbol",
              location: { address: "0x1000", file_offset: null },
              artifact_path: null,
              artifact_sha256: null,
            },
          ],
        },
      ],
      edges: [],
      coverage: [],
      truncated: false,
    };
    const graph = projectEvidenceToBehavioralGraph(sha, {
      records: [record],
      nativeGraphs: [nativeGraph],
      applicationSources: [],
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.coverage).toContainEqual(
      expect.objectContaining({
        facet: "native:ghidra",
        status: "partial",
        omitted: 1,
      }),
    );
    expect(() =>
      projectEvidenceToBehavioralGraph("c".repeat(64), {
        records: [record],
        nativeGraphs: [nativeGraph],
        applicationSources: [],
      }),
    ).toThrow(/target hash/iu);
  });

  it("authenticates application graph sources before projecting their assertions", async () => {
    const root = await createTestTempDirectory(
      "rea-behavioral-application-graph-",
    );
    await writeFixtureFiles(root, {
      "main.mjs": "export const run = () => 7;\n",
    });
    const analyzed = await analyzeJavaScriptApplication({ input_path: root });
    if (!analyzed.ok) throw analyzed.error;
    const parsed = parseApplicationGraphEvidence(analyzed.value);
    if (!parsed.ok) throw new Error("Application analysis must authenticate");
    const source = parsed.value;
    const graph = projectEvidenceToBehavioralGraph(source.rootArtifactSha256, {
      records: [source.evidence],
      nativeGraphs: [],
      applicationSources: [source],
    });
    expect(graph.nodes.length).toBeGreaterThan(source.graph.nodes.length);
    expect(graph.edges.length).toBe(source.graph.edges.length);
    expect(graph.evidenceIds).toContain(source.evidence.evidence_id);
    expect(() =>
      projectEvidenceToBehavioralGraph(source.rootArtifactSha256, {
        records: [source.evidence],
        nativeGraphs: [],
        applicationSources: [
          { ...source, graph: { ...source.graph, nodes: [] } },
        ],
      }),
    ).toThrow(/authentication|authenticated Evidence|semantic/iu);
  });
});
