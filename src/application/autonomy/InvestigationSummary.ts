import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import type { InvestigationState } from "./InvestigationContracts.js";

export const summarizeInvestigation = (
  state: InvestigationState,
): {
  id: string;
  status: string;
  iteration: number;
  binary_sha256: string;
  functions: InvestigationState["functions"];
  results: InvestigationState["results"];
  regressions: string[];
  evidence_ids: string[];
  behavioral_graph: null | {
    schema_version: number;
    target_sha256: string;
    graph_sha256: string;
    node_count: number;
    edge_count: number;
    unresolved_edge_count: number;
    evidence_count: number;
    coverage_counts: Record<string, number>;
  };
  limitations: string[];
} => {
  return {
    id: state.id,
    status: state.status,
    iteration: state.iteration,
    binary_sha256: state.binarySha256,
    functions: state.functions,
    results: state.results,
    regressions: state.regressions,
    evidence_ids: state.evidence.map((item) => item.evidence_id),
    behavioral_graph: summarizeBehavioralGraph(state),
    limitations: state.limitations,
  };
};

const summarizeBehavioralGraph = (state: InvestigationState) => {
  const graph = state.behavioralGraph;
  const coverageCounts: Record<string, number> = {};
  for (const entry of graph?.coverage ?? [])
    coverageCounts[entry.status] = (coverageCounts[entry.status] ?? 0) + 1;
  return graph === undefined
    ? null
    : {
        schema_version: graph.schemaVersion,
        target_sha256: graph.targetSha256,
        graph_sha256: digestCanonicalValue(graph, "behavioral graph status"),
        node_count: graph.nodes.length,
        edge_count: graph.edges.length,
        unresolved_edge_count: graph.edges.filter(
          (edge) => edge.resolution !== "resolved",
        ).length,
        evidence_count: graph.evidenceIds.length,
        coverage_counts: coverageCounts,
      };
};

/** Bounded progress response; complete observations remain in the checkpoint. */
export const summarizeInvestigationForMcp = (
  state: InvestigationState,
  checkpoint: string,
) => {
  const resultCounts = { pass: 0, fail: 0, unknown: 0 };
  for (const result of state.results) resultCounts[result.status]++;
  return {
    id: state.id,
    status: state.status,
    iteration: state.iteration,
    binary_sha256: state.binarySha256,
    checkpoint,
    evidence_count: state.evidence.length,
    function_count: state.functions.length,
    regression_count: state.regressions.length,
    result_counts: resultCounts,
    behavioral_graph: summarizeBehavioralGraph(state),
    limitation_count: state.limitations.length,
    verification_scope:
      "Declared cases and observation dimensions only; universal equivalence is unproven.",
  };
};
