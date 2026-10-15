import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { parseEvidence, type Evidence } from "../../domain/evidence.js";
import { isProcessEvidenceProvider } from "../../domain/process/processEvidenceProvider.js";
import { parseProcessCapture } from "../../domain/process/processCaptureParsing.js";
import {
  behavioralNodeId,
  BEHAVIORAL_GRAPH_MAX_EDGES,
  BEHAVIORAL_GRAPH_MAX_NODES,
  createEmptyBehavioralGraph,
  validateBehavioralGraph,
  type BehavioralGraph,
  type BehavioralGraphCoverage,
  type BehavioralGraphEdge,
  type BehavioralGraphNode,
} from "../../domain/reconstruction/BehavioralEvidenceGraph.js";
import {
  nativeInvestigationGraphSchema,
  type NativeInvestigationGraph,
} from "../../domain/native/nativeInvestigationGraph.js";
import type { ApplicationGraphEvidenceSource } from "../javascript/JavaScriptApplicationEvidenceGraph.js";
import { parseApplicationGraphEvidence } from "../javascript/JavaScriptApplicationEvidenceGraph.js";

export interface BehavioralEvidenceProjectionInput {
  readonly records: readonly Evidence[];
  readonly nativeGraphs: readonly NativeInvestigationGraph[];
  readonly applicationSources: readonly ApplicationGraphEvidenceSource[];
  /** Controller-only migration path: retain unrelated Evidence outside this graph with a coverage gap. */
  readonly nonTargetEvidence?: "reject" | "exclude-with-coverage";
}

/**
 * Build a deterministic view over authenticated Evidence and specialized graph
 * records. The Evidence payloads remain in their original ledger/checkpoint.
 */
export const projectEvidenceToBehavioralGraph = (
  targetSha256: string,
  input: BehavioralEvidenceProjectionInput,
): BehavioralGraph => {
  const projectedNodeUpperBound =
    input.records.length +
    input.applicationSources.reduce(
      (total, source) => total + source.graph.nodes.length,
      0,
    );
  const projectedEdgeUpperBound =
    input.records.reduce(
      (total, record) => total + record.evidence_links.length,
      0,
    ) +
    input.applicationSources.reduce(
      (total, source) => total + source.graph.edges.length,
      0,
    );
  if (projectedNodeUpperBound > BEHAVIORAL_GRAPH_MAX_NODES)
    throw new Error("Behavioral graph node budget exceeded");
  if (projectedEdgeUpperBound > BEHAVIORAL_GRAPH_MAX_EDGES)
    throw new Error("Behavioral graph edge budget exceeded");
  const graph = createEmptyBehavioralGraph(targetSha256);
  const allEvidenceById = new Map<string, Evidence>();
  let excludedEvidence = 0;
  for (const raw of input.records) {
    const evidence = parseEvidence(raw);
    const previous = allEvidenceById.get(evidence.evidence_id);
    if (
      previous !== undefined &&
      digestCanonicalValue(previous, "behavioral Evidence duplicate") !==
        digestCanonicalValue(evidence, "behavioral Evidence duplicate")
    )
      throw new Error(
        `Conflicting duplicate Evidence ID: ${evidence.evidence_id}`,
      );
    allEvidenceById.set(evidence.evidence_id, evidence);
  }
  const evidenceById = new Map<string, Evidence>();
  for (const evidence of allEvidenceById.values()) {
    if (evidenceIsBoundToTarget(evidence, targetSha256, allEvidenceById)) {
      evidenceById.set(evidence.evidence_id, evidence);
      continue;
    }
    if (input.nonTargetEvidence !== "exclude-with-coverage")
      throw new Error(
        "Evidence target hash does not match behavioral graph target hash",
      );
    excludedEvidence++;
  }

  const nodes: BehavioralGraphNode[] = [];
  const edges: BehavioralGraphEdge[] = [];
  const coverage: BehavioralGraphCoverage[] = [];
  const limitations = new Set<string>();
  if (excludedEvidence > 0) {
    coverage.push({
      facet: "evidence:non-target",
      status: "partial",
      examined: input.records.length,
      omitted: excludedEvidence,
      reason:
        "Evidence without the exact target SHA-256 remains in the Evidence ledger but is excluded from this binary-bound graph",
    });
    limitations.add(
      "Some checkpoint Evidence could not be bound to the graph target and is not represented as a graph assertion.",
    );
  }
  const observationNodeIds = new Map<string, string>();
  for (const evidence of evidenceById.values()) {
    const id = behavioralNodeId(targetSha256, {
      kind: "evidence-observation",
      evidenceId: evidence.evidence_id,
    });
    observationNodeIds.set(evidence.evidence_id, id);
    nodes.push({
      id,
      binarySha256: targetSha256,
      kind: "observation",
      label: `${evidence.predicate_type}:${evidence.operation}`,
      evidenceIds: [evidence.evidence_id],
      confidence: evidence.confidence,
      assertion: "unknown",
      locations: evidence.locations,
    });
    for (const limitation of evidence.limitations) limitations.add(limitation);
    if (evidence.relationship_coverage !== null)
      coverage.push({
        facet: `evidence:${evidence.evidence_id}:relationships`,
        status:
          evidence.relationship_coverage.status === "unknown"
            ? "partial"
            : evidence.relationship_coverage.status,
        examined: 0,
        omitted: 0,
        reason:
          evidence.relationship_coverage.status === "complete"
            ? null
            : "limitations" in evidence.relationship_coverage
              ? evidence.relationship_coverage.limitations.join("; ")
              : evidence.relationship_coverage.reason,
      });
  }

  for (const evidence of evidenceById.values()) {
    const from = observationNodeIds.get(evidence.evidence_id);
    if (from === undefined) continue;
    for (const linkedId of evidence.evidence_links) {
      const linked = evidenceById.get(linkedId);
      const linkedNode = observationNodeIds.get(linkedId);
      const resolved = linked !== undefined && linkedNode !== undefined;
      const common: Omit<BehavioralGraphEdge, "to" | "resolution" | "reason"> =
        {
          id: behavioralNodeId(targetSha256, {
            relation: "evidence-links",
            sourceEvidenceId: evidence.evidence_id,
            linkedEvidenceId: linkedId,
          }),
          from,
          relation: "evidence-links",
          evidenceIds: [evidence.evidence_id],
          confidence: evidence.confidence,
          assertion: "unknown",
        };
      edges.push(
        resolved
          ? { ...common, to: linkedNode, resolution: "resolved", reason: null }
          : {
              ...common,
              to: null,
              resolution: "unresolved",
              reason: `Linked Evidence ${linkedId} was not included`,
            },
      );
    }
  }

  for (const source of input.applicationSources) {
    if (
      source.rootArtifactSha256 !== targetSha256 ||
      source.evidence.subject?.digest.sha256 !== targetSha256
    )
      throw new Error(
        "Application graph target hash does not match behavioral graph target hash",
      );
    const evidence = parseEvidence(source.evidence);
    const authenticatedSource = parseApplicationGraphEvidence(evidence);
    if (!authenticatedSource.ok)
      throw new Error("Application graph Evidence failed authentication");
    if (
      authenticatedSource.value.kind !== source.kind ||
      authenticatedSource.value.rootArtifactSha256 !==
        source.rootArtifactSha256 ||
      authenticatedSource.value.graph.graph_id !== source.graph.graph_id ||
      digestCanonicalValue(
        authenticatedSource.value.graph,
        "behavioral application graph",
      ) !== digestCanonicalValue(source.graph, "behavioral application graph")
    )
      throw new Error(
        "Application graph source does not match its authenticated Evidence",
      );
    if (!evidenceById.has(evidence.evidence_id)) {
      evidenceById.set(evidence.evidence_id, evidence);
      const id = behavioralNodeId(targetSha256, {
        kind: "evidence-observation",
        evidenceId: evidence.evidence_id,
      });
      observationNodeIds.set(evidence.evidence_id, id);
      nodes.push({
        id,
        binarySha256: targetSha256,
        kind: "observation",
        label: `${evidence.predicate_type}:${evidence.operation}`,
        evidenceIds: [evidence.evidence_id],
        confidence: evidence.confidence,
        assertion: "unknown",
        locations: evidence.locations,
      });
    }
    const fallbackEvidenceId = evidence.evidence_id;
    const appNodeIds = new Map<string, string>();
    for (const appNode of source.graph.nodes) {
      const id = behavioralNodeId(targetSha256, {
        kind: "application-node",
        graphNodeId: appNode.node_id,
      });
      appNodeIds.set(appNode.node_id, id);
      const factEvidence = mergeFactEvidence(
        appNode.observations.map((item) => item.evidence.evidence_ids),
        fallbackEvidenceId,
        evidenceById,
      );
      appNode.observations.forEach((item, index) => {
        for (const limitation of item.evidence.limitations)
          limitations.add(limitation);
        if (
          item.evidence.state === "unknown" ||
          item.evidence.state === "unavailable" ||
          item.evidence.coverage.status !== "complete"
        )
          coverage.push({
            facet: `application:${source.kind}:${appNode.node_id}:observation:${index}`,
            status:
              item.evidence.state === "unavailable" ? "unsupported" : "partial",
            examined: 0,
            omitted: 1,
            reason:
              item.evidence.limitations.join("; ") ||
              `Fact state ${item.evidence.state}; coverage ${item.evidence.coverage.status}`,
          });
      });
      const locations: BehavioralGraphNode["locations"] = [];
      for (const item of appNode.observations) {
        const location = item.evidence.location;
        if (!location.available) continue;
        switch (location.value.kind) {
          case "artifact-path":
            locations.push({
              kind: "artifact-path",
              path: location.value.path,
            });
            break;
          case "native-address":
            locations.push({
              kind: "address",
              address: location.value.address,
            });
            break;
          case "file-offset-range":
            locations.push({
              kind: "file-offset-range",
              start: location.value.start,
              end: location.value.end,
            });
            break;
          default:
            break;
        }
      }
      nodes.push({
        id,
        binarySha256: targetSha256,
        kind: "observation",
        label:
          appNode.observations.find(({ label }) => label !== null)?.label ??
          `${appNode.kind}:${JSON.stringify(appNode.identity)}`,
        evidenceIds: factEvidence.ids,
        confidence: factEvidence.confidence,
        assertion: factEvidence.assertion,
        locations,
      });
    }
    for (const appEdge of source.graph.edges) {
      const from = appNodeIds.get(appEdge.source_node_id);
      const to = appNodeIds.get(appEdge.target_node_id);
      if (from === undefined || to === undefined)
        throw new Error("Application graph contains a dangling relationship");
      const factEvidence = mergeFactEvidence(
        [appEdge.evidence.evidence_ids],
        fallbackEvidenceId,
        evidenceById,
      );
      for (const limitation of appEdge.evidence.limitations)
        limitations.add(limitation);
      if (
        appEdge.evidence.state === "unknown" ||
        appEdge.evidence.state === "unavailable" ||
        appEdge.evidence.coverage.status !== "complete"
      )
        coverage.push({
          facet: `application:${source.kind}:${appEdge.edge_id}`,
          status:
            appEdge.evidence.state === "unavailable"
              ? "unsupported"
              : "partial",
          examined: 0,
          omitted: 1,
          reason:
            appEdge.evidence.limitations.join("; ") ||
            `Fact state ${appEdge.evidence.state}; coverage ${appEdge.evidence.coverage.status}`,
        });
      const edge: BehavioralGraphEdge = {
        id: behavioralNodeId(targetSha256, {
          kind: "application-edge",
          graphEdgeId: appEdge.edge_id,
        }),
        from,
        to,
        relation: applicationRelation(appEdge.relation),
        resolution: "resolved",
        reason: null,
        evidenceIds: factEvidence.ids,
        confidence: factEvidence.confidence,
        assertion: factEvidence.assertion,
      };
      edges.push(edge);
    }
    coverage.push({
      facet: `application:${source.kind}`,
      status:
        source.graph.coverage.status === "complete" ||
        source.graph.coverage.status === "partial"
          ? source.graph.coverage.status
          : "partial",
      examined: source.graph.nodes.length + source.graph.edges.length,
      omitted: source.graph.coverage.omitted_count ?? 0,
      reason:
        source.graph.coverage.status === "complete"
          ? null
          : `Specialized application graph reports ${source.graph.coverage.status} coverage`,
    });
    for (const limitation of source.graph.limitations)
      limitations.add(limitation);
  }

  for (const rawSource of input.nativeGraphs) {
    const source = nativeInvestigationGraphSchema.parse(rawSource);
    if (source.target_sha256 !== targetSha256)
      throw new Error(
        "Native graph target hash does not match behavioral graph target hash",
      );
    const hasEvidenceLinks = source.nodes.some(
      (node) => node.evidence.length > 0,
    );
    coverage.push({
      facet: `native:${source.provider.id}`,
      status: "partial",
      examined: 0,
      omitted: source.nodes.length + source.edges.length,
      reason: hasEvidenceLinks
        ? "Native graph provenance is descriptive metadata, not immutable RE-Agent Evidence IDs; assertions were not imported"
        : "Native graph assertions have no immutable RE-Agent Evidence ID provenance; assertions were not imported",
    });
    limitations.add(
      "Native investigation graph facts without immutable Evidence IDs are retained only as an explicit coverage gap.",
    );
  }

  return validateBehavioralGraph({
    ...graph,
    nodes,
    edges,
    evidenceIds: [...evidenceById.keys()].sort(),
    coverage,
    limitations: [...limitations].sort(),
  });
};

const mergeFactEvidence = (
  references: readonly (readonly string[])[],
  fallbackId: string,
  known: ReadonlyMap<string, Evidence>,
): {
  readonly ids: string[];
  readonly assertion: "supports" | "unknown";
  readonly confidence: "observed" | "derived" | "inferred";
} => {
  const ids = new Set<string>([fallbackId]);
  for (const group of references)
    for (const id of group) {
      if (!known.has(id))
        throw new Error(
          `Application graph Evidence reference is missing: ${id}`,
        );
      ids.add(id);
    }
  const sources = [...ids]
    .map((id) => known.get(id))
    .filter((item): item is Evidence => item !== undefined);
  const assertion = sources.some((item) => item.confidence === "observed")
    ? "supports"
    : "unknown";
  const confidence = sources.some((item) => item.confidence === "inferred")
    ? "inferred"
    : sources.some((item) => item.confidence === "derived")
      ? "derived"
      : "observed";
  return { ids: [...ids].sort(), assertion, confidence };
};

const applicationRelation = (
  relation: string,
): BehavioralGraphEdge["relation"] => {
  switch (relation) {
    case "contains":
      return "contains";
    case "calls":
    case "invokes":
      return "calls";
    case "loads":
    case "imports":
    case "maps_to":
      return "flows-to";
    case "sends":
      return "causes";
    case "handles":
      return "transitions-to";
    case "persists_to":
      return "writes";
    case "exposes":
    case "observed_as":
    case "changed_from":
      return "evidence-links";
    default:
      return "evidence-links";
  }
};

/** Authenticate runtime target identity from the process provider's sealed execution manifest. */
const evidenceIsBoundToTarget = (
  evidence: Evidence,
  targetSha256: string,
  available: ReadonlyMap<string, Evidence>,
): boolean => {
  if (evidence.subject !== null)
    return evidence.subject.digest.sha256 === targetSha256;
  if (
    !isProcessEvidenceProvider(evidence.provider) ||
    evidence.predicate_type !== "rea.process-capture"
  )
    return false;
  if (evidence.operation === "capture_process_scenario") {
    try {
      return (
        parseProcessCapture(evidence.normalized_result).manifest
          .executable_sha256 === targetSha256
      );
    } catch {
      return false;
    }
  }
  if (evidence.operation !== "compare_process_captures") return false;
  const parameters = evidence.parameters;
  const leftId = parameters.left_evidence_id;
  const rightId = parameters.right_evidence_id;
  if (typeof leftId !== "string" || typeof rightId !== "string") return false;
  if (
    !evidence.evidence_links.includes(leftId) ||
    !evidence.evidence_links.includes(rightId)
  )
    return false;
  const left = available.get(leftId);
  const right = available.get(rightId);
  return (
    left !== undefined &&
    right !== undefined &&
    left.operation === "capture_process_scenario" &&
    right.operation === "capture_process_scenario" &&
    evidenceIsBoundToTarget(left, targetSha256, available) &&
    evidenceIsBoundToTarget(right, targetSha256, available)
  );
};
