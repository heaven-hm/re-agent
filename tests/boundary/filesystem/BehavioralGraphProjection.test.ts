import { PROCESS_PROVIDER } from "../../../src/domain/process/processEvidenceProvider.js";
import { emptyProcessCapture } from "../../../src/domain/process/processCapture.fixture.js";
import { reconcileJavaScriptRuntimeEvidence } from "../../../src/application/javascript/JavaScriptRuntimeReconciliationService.js";
import type { ApplicationGraphEvidenceSource } from "../../../src/application/javascript/JavaScriptApplicationEvidenceGraph.js";
import {
  createJavaScriptApplicationGraph,
  createJavaScriptApplicationNode,
} from "../../../src/domain/javascript/javascriptApplicationGraph.js";
import { unknownEvidence } from "../../../src/domain/javascript/javascriptApplicationGraph.fixture.js";
import {
  jsonValueSchema,
  jsonObjectSchema,
} from "../../../src/domain/jsonValue.js";
import {
  SOURCE,
  applicationFixture,
  analyzeFixture,
  electronRuntimeEvidence,
} from "../../fixtures/javascriptRuntimeReconciliation.js";
import { describe, expect, it } from "vitest";

import {
  createEvidence,
  rebindEvidenceToTargetPath,
  type Evidence,
} from "../../../src/domain/evidence.js";
import { parseApplicationGraphEvidence } from "../../../src/application/javascript/JavaScriptApplicationEvidenceGraph.js";
import { applicationSourcesFromEvidence } from "../../../src/application/investigation/BehavioralGraphProjection.js";
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

  it("includes the Evidence ID and parser issues when application Evidence is malformed", async () => {
    const root = await createTestTempDirectory(
      "rea-behavioral-application-graph-invalid-evidence-",
    );
    await writeFixtureFiles(root, {
      "main.mjs": "export const run = () => 7;\n",
    });
    const analyzed = await analyzeJavaScriptApplication({ input_path: root });
    if (!analyzed.ok) throw analyzed.error;
    const valid = analyzed.value;
    const malformed = createEvidence(
      {
        path: valid.subject?.local_path ?? root,
        sha256: valid.subject?.digest.sha256 ?? "a".repeat(64),
        format: valid.subject?.format ?? "directory",
      },
      valid.provider,
      {
        predicateType: valid.predicate_type,
        operation: valid.operation,
        parameters: valid.parameters,
        result: { input_path: 7 },
        confidence: valid.confidence,
        authority: valid.authority,
      },
    );

    expect(() =>
      applicationSourcesFromEvidence([malformed], "b".repeat(64)),
    ).toThrow(new RegExp(malformed.evidence_id));
    expect(() =>
      applicationSourcesFromEvidence([malformed], "b".repeat(64)),
    ).toThrow(/input_path/u);
  });
});

describe("behavioral projection production review regressions", () => {
  it("deduplicates authenticated semantic Evidence after a local path rebind", () => {
    const record = evidence("rebound");
    const rebound = rebindEvidenceToTargetPath(record, {
      ...target,
      path: "/other/fixture.bin",
    });
    expect(rebound.evidence_id).toBe(record.evidence_id);
    expect(
      projectEvidenceToBehavioralGraph(sha, {
        records: [record, rebound],
        applicationSources: [],
        nativeGraphs: [],
      }).nodes,
    ).toHaveLength(1);
  });

  it.each(["rea.process-capture", "rea.analysis"])(
    "authenticates process manifests before subject metadata (%s)",
    (predicateType) => {
      const record = createEvidence(target, PROCESS_PROVIDER, {
        predicateType,
        operation: "capture_process_scenario",
        parameters: {},
        result: jsonValueSchema.parse(emptyProcessCapture()),
        confidence: "observed",
      });
      expect(() =>
        projectEvidenceToBehavioralGraph(sha, {
          records: [record],
          applicationSources: [],
          nativeGraphs: [],
        }),
      ).toThrow(/target hash/iu);
      const excluded = projectEvidenceToBehavioralGraph(sha, {
        records: [record],
        applicationSources: [],
        nativeGraphs: [],
        nonTargetEvidence: "exclude-with-coverage",
      });
      expect(excluded.nodes).toEqual([]);
      expect(excluded.coverage).toContainEqual(
        expect.objectContaining({ facet: "evidence:non-target", omitted: 1 }),
      );
    },
  );

  it("does not admit subject-bearing comparisons without verified source captures", () => {
    const capture = createEvidence(target, PROCESS_PROVIDER, {
      predicateType: "rea.process-capture",
      operation: "capture_process_scenario",
      parameters: {},
      result: jsonValueSchema.parse(emptyProcessCapture()),
      confidence: "observed",
    });
    const comparison = createEvidence(target, PROCESS_PROVIDER, {
      predicateType: "rea.process-capture",
      operation: "compare_process_captures",
      parameters: {
        left_evidence_id: capture.evidence_id,
        right_evidence_id: capture.evidence_id,
      },
      result: {},
      evidenceLinks: [capture.evidence_id],
    });
    expect(
      projectEvidenceToBehavioralGraph(sha, {
        records: [capture, comparison],
        applicationSources: [],
        nativeGraphs: [],
        nonTargetEvidence: "exclude-with-coverage",
      }).evidenceIds,
    ).toEqual([]);
  });

  it("projects long and empty legacy limitations without losing ledger content", () => {
    const reason = "r".repeat(9000);
    const record = createEvidence(target, provider, {
      operation: "long_observation",
      parameters: {},
      result: {},
      limitations: [reason, ""],
      locations: Array.from({ length: 10_001 }, (_, index) => ({
        kind: "file-offset" as const,
        offset: index,
      })),
    });
    const graph = projectEvidenceToBehavioralGraph(sha, {
      records: [record],
      applicationSources: [],
      nativeGraphs: [],
    });
    expect(record.limitations[0]).toBe(reason);
    expect(graph.limitations.some((value) => value.includes("truncated"))).toBe(
      true,
    );
    expect(graph.limitations.every((value) => value.length <= 4096)).toBe(true);
    expect(graph.coverage).toContainEqual(
      expect.objectContaining({
        omitted: 1,
        facet: `evidence:${record.evidence_id}:locations`,
      }),
    );
  });

  it("retains native provider facet coverage and truncation separately from provenance", () => {
    const graph = projectEvidenceToBehavioralGraph(sha, {
      records: [],
      applicationSources: [],
      nativeGraphs: [
        {
          target_sha256: sha,
          provider: { id: "native", version: "1", tool_version: "1" },
          nodes: [],
          edges: [],
          truncated: true,
          coverage: [
            {
              facet: "cfg",
              status: "unsupported",
              examined: 2,
              omitted: 3,
              reason: "provider lacks CFG",
            },
          ],
        },
      ],
    });
    expect(graph.coverage).toContainEqual({
      facet: "native:native:cfg",
      status: "unsupported",
      examined: 2,
      omitted: 3,
      reason: "provider lacks CFG",
    });
    expect(graph.coverage).toContainEqual(
      expect.objectContaining({
        facet: "native:native:truncation",
        omitted: null,
      }),
    );
  });
});

let application: Evidence;
let runtime: Evidence;
let staticSource: ApplicationGraphEvidenceSource;
let runtimeSource: ApplicationGraphEvidenceSource;
const parseSource = (record: Evidence) => {
  const result = parseApplicationGraphEvidence(record);
  if (!result.ok) throw new Error("fixture source failed authentication");
  return result.value;
};
const setup = async () => {
  const root = await applicationFixture();
  application = await analyzeFixture(root);
  runtime = electronRuntimeEvidence(root, SOURCE);
  const reconciled = reconcileJavaScriptRuntimeEvidence({
    static_layers: [{ role: "application", analysis: application }],
    runtime_observations: [runtime],
  });
  if (!reconciled.ok) throw reconciled.error;
  staticSource = parseSource(application);
  runtimeSource = parseSource(reconciled.value);
};

const unknownRuntimeNode = () =>
  createJavaScriptApplicationNode({
    kind: "unknown",
    identity: {
      strategy: "artifact-local-key",
      stability: "artifact-version",
      artifact_sha256: staticSource.rootArtifactSha256,
      namespace: "review-regression",
      key: "unknown-fact",
    },
    observations: [
      {
        label: "unresolved application fact",
        properties: {},
        evidence: {
          ...unknownEvidence(),
          artifact: {
            available: true,
            artifact_id: `art_${staticSource.rootArtifactSha256}`,
            sha256: staticSource.rootArtifactSha256,
          },
          evidence_ids: [runtime.evidence_id],
        },
      },
    ],
  });

describe("static and runtime application graph projection", () => {
  it("joins producer-authenticated reconciliation and shared static nodes without duplicate IDs", async () => {
    await setup();
    expect(runtimeSource.evidence.subject).toBeNull();
    const graph = projectEvidenceToBehavioralGraph(
      staticSource.rootArtifactSha256,
      {
        records: [application, runtime],
        applicationSources: [staticSource, runtimeSource],
        nativeGraphs: [],
      },
    );
    expect(graph.evidenceIds).toContain(runtime.evidence_id);
    expect(graph.nodes).toContainEqual(
      expect.objectContaining({
        evidenceIds: expect.arrayContaining([
          application.evidence_id,
          runtimeSource.evidence.evidence_id,
        ]),
        assertion: "supports",
        confidence: "observed",
      }),
    );
    expect(
      graph.edges.some(
        (edge) =>
          edge.relation === "observed_as" && edge.confidence === "inferred",
      ),
    ).toBe(true);
    expect(
      graph.coverage.some(
        (entry) =>
          entry.facet.endsWith(":location") &&
          entry.reason?.includes("runtime"),
      ),
    ).toBe(true);
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(
      graph.nodes.length,
    );
    expect(() =>
      projectEvidenceToBehavioralGraph("c".repeat(64), {
        records: [application, runtime],
        applicationSources: [runtimeSource],
        nativeGraphs: [],
      }),
    ).toThrow(/target hash/iu);
  });

  it("does not promote unknown facts by borrowing observed runtime confidence and preserves unknown omissions", async () => {
    await setup();
    const unknown = unknownRuntimeNode();
    const { graph_id: _graphId, ...graphInput } = runtimeSource.graph;
    const graph = createJavaScriptApplicationGraph({
      ...graphInput,
      nodes: [...graphInput.nodes, unknown],
      coverage: {
        status: "partial",
        truncated: false,
        omitted_count: null,
        limits: [],
      },
      limitations: [
        ...graphInput.limitations,
        "Omissions cannot be quantified",
      ],
    });
    const envelope = runtimeSource.evidence;
    const changed = createEvidence(undefined, envelope.provider, {
      operation: envelope.operation,
      predicateType: envelope.predicate_type,
      parameters: envelope.parameters,
      result: jsonValueSchema.parse({
        ...jsonObjectSchema.parse(envelope.normalized_result),
        graph,
      }),
      confidence: envelope.confidence,
      authority: envelope.authority,
      evidenceLinks: envelope.evidence_links,
      limitations: envelope.limitations,
    });
    const source = parseSource(changed);
    const result = projectEvidenceToBehavioralGraph(source.rootArtifactSha256, {
      records: [application, runtime],
      applicationSources: [source],
      nativeGraphs: [],
    });
    expect(
      result.nodes.find((node) => node.label === "unresolved application fact")
        ?.assertion,
    ).toBe("unknown");
    expect(result.coverage).toContainEqual(
      expect.objectContaining({
        facet: "application:static-runtime-reconciliation",
        status: "partial",
        omitted: null,
      }),
    );
  });

  it("rejects missing reconciliation provenance instead of inventing citations", async () => {
    await setup();
    expect(() =>
      projectEvidenceToBehavioralGraph(staticSource.rootArtifactSha256, {
        records: [application],
        applicationSources: [runtimeSource],
        nativeGraphs: [],
      }),
    ).toThrow(/reference.*missing/iu);
  });

  it("budgets source envelope links even when the envelope is not in records", async () => {
    await setup();
    expect(() =>
      projectEvidenceToBehavioralGraph(staticSource.rootArtifactSha256, {
        records: [],
        nativeGraphs: [],
        applicationSources: [
          {
            ...runtimeSource,
            evidence: {
              ...runtimeSource.evidence,
              evidence_links: new Array(BEHAVIORAL_GRAPH_MAX_EDGES + 1).fill(
                runtime.evidence_id,
              ),
            },
          },
        ],
      }),
    ).toThrow(/edge budget/iu);
  });
});
