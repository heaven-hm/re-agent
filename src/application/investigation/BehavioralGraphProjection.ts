import { digestCanonicalValue } from "../../domain/canonicalDigest.js";
import { parseEvidence, type Evidence } from "../../domain/evidence.js";
import { isProcessEvidenceProvider } from "../../domain/process/processEvidenceProvider.js";
import { parseProcessCapture } from "../../domain/process/processCaptureParsing.js";
import {
  behavioralNodeId,
  BEHAVIORAL_GRAPH_MAX_EDGES,
  BEHAVIORAL_GRAPH_MAX_NODES,
  validateBinaryBehavioralGraph,
  type BinaryBehavioralGraph,
  type BehavioralGraphCoverage,
  type BehavioralGraphEdge,
  type BehavioralGraphNode,
} from "../../domain/reconstruction/BehavioralEvidenceGraph.js";
import {
  nativeInvestigationGraphSchema,
  type NativeInvestigationGraph,
} from "../../domain/native/nativeInvestigationGraph.js";
import type { ApplicationGraphEvidence } from "../../domain/javascript/javascriptApplicationEvidenceSchemas.js";
import type { ApplicationGraphEvidenceSource } from "../javascript/JavaScriptApplicationEvidenceGraph.js";
import { parseApplicationGraphEvidence } from "../javascript/JavaScriptApplicationEvidenceGraph.js";

export interface BehavioralEvidenceProjectionInput {
  readonly records: readonly Evidence[];
  readonly nativeGraphs: readonly NativeInvestigationGraph[];
  readonly applicationSources: readonly ApplicationGraphEvidenceSource[];
  /** Retain unrelated Evidence outside this graph with a coverage gap. */
  readonly nonTargetEvidence?: "reject" | "exclude-with-coverage";
}

/** Project only authenticated claims; the ledger retains complete source values. */
export const projectEvidenceToBehavioralGraph = (
  targetSha256: string,
  input: BehavioralEvidenceProjectionInput,
): BinaryBehavioralGraph => {
  const nodeBound =
    input.records.length +
    input.applicationSources.reduce(
      (total, source) => total + source.graph.nodes.length + 1,
      0,
    );
  const edgeBound =
    input.records.reduce(
      (total, record) => total + record.evidence_links.length,
      0,
    ) +
    input.applicationSources.reduce(
      (total, source) =>
        total +
        source.graph.edges.length +
        source.evidence.evidence_links.length,
      0,
    );
  if (nodeBound > BEHAVIORAL_GRAPH_MAX_NODES)
    throw new Error("Behavioral graph node budget exceeded");
  if (edgeBound > BEHAVIORAL_GRAPH_MAX_EDGES)
    throw new Error("Behavioral graph edge budget exceeded");

  const allEvidence = new Map<string, Evidence>();
  // parseEvidence authenticates the semantic ID, which intentionally excludes
  // display subject names and local paths. Rebinding those is not a conflict.
  for (const raw of input.records) {
    const record = parseEvidence(raw);
    allEvidence.set(record.evidence_id, record);
  }
  const sources = input.applicationSources.map((source) => {
    const parsed = parseApplicationGraphEvidence(source.evidence);
    if (!parsed.ok)
      throw new Error("Application graph Evidence failed authentication");
    const owned = parsed.value;
    if (
      owned.rootArtifactSha256 !== targetSha256 ||
      source.rootArtifactSha256 !== owned.rootArtifactSha256 ||
      source.kind !== owned.kind ||
      digestCanonicalValue(source.graph, "behavioral application graph") !==
        digestCanonicalValue(owned.graph, "behavioral application graph")
    )
      throw new Error(
        "Application graph source does not match its authenticated Evidence target hash or graph",
      );
    allEvidence.set(owned.evidence.evidence_id, owned.evidence);
    return owned;
  });
  const envelopes = new Set(
    sources.map((source) => source.evidence.evidence_id),
  );
  const sourceProvenance = new Set(
    sources.flatMap((source) => source.evidence.evidence_links),
  );
  const boundEvidence = new Map<string, Evidence>();
  let excludedEvidence = 0;
  for (const record of allEvidence.values()) {
    if (
      envelopes.has(record.evidence_id) ||
      evidenceIsBoundToTarget(record, targetSha256, allEvidence)
    )
      boundEvidence.set(record.evidence_id, record);
    else if (!sourceProvenance.has(record.evidence_id)) {
      if (input.nonTargetEvidence !== "exclude-with-coverage")
        throw new Error(
          "Evidence target hash does not match behavioral graph target hash",
        );
      excludedEvidence++;
    }
  }

  const nodes = new Map<string, BehavioralGraphNode>();
  const edges = new Map<string, BehavioralGraphEdge>();
  const graphEvidenceIds = new Set(boundEvidence.keys());
  const coverage: BehavioralGraphCoverage[] = [];
  const limitations = new Set<string>();
  const addCoverage = (entry: BehavioralGraphCoverage): void => {
    if (coverage.length >= BEHAVIORAL_GRAPH_MAX_NODES)
      throw new Error("Behavioral graph coverage budget exceeded");
    coverage.push(entry);
  };
  const text = (value: string): string => {
    if (value.length <= 4096) return value;
    limitations.add(
      "Projection text was truncated to 4096 characters; complete values remain in the source Evidence or specialized graph.",
    );
    const marker = "… [truncated; see source]";
    return value.slice(0, 4096 - marker.length) + marker;
  };
  const addLimitations = (values: readonly string[]): void => {
    for (const value of values) {
      if (value.length > 0) limitations.add(text(value));
      if (limitations.size > 10_000)
        throw new Error("Behavioral graph limitation budget exceeded");
    }
  };
  const addNode = (node: BehavioralGraphNode): void => {
    const previous = nodes.get(node.id);
    if (previous === undefined) {
      if (nodes.size >= BEHAVIORAL_GRAPH_MAX_NODES)
        throw new Error("Behavioral graph node budget exceeded");
      nodes.set(node.id, node);
      return;
    }
    if (
      previous.kind !== node.kind ||
      previous.label !== node.label ||
      previous.confidence !== node.confidence ||
      previous.assertion !== node.assertion
    )
      throw new Error(`Conflicting application node assertion: ${node.id}`);
    nodes.set(node.id, {
      ...previous,
      evidenceIds: [...new Set([...previous.evidenceIds, ...node.evidenceIds])],
      locations: [
        ...new Map(
          [...previous.locations, ...node.locations].map((value) => [
            JSON.stringify(value),
            value,
          ]),
        ).values(),
      ],
    });
  };
  const addEdge = (edge: BehavioralGraphEdge): void => {
    const previous = edges.get(edge.id);
    if (previous === undefined) {
      if (edges.size >= BEHAVIORAL_GRAPH_MAX_EDGES)
        throw new Error("Behavioral graph edge budget exceeded");
      edges.set(edge.id, edge);
      return;
    }
    if (
      previous.from !== edge.from ||
      previous.to !== edge.to ||
      previous.relation !== edge.relation ||
      previous.assertion !== edge.assertion ||
      previous.confidence !== edge.confidence
    )
      throw new Error(`Conflicting application edge assertion: ${edge.id}`);
    edges.set(edge.id, {
      ...previous,
      evidenceIds: [...new Set([...previous.evidenceIds, ...edge.evidenceIds])],
    });
  };
  const observationIds = new Map<string, string>();
  if (excludedEvidence > 0) {
    addCoverage({
      facet: "evidence:non-target",
      status: "partial",
      examined: allEvidence.size,
      omitted: excludedEvidence,
      reason:
        "Evidence without the exact target SHA-256 remains in the Evidence ledger but is excluded from this binary-bound graph",
    });
    limitations.add(
      "Some checkpoint Evidence could not be bound to the graph target and is not represented as a graph assertion.",
    );
  }
  for (const record of boundEvidence.values()) {
    const id = behavioralNodeId(targetSha256, {
      kind: "evidence-observation",
      evidenceId: record.evidence_id,
    });
    observationIds.set(record.evidence_id, id);
    addNode({
      id,
      binarySha256: targetSha256,
      kind: "observation",
      label: text(`${record.predicate_type}:${record.operation}`),
      evidenceIds: [record.evidence_id],
      confidence: record.confidence,
      assertion: "unknown",
      locations: record.locations.slice(0, 10_000),
    });
    if (record.locations.length > 10_000)
      addCoverage({
        facet: `evidence:${record.evidence_id}:locations`,
        status: "partial",
        examined: record.locations.length,
        omitted: record.locations.length - 10_000,
        reason:
          "Graph location budget reached; complete locations remain in source Evidence",
      });
    addLimitations(record.limitations);
    const relationships = record.relationship_coverage;
    if (relationships !== null)
      addCoverage({
        facet: `evidence:${record.evidence_id}:relationships`,
        status:
          relationships.status === "unknown" ? "partial" : relationships.status,
        examined: 0,
        omitted: relationships.status === "complete" ? 0 : null,
        reason:
          relationships.status === "complete"
            ? null
            : text(
                "limitations" in relationships
                  ? relationships.limitations.join("; ")
                  : relationships.reason,
              ),
      });
  }
  for (const record of boundEvidence.values()) {
    const from = observationIds.get(record.evidence_id)!;
    for (const linkedId of record.evidence_links) {
      const to = observationIds.get(linkedId);
      const common = {
        id: behavioralNodeId(targetSha256, {
          relation: "evidence-links",
          sourceEvidenceId: record.evidence_id,
          linkedEvidenceId: linkedId,
        }),
        from,
        relation: "evidence-links" as const,
        evidenceIds: [record.evidence_id],
        confidence: record.confidence,
        assertion: "unknown" as const,
      };
      addEdge(
        to === undefined
          ? {
              ...common,
              to: null,
              resolution: "unresolved",
              reason: `Linked Evidence ${linkedId} was not included as a binary-bound observation`,
            }
          : { ...common, to, resolution: "resolved", reason: null },
      );
    }
  }
  for (const source of sources) {
    const factEvidence = (facts: readonly ApplicationGraphEvidence[]) => {
      const ids = new Set([source.evidence.evidence_id]);
      for (const fact of facts)
        for (const id of fact.evidence_ids) {
          if (
            !allEvidence.has(id) ||
            (!boundEvidence.has(id) &&
              !source.evidence.evidence_links.includes(id))
          )
            throw new Error(
              `Application graph Evidence reference is missing or not authenticated by its envelope: ${id}`,
            );
          ids.add(id);
          graphEvidenceIds.add(id);
        }
      const uncertain = facts.some(
        (fact) => fact.state === "unknown" || fact.state === "unavailable",
      );
      return {
        ids: [...ids].sort(),
        assertion: uncertain ? ("unknown" as const) : ("supports" as const),
        confidence: facts.some((fact) => fact.state === "inferred")
          ? ("inferred" as const)
          : uncertain
            ? ("derived" as const)
            : ("observed" as const),
      };
    };
    const factCoverage = (
      fact: ApplicationGraphEvidence,
      facet: string,
    ): void => {
      addLimitations(fact.limitations);
      if (
        fact.state === "unknown" ||
        fact.state === "unavailable" ||
        fact.coverage.status !== "complete"
      )
        addCoverage({
          facet,
          status: fact.state === "unavailable" ? "unsupported" : "partial",
          examined: 0,
          omitted: fact.coverage.omitted_count,
          reason: text(
            fact.limitations.join("; ") ||
              `Fact state ${fact.state}; coverage ${fact.coverage.status}`,
          ),
        });
      if (
        fact.location.available &&
        !["artifact-path", "native-address", "file-offset-range"].includes(
          fact.location.value.kind,
        )
      )
        addCoverage({
          facet: `${facet}:location`,
          status: "partial",
          examined: 1,
          omitted: 1,
          reason: `Application location kind ${fact.location.value.kind} remains in source Evidence; the behavioral location model cannot represent it`,
        });
    };
    const appNodeIds = new Map<string, string>();
    for (const appNode of source.graph.nodes) {
      // Observation identities distinguish conflicting/partial descriptions of
      // one semantic entity; carried-forward identical observations merge.
      const id = behavioralNodeId(targetSha256, {
        kind: "application-node",
        graphNodeId: appNode.node_id,
        observations: appNode.observations
          .map((item) => item.observation_id)
          .sort(),
      });
      appNodeIds.set(appNode.node_id, id);
      const fact = factEvidence(
        appNode.observations.map((item) => item.evidence),
      );
      const locations: BehavioralGraphNode["locations"] = [];
      appNode.observations.forEach((item, index) => {
        factCoverage(
          item.evidence,
          `application:${source.kind}:${appNode.node_id}:observation:${index}`,
        );
        const location = item.evidence.location;
        if (!location.available) return;
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
        }
      });
      addNode({
        id,
        binarySha256: targetSha256,
        kind: "observation",
        label: text(
          appNode.observations.find(({ label }) => label !== null)?.label ??
            `${appNode.kind}:${JSON.stringify(appNode.identity)}`,
        ),
        evidenceIds: fact.ids,
        confidence: fact.confidence,
        assertion: fact.assertion,
        locations,
      });
    }
    for (const appEdge of source.graph.edges) {
      const from = appNodeIds.get(appEdge.source_node_id);
      const to = appNodeIds.get(appEdge.target_node_id);
      if (from === undefined || to === undefined)
        throw new Error("Application graph contains a dangling relationship");
      const fact = factEvidence([appEdge.evidence]);
      factCoverage(
        appEdge.evidence,
        `application:${source.kind}:${appEdge.edge_id}`,
      );
      addEdge({
        id: behavioralNodeId(targetSha256, {
          kind: "application-edge",
          graphEdgeId: appEdge.edge_id,
          from,
          to,
        }),
        from,
        to,
        relation: appEdge.relation,
        resolution: "resolved",
        reason: null,
        evidenceIds: fact.ids,
        confidence: fact.confidence,
        assertion: fact.assertion,
      });
    }
    addCoverage({
      facet: `application:${source.kind}`,
      status:
        source.graph.coverage.status === "complete" ||
        source.graph.coverage.status === "partial"
          ? source.graph.coverage.status
          : source.graph.coverage.status === "unavailable"
            ? "unsupported"
            : "partial",
      examined: source.graph.nodes.length + source.graph.edges.length,
      omitted: source.graph.coverage.omitted_count,
      reason:
        source.graph.coverage.status === "complete"
          ? null
          : `Specialized application graph reports ${source.graph.coverage.status} coverage; truncated=${source.graph.coverage.truncated}`,
    });
    addLimitations(source.graph.limitations);
  }
  for (const raw of input.nativeGraphs) {
    const source = nativeInvestigationGraphSchema.parse(raw);
    if (source.target_sha256 !== targetSha256)
      throw new Error(
        "Native graph target hash does not match behavioral graph target hash",
      );
    addCoverage({
      facet: `native:${source.provider.id}`,
      status: "partial",
      examined: 0,
      omitted: source.nodes.length + source.edges.length,
      reason:
        "Native graph provenance is descriptive metadata, not immutable RE-Agent Evidence IDs; assertions were not imported",
    });
    for (const entry of source.coverage)
      addCoverage({
        ...entry,
        facet: `native:${source.provider.id}:${entry.facet}`,
        reason: entry.reason === null ? null : text(entry.reason),
      });
    if (source.truncated)
      addCoverage({
        facet: `native:${source.provider.id}:truncation`,
        status: "partial",
        examined: source.nodes.length + source.edges.length,
        omitted: null,
        reason:
          "Native provider reports a truncated graph; the number of missing facts is unknown",
      });
    limitations.add(
      "Native investigation graph facts without immutable Evidence IDs are retained only as an explicit coverage gap.",
    );
  }
  return validateBinaryBehavioralGraph({
    schemaVersion: 2,
    targetSha256,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    evidenceIds: [...graphEvidenceIds].sort(),
    coverage,
    limitations: [...limitations].sort(),
  });
};

/** Process-provider identity always comes from its sealed capture manifests. */
const evidenceIsBoundToTarget = (
  evidence: Evidence,
  targetSha256: string,
  available: ReadonlyMap<string, Evidence>,
): boolean => {
  if (isProcessEvidenceProvider(evidence.provider)) {
    if (evidence.predicate_type !== "rea.process-capture") return false;
    if (
      evidence.subject !== null &&
      evidence.subject.digest.sha256 !== targetSha256
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
    const { left_evidence_id: leftId, right_evidence_id: rightId } =
      evidence.parameters;
    if (
      typeof leftId !== "string" ||
      typeof rightId !== "string" ||
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
      isProcessEvidenceProvider(left.provider) &&
      isProcessEvidenceProvider(right.provider) &&
      left.predicate_type === "rea.process-capture" &&
      right.predicate_type === "rea.process-capture" &&
      evidenceIsBoundToTarget(left, targetSha256, available) &&
      evidenceIsBoundToTarget(right, targetSha256, available)
    );
  }
  return evidence.subject?.digest.sha256 === targetSha256;
};
