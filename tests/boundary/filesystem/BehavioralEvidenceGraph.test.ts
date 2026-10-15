import { describe, expect, it } from "vitest";

import {
  createEmptyBehavioralGraph,
  BEHAVIORAL_GRAPH_MAX_EDGES,
  BEHAVIORAL_GRAPH_MAX_NODES,
  behavioralNodeId,
  mergeBehavioralGraphs,
  queryBehavioralEvidence,
  validateBehavioralGraph,
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
  schemaVersion: 1,
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
      schemaVersion: 1,
      targetSha256: sha,
      nodes: [],
      edges: [],
      evidenceIds: [],
      coverage: [],
      limitations: [],
    });
    expect(validateBehavioralGraph(graph)).toEqual(graph);
  });

  it("rejects malformed identity, duplicate IDs and dangling or cross-binary edges", () => {
    expect(() => createEmptyBehavioralGraph("not-a-digest")).toThrow();
    expect(() =>
      validateBehavioralGraph({
        ...graph,
        nodes: [node("node-1"), node("node-1")],
      }),
    ).toThrow(/duplicate.*node/iu);
    expect(() =>
      validateBehavioralGraph({ ...graph, edges: [edge({ to: "missing" })] }),
    ).toThrow(/dangling/iu);
    expect(() =>
      validateBehavioralGraph({
        ...graph,
        nodes: [node("node-1"), node("node-2", { binarySha256: otherSha })],
      }),
    ).toThrow(/cross-binary/iu);
    expect(() =>
      validateBehavioralGraph({ ...graph, evidenceIds: [ev1] }),
    ).toThrow(/evidence reference/iu);
  });

  it("keeps supporting and contradicting evidence separate in node queries", () => {
    const result = queryBehavioralEvidence(graph, "node-1");
    expect(result.supportingEvidenceIds).toEqual([ev1]);
    expect(result.contradictingEvidenceIds).toEqual([]);
    expect(
      queryBehavioralEvidence(graph, "node-2").contradictingEvidenceIds,
    ).toEqual([ev1]);
  });

  it("merges deterministically and rejects conflicting assertions instead of overwriting", () => {
    expect(mergeBehavioralGraphs(graph, graph)).toEqual(
      validateBehavioralGraph(graph),
    );
    const conflict = {
      ...graph,
      nodes: [node("node-1", { assertion: "contradicts" }), graph.nodes[1]],
    };
    expect(() => mergeBehavioralGraphs(graph, conflict)).toThrow(
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
