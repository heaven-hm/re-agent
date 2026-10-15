import { z } from "zod";

import { digestCanonicalValue } from "../canonicalDigest.js";
import { digestSchema, prefixedDigestSchema } from "../digests.js";
import { evidenceLocationSchema } from "../evidence.js";
import { compareUnicodeCodePoints } from "../unicodeCodePointOrder.js";

export const BEHAVIORAL_GRAPH_MAX_NODES = 100_000;
export const BEHAVIORAL_GRAPH_MAX_EDGES = 250_000;

export const behavioralNodeKindSchema = z.enum([
  "function",
  "basic-block",
  "memory-object",
  "state",
  "effect",
  "hypothesis",
  "candidate",
  "regression",
  "verification",
  "observation",
]);
export const behavioralAssertionSchema = z.enum([
  "supports",
  "contradicts",
  "unknown",
]);
export const behavioralRelationSchema = z.enum([
  "contains",
  "calls",
  "flows-to",
  "reads",
  "writes",
  "transitions-to",
  "causes",
  "supports",
  "contradicts",
  "implements",
  "verified-by",
  "evidence-links",
]);

const nodeSchema = z.strictObject({
  id: z.string().min(1).max(4096),
  binarySha256: digestSchema,
  kind: behavioralNodeKindSchema,
  label: z.string().min(1).max(4096),
  evidenceIds: z.array(prefixedDigestSchema("ev")).min(1).max(1_000),
  confidence: z.enum(["observed", "derived", "inferred"]),
  assertion: behavioralAssertionSchema,
  locations: z.array(evidenceLocationSchema).max(10_000),
});
const edgeBaseSchema = z.strictObject({
  id: z.string().min(1).max(4096),
  from: z.string().min(1).max(4096),
  relation: behavioralRelationSchema,
  evidenceIds: z.array(prefixedDigestSchema("ev")).min(1).max(1_000),
  confidence: z.enum(["observed", "derived", "inferred"]),
  assertion: behavioralAssertionSchema,
});
export const behavioralGraphEdgeSchema = z.discriminatedUnion("resolution", [
  edgeBaseSchema.extend({
    to: z.string().min(1).max(4096),
    resolution: z.enum(["resolved", "ambiguous"]),
    reason: z.string().max(4096).nullable(),
  }),
  edgeBaseSchema.extend({
    to: z.null(),
    resolution: z.literal("unresolved"),
    reason: z.string().min(1).max(4096),
  }),
]);
const coverageSchema = z.strictObject({
  facet: z.string().min(1).max(4096),
  status: z.enum(["complete", "partial", "unsupported", "not_requested"]),
  examined: z.number().int().nonnegative(),
  omitted: z.number().int().nonnegative(),
  reason: z.string().max(4096).nullable(),
});
export const behavioralGraphSchema = z.strictObject({
  schemaVersion: z.literal(1),
  targetSha256: digestSchema,
  nodes: z.array(nodeSchema).max(BEHAVIORAL_GRAPH_MAX_NODES),
  edges: z.array(behavioralGraphEdgeSchema).max(BEHAVIORAL_GRAPH_MAX_EDGES),
  evidenceIds: z
    .array(prefixedDigestSchema("ev"))
    .max(BEHAVIORAL_GRAPH_MAX_NODES + BEHAVIORAL_GRAPH_MAX_EDGES),
  coverage: z.array(coverageSchema).max(BEHAVIORAL_GRAPH_MAX_NODES),
  limitations: z.array(z.string().min(1).max(4096)).max(10_000),
});

export type BehavioralGraph = z.infer<typeof behavioralGraphSchema>;
export type BehavioralGraphNode = z.infer<typeof nodeSchema>;
export type BehavioralGraphEdge = z.infer<typeof behavioralGraphEdgeSchema>;
export type BehavioralGraphCoverage = z.infer<typeof coverageSchema>;
export interface BehavioralEvidenceQuery {
  readonly nodeId: string;
  readonly supportingEvidenceIds: readonly string[];
  readonly contradictingEvidenceIds: readonly string[];
  readonly unresolvedEdges: readonly BehavioralGraphEdge[];
  readonly coverage: readonly BehavioralGraphCoverage[];
  readonly limitations: readonly string[];
}

/** A stable graph identity that remains distinct across binary versions. */
export const behavioralNodeId = (
  binarySha256: string,
  identity: unknown,
): string => {
  const target = digestSchema.parse(binarySha256);
  return `bg_node_${digestCanonicalValue({ target, identity }, "Behavioral graph node")}`;
};

export const createEmptyBehavioralGraph = (
  binarySha256: string,
): BehavioralGraph =>
  validateBehavioralGraph({
    schemaVersion: 1,
    targetSha256: digestSchema.parse(binarySha256),
    nodes: [],
    edges: [],
    evidenceIds: [],
    coverage: [],
    limitations: [],
  });

/** Validate references and return a deterministic, canonical graph ordering. */
export const validateBehavioralGraph = (input: unknown): BehavioralGraph => {
  const graph = behavioralGraphSchema.parse(input);
  const nodeIds = new Set<string>();
  const knownEvidence = new Set(graph.evidenceIds);
  if (knownEvidence.size !== graph.evidenceIds.length)
    throw new Error("Duplicate behavioral graph Evidence reference");
  const nodes = [...graph.nodes].sort((a, b) =>
    compareUnicodeCodePoints(a.id, b.id),
  );
  const nodesById = new Map<string, BehavioralGraphNode>();
  for (const node of nodes) {
    if (node.binarySha256 !== graph.targetSha256)
      throw new Error("Cross-binary behavioral node identity");
    if (nodeIds.has(node.id)) throw new Error("Duplicate behavioral node ID");
    nodeIds.add(node.id);
    nodesById.set(node.id, node);
    assertEvidenceReferences(node.evidenceIds, knownEvidence);
  }
  const edgeIds = new Set<string>();
  const edges = [...graph.edges].sort((a, b) =>
    compareUnicodeCodePoints(a.id, b.id),
  );
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) throw new Error("Duplicate behavioral edge ID");
    edgeIds.add(edge.id);
    const from = nodesById.get(edge.from);
    if (from === undefined) throw new Error("Dangling behavioral edge source");
    if (edge.to !== null) {
      const to = nodesById.get(edge.to);
      if (to === undefined) throw new Error("Dangling behavioral edge target");
      if (from.binarySha256 !== to.binarySha256)
        throw new Error("Cross-binary behavioral edge");
    }
    assertEvidenceReferences(edge.evidenceIds, knownEvidence);
  }
  return {
    ...graph,
    nodes: nodes.map((node) => ({
      ...node,
      evidenceIds: [...node.evidenceIds].sort(compareUnicodeCodePoints),
      locations: uniqueJson(node.locations).sort((a, b) =>
        compareUnicodeCodePoints(JSON.stringify(a), JSON.stringify(b)),
      ),
    })),
    edges: edges.map((edge) => ({
      ...edge,
      evidenceIds: [...edge.evidenceIds].sort(compareUnicodeCodePoints),
    })),
    evidenceIds: [...graph.evidenceIds].sort(compareUnicodeCodePoints),
    coverage: [...graph.coverage].sort((a, b) =>
      compareUnicodeCodePoints(JSON.stringify(a), JSON.stringify(b)),
    ),
    limitations: [...new Set(graph.limitations)].sort(compareUnicodeCodePoints),
  };
};

const assertEvidenceReferences = (
  ids: readonly string[],
  known: ReadonlySet<string>,
): void => {
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate behavioral graph Evidence reference");
  for (const id of ids)
    if (!known.has(id)) throw new Error(`Dangling Evidence reference: ${id}`);
};

/** Merge only compatible identities; equivalent assertions union provenance. */
export const mergeBehavioralGraphs = (
  leftInput: unknown,
  rightInput: unknown,
): BehavioralGraph => {
  const left = validateBehavioralGraph(leftInput);
  const right = validateBehavioralGraph(rightInput);
  if (left.targetSha256 !== right.targetSha256)
    throw new Error("Cannot merge behavioral graphs for different binaries");
  const nodes = new Map(left.nodes.map((node) => [node.id, node]));
  for (const node of right.nodes) {
    const previous = nodes.get(node.id);
    if (previous === undefined) nodes.set(node.id, node);
    else if (!sameNodeClaim(previous, node))
      throw new Error(`Conflicting node assertion: ${node.id}`);
    else
      nodes.set(node.id, {
        ...previous,
        evidenceIds: [
          ...new Set([...previous.evidenceIds, ...node.evidenceIds]),
        ].sort(compareUnicodeCodePoints),
        locations: uniqueJson([...previous.locations, ...node.locations]),
      });
  }
  const edges = new Map(left.edges.map((edge) => [edge.id, edge]));
  for (const edge of right.edges) {
    const previous = edges.get(edge.id);
    if (previous === undefined) edges.set(edge.id, edge);
    else if (!sameEdgeClaim(previous, edge))
      throw new Error(`Conflicting edge assertion: ${edge.id}`);
    else
      edges.set(edge.id, {
        ...previous,
        evidenceIds: [
          ...new Set([...previous.evidenceIds, ...edge.evidenceIds]),
        ].sort(compareUnicodeCodePoints),
      });
  }
  const coverage = new Map<string, BehavioralGraphCoverage>();
  for (const item of [...left.coverage, ...right.coverage]) {
    const key = JSON.stringify(item);
    coverage.set(key, item);
  }
  return validateBehavioralGraph({
    schemaVersion: 1,
    targetSha256: left.targetSha256,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    evidenceIds: [...new Set([...left.evidenceIds, ...right.evidenceIds])].sort(
      compareUnicodeCodePoints,
    ),
    coverage: [...coverage.values()],
    limitations: [...new Set([...left.limitations, ...right.limitations])].sort(
      compareUnicodeCodePoints,
    ),
  });
};

const sameNodeClaim = (
  a: BehavioralGraphNode,
  b: BehavioralGraphNode,
): boolean =>
  a.id === b.id &&
  a.binarySha256 === b.binarySha256 &&
  a.kind === b.kind &&
  a.label === b.label &&
  a.confidence === b.confidence &&
  a.assertion === b.assertion;
const sameEdgeClaim = (
  a: BehavioralGraphEdge,
  b: BehavioralGraphEdge,
): boolean =>
  a.id === b.id &&
  a.from === b.from &&
  a.to === b.to &&
  a.relation === b.relation &&
  a.resolution === b.resolution &&
  a.reason === b.reason &&
  a.confidence === b.confidence &&
  a.assertion === b.assertion;
const uniqueJson = <T>(values: readonly T[]): T[] => [
  ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
];

/** Return evidence and known coverage for one graph assertion node. */
export const queryBehavioralEvidence = (
  graphInput: unknown,
  nodeId: string,
): BehavioralEvidenceQuery => {
  const graph = validateBehavioralGraph(graphInput);
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (node === undefined) throw new Error(`Unknown behavioral node: ${nodeId}`);
  const related = graph.edges.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId,
  );
  const ids = (values: readonly BehavioralGraphEdge[]): string[] =>
    [...new Set(values.flatMap((edge) => edge.evidenceIds))].sort(
      compareUnicodeCodePoints,
    );
  return {
    nodeId,
    supportingEvidenceIds: [
      ...new Set([
        ...(node.assertion === "supports" ? node.evidenceIds : []),
        ...ids(related.filter((edge) => edge.assertion === "supports")),
      ]),
    ].sort(compareUnicodeCodePoints),
    contradictingEvidenceIds: [
      ...new Set([
        ...(node.assertion === "contradicts" ? node.evidenceIds : []),
        ...ids(related.filter((edge) => edge.assertion === "contradicts")),
      ]),
    ].sort(compareUnicodeCodePoints),
    unresolvedEdges: related.filter((edge) => edge.resolution !== "resolved"),
    coverage: graph.coverage,
    limitations: graph.limitations,
  };
};
