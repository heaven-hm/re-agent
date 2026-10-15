import { z } from "zod";

const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const nodeSchema = z.strictObject({
  id: z.string().min(1),
  binarySha256: digest,
  kind: z.enum(["function", "basic-block", "memory-object", "state", "effect"]),
  address: z.string().optional(),
});
const edgeSchema = z.strictObject({
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum([
    "calls",
    "flows-to",
    "reads",
    "writes",
    "transitions-to",
    "produces",
  ]),
  evidenceIds: z.array(z.string().regex(/^ev_[0-9a-f]{64}$/u)).min(1),
  confidence: z.enum(["observed", "derived", "inferred"]),
});
export const legacyBehavioralGraphSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodes: z.array(nodeSchema).max(100_000),
  edges: z.array(edgeSchema).max(250_000),
});
export type LegacyBehavioralGraph = z.infer<typeof legacyBehavioralGraphSchema>;

/** Strict local correlation: never merge identities across binaries. */
export const validateLegacyBehavioralGraph = (
  input: unknown,
): LegacyBehavioralGraph => {
  const graph = legacyBehavioralGraphSchema.parse(input);
  const nodes = new Map<string, (typeof graph.nodes)[number]>();
  for (const node of graph.nodes) {
    if (nodes.has(node.binarySha256 + ":" + node.id))
      throw new Error("Duplicate behavioral node identity");
    nodes.set(node.binarySha256 + ":" + node.id, node);
  }
  // Build a lookup once: scanning all nodes per edge is quadratic at the
  // documented 100k-node/250k-edge budget.
  const byId = new Map<string, (typeof graph.nodes)[number]>();
  const ambiguous = new Set<string>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) ambiguous.add(node.id);
    else byId.set(node.id, node);
  }
  const signatures = new Map<string, string>();
  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) throw new Error("Dangling behavioral edge");
    if (ambiguous.has(edge.from) || ambiguous.has(edge.to))
      throw new Error("Ambiguous behavioral edge endpoint");
    if (from.binarySha256 !== to.binarySha256)
      throw new Error(
        "Cross-binary behavioral edges require explicit correspondence",
      );
    if (new Set(edge.evidenceIds).size !== edge.evidenceIds.length)
      throw new Error("Duplicate supporting evidence");
    const signature = JSON.stringify([
      edge.from,
      edge.to,
      edge.kind,
      [...edge.evidenceIds].sort(),
    ]);
    if (signatures.has(signature)) throw new Error("Duplicate behavioral edge");
    signatures.set(signature, edge.confidence);
  }
  return graph;
};

/** Additive, fail-closed graph join; does not assert semantic correspondence. */
export const mergeLegacyBehavioralGraphs = (
  left: unknown,
  right: unknown,
): LegacyBehavioralGraph => {
  const a = validateLegacyBehavioralGraph(left);
  const b = validateLegacyBehavioralGraph(right);
  const nodes = new Map(
    a.nodes.map((node) => [node.binarySha256 + ":" + node.id, node]),
  );
  for (const node of b.nodes) {
    const key = node.binarySha256 + ":" + node.id;
    const old = nodes.get(key);
    if (old && JSON.stringify(old) !== JSON.stringify(node))
      throw new Error("Conflicting behavioral node identity");
    nodes.set(key, node);
  }
  const edges = [...a.edges];
  const edgeKey = (edge: (typeof edges)[number]) =>
    JSON.stringify([
      edge.from,
      edge.to,
      edge.kind,
      [...edge.evidenceIds].sort(),
    ]);
  const known = new Map(edges.map((edge) => [edgeKey(edge), edge.confidence]));
  for (const edge of b.edges) {
    const key = edgeKey(edge);
    const existing = known.get(key);
    if (existing !== undefined && existing !== edge.confidence)
      throw new Error("Conflicting behavioral edge confidence");
    if (existing === undefined) {
      edges.push(edge);
      known.set(key, edge.confidence);
    }
  }
  return validateLegacyBehavioralGraph({
    schemaVersion: 1,
    nodes: [...nodes.values()],
    edges,
  });
};
