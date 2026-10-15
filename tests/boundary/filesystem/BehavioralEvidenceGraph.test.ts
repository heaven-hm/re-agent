import { describe, expect, it } from "vitest";

import {
  createEmptyBehavioralGraph,
  behavioralGraphSchema,
  validateBehavioralGraph,
  mergeBehavioralGraphs,
  BEHAVIORAL_GRAPH_MAX_EDGES,
  BEHAVIORAL_GRAPH_MAX_NODES,
  behavioralNodeId,
  mergeBinaryBehavioralGraphs,
  queryBehavioralEvidence,
  validateBinaryBehavioralGraph,
} from "../../../src/domain/reconstruction/BehavioralEvidenceGraph.js";

const sha = "a".repeat(64);
const otherSha = "c".repeat(64);
const ev1 = `ev_${"b".repeat(64)}`;
const ev2 = `ev_${"d".repeat(64)}`;
const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  binarySha256: sha,
  kind: "observation",
  label: id,
  evidenceIds: [ev1],
  confidence: "observed",
  assertion: "supports",
  locations: [],
  ...extra,
});
const edge = (extra: Record<string, unknown> = {}) => ({
  id: "edge-1",
  from: "node-1",
  to: "node-2",
  relation: "calls",
  resolution: "resolved",
  evidenceIds: [ev2],
  confidence: "observed",
  assertion: "unknown",
  reason: null,
  ...extra,
});
const graph = {
  schemaVersion: 2,
  targetSha256: sha,
  nodes: [node("node-1"), node("node-2", { assertion: "contradicts" })],
  edges: [edge()],
  evidenceIds: [ev1, ev2],
  coverage: [],
  limitations: [],
};

describe("behavioral evidence graph", () => {
  it("creates a binary-bound empty graph and validates provenance", () => {
    expect(createEmptyBehavioralGraph(sha)).toEqual({
      schemaVersion: 2,
      targetSha256: sha,
      nodes: [],
      edges: [],
      evidenceIds: [],
      coverage: [],
      limitations: [],
    });
    expect(validateBinaryBehavioralGraph(graph)).toEqual(graph);
  });

  it("rejects malformed identity, duplicate IDs and dangling or cross-binary edges", () => {
    expect(() => createEmptyBehavioralGraph("not-a-digest")).toThrow();
    expect(() =>
      validateBinaryBehavioralGraph({
        ...graph,
        nodes: [node("node-1"), node("node-1")],
      }),
    ).toThrow(/duplicate.*node/iu);
    expect(() =>
      validateBinaryBehavioralGraph({
        ...graph,
        edges: [edge({ to: "missing" })],
      }),
    ).toThrow(/dangling/iu);
    expect(() =>
      validateBinaryBehavioralGraph({
        ...graph,
        nodes: [node("node-1"), node("node-2", { binarySha256: otherSha })],
      }),
    ).toThrow(/cross-binary/iu);
    expect(() =>
      validateBinaryBehavioralGraph({ ...graph, evidenceIds: [ev1] }),
    ).toThrow(/evidence reference/iu);
  });

  it("bounds coverage reason text in persisted graph state", () => {
    expect(() =>
      validateBinaryBehavioralGraph({
        ...graph,
        coverage: [
          {
            facet: "runtime-trace",
            status: "partial",
            examined: 0,
            omitted: 1,
            reason: "r".repeat(4097),
          },
        ],
      }),
    ).toThrow();
  });

  it.each([null, "", " "])(
    "requires a meaningful reason for an ambiguous edge (%s)",
    (reason) => {
      expect(() =>
        validateBinaryBehavioralGraph({
          ...graph,
          edges: [edge({ resolution: "ambiguous", reason })],
        }),
      ).toThrow();
    },
  );

  it("keeps supporting and contradicting evidence separate in node queries", () => {
    const result = queryBehavioralEvidence(graph, "node-1");
    expect(result.supportingEvidenceIds).toEqual([ev1]);
    expect(result.contradictingEvidenceIds).toEqual([]);
    expect(
      queryBehavioralEvidence(graph, "node-2").contradictingEvidenceIds,
    ).toEqual([ev1]);
  });

  it("merges deterministically and rejects conflicting assertions instead of overwriting", () => {
    expect(mergeBinaryBehavioralGraphs(graph, graph)).toEqual(
      validateBinaryBehavioralGraph(graph),
    );
    const conflict = {
      ...graph,
      nodes: [node("node-1", { assertion: "contradicts" }), graph.nodes[1]],
    };
    expect(() => mergeBinaryBehavioralGraphs(graph, conflict)).toThrow(
      /conflicting node/iu,
    );
  });

  it("keeps unresolved and ambiguous edges explicit and scopes IDs to the binary", () => {
    const uncertain = {
      ...graph,
      edges: [
        edge({
          resolution: "ambiguous",
          reason: "module identity unavailable",
        }),
        edge({
          id: "edge-2",
          to: null,
          resolution: "unresolved",
          reason: "indirect call target unknown",
        }),
      ],
    };
    const query = queryBehavioralEvidence(uncertain, "node-1");
    expect(query.unresolvedEdges.map(({ resolution }) => resolution)).toEqual([
      "ambiguous",
      "unresolved",
    ]);
    expect(behavioralNodeId(sha, { function: "entry" })).toBe(
      behavioralNodeId(sha, { function: "entry" }),
    );
    expect(behavioralNodeId(sha, { function: "entry" })).not.toBe(
      behavioralNodeId(otherSha, { function: "entry" }),
    );
    expect(BEHAVIORAL_GRAPH_MAX_NODES).toBe(100_000);
    expect(BEHAVIORAL_GRAPH_MAX_EDGES).toBe(250_000);
  });
});

describe("versioned behavioral graph API", () => {
  const legacy = { schemaVersion: 1, nodes: [], edges: [] };
  it("preserves original v1 shape and dispatches enriched v2 unchanged", () => {
    const binary = createEmptyBehavioralGraph(sha);
    expect(behavioralGraphSchema.parse(legacy)).toEqual(legacy);
    expect(validateBehavioralGraph(legacy)).toEqual(legacy);
    expect(mergeBehavioralGraphs(legacy, legacy)).toEqual(legacy);
    expect(validateBehavioralGraph(binary)).toEqual(binary);
    expect(mergeBehavioralGraphs(binary, binary)).toEqual(binary);
    expect(binary.schemaVersion).toBe(2);
    expect(() => validateBinaryBehavioralGraph(legacy)).toThrow();
  });
  it("rejects mixed versions in either direction and unknown versions", () => {
    const binary = createEmptyBehavioralGraph(sha);
    expect(() => mergeBehavioralGraphs(legacy, binary)).toThrow(
      /different schema versions/u,
    );
    expect(() => mergeBehavioralGraphs(binary, legacy)).toThrow(
      /different schema versions/u,
    );
    expect(() =>
      validateBehavioralGraph({ ...legacy, schemaVersion: 3 }),
    ).toThrow();
    expect(() =>
      validateBehavioralGraph({ ...binary, schemaVersion: 1 }),
    ).toThrow();
  });
});
