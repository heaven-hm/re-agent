// Copyright © 2026 Haseeb Mir — RE-Agent contributions and extensions.
import { z } from "zod";

import { parseCallPathAddress } from "./callPathSchemas.js";
import { parseFunctionEvidence } from "./functionDossierEvidence.js";
import { evidenceSchema, type Evidence } from "./evidence.js";
import { compareUnicodeCodePoints } from "./unicodeCodePointOrder.js";

const inputSchema = z.strictObject({
  functions: z.array(evidenceSchema).min(1).max(2000),
  maxFunctions: z.number().int().min(1).max(10000),
  maxAttempts: z.number().int().min(1).max(100),
  attempts: z
    .record(
      z.string(),
      z.number().int().max(Number.MAX_SAFE_INTEGER).nonnegative(),
    )
    .default({}),
});
const MAX_FUNCTION_RELATIONSHIPS = 100_000;

/** Public session-tool input for an Evidence-backed reconstruction plan. */
export const reconstructionScheduleInputSchema = z.strictObject({
  functions: z.array(evidenceSchema).min(1).max(2000),
  max_functions: z.number().int().min(1).max(10000),
  max_attempts: z.number().int().min(1).max(100),
  attempts: z
    .record(
      z.string(),
      z.number().int().max(Number.MAX_SAFE_INTEGER).nonnegative(),
    )
    .default({}),
});

/** Stable output contract for schedule reports and persisted Evidence. */
export const reconstructionScheduleResultSchema = z.strictObject({
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  provider_id: z.string().min(1),
  items: z.array(
    z.strictObject({
      address: z.string().min(1),
      name: z.string().nullable(),
      component: z.number().int().nonnegative(),
      component_size: z.number().int().positive(),
      evidence_links: z.array(z.string().min(1)).min(1),
      unresolved_calls: z.array(
        z.strictObject({ address: z.string(), reason: z.string() }),
      ),
      missing_dossiers: z.array(z.string()),
      blocking_dependencies: z.array(
        z.strictObject({
          address: z.string(),
          reason: z.enum([
            "missing_dossier",
            "retry_limit",
            "insufficient_evidence",
            "budget",
          ]),
        }),
      ),
      evidence_gaps: z.array(z.string()),
      limitations: z.array(z.string()),
      attempt: z.number().int().positive(),
      priority: z.number().int().nonnegative(),
      disposition: z.enum([
        "scheduled",
        "deferred_budget",
        "blocked_dependency",
        "blocked_insufficient_evidence",
        "retry_limit",
      ]),
    }),
  ),
  components: z.array(z.array(z.string().min(1)).min(1)),
  evidence_links: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string()),
  planning_only: z.literal(true),
  retry_counts: z.literal("caller_supplied_advisory"),
  budget: z.strictObject({
    requested: z.number().int().positive(),
    scheduled: z.number().int().nonnegative(),
  }),
});

export interface ReconstructionScheduleInput {
  readonly functions: readonly Evidence[];
  readonly maxFunctions: number;
  readonly maxAttempts: number;
  /** Prior attempts keyed by canonical function address; omitted means zero. */
  readonly attempts?: Readonly<Record<string, number>>;
}

export interface ReconstructionScheduleItem {
  readonly address: string;
  readonly name: string | null;
  readonly component: number;
  readonly component_size: number;
  readonly evidence_links: readonly string[];
  readonly unresolved_calls: readonly {
    readonly address: string;
    readonly reason: string;
  }[];
  readonly missing_dossiers: readonly string[];
  readonly blocking_dependencies: readonly {
    readonly address: string;
    readonly reason:
      | "missing_dossier"
      | "retry_limit"
      | "insufficient_evidence"
      | "budget";
  }[];
  readonly evidence_gaps: readonly string[];
  readonly limitations: readonly string[];
  readonly attempt: number;
  readonly priority: number;
  readonly disposition:
    | "scheduled"
    | "deferred_budget"
    | "blocked_dependency"
    | "blocked_insufficient_evidence"
    | "retry_limit";
}

export interface ReconstructionSchedule {
  readonly artifact_sha256: string;
  readonly provider_id: string;
  readonly items: readonly ReconstructionScheduleItem[];
  readonly components: readonly (readonly string[])[];
  readonly evidence_links: readonly string[];
  readonly limitations: readonly string[];
  readonly planning_only: true;
  readonly retry_counts: "caller_supplied_advisory";
  readonly budget: { readonly requested: number; readonly scheduled: number };
}

/** Build a deterministic callee-first plan from artifact-bound function Evidence. */
export const buildReconstructionSchedule = (
  rawInput: ReconstructionScheduleInput,
): ReconstructionSchedule => {
  const input = inputSchema.parse(rawInput);
  const snapshots = parseSnapshots(input.functions);
  const first = snapshots.values().next().value;
  if (first === undefined) throw new TypeError("Function Evidence is required");
  assertSharedIdentity(snapshots, first);
  const graph = functionGraph(snapshots);
  const components = orderComponents(
    stronglyConnectedComponents(graph.edges),
    graph.edges,
    graph.incoming,
  );
  const selection = selectComponents({
    components,
    graph: graph.edges,
    incoming: graph.incoming,
    snapshots,
    attempts: input.attempts,
    maxAttempts: input.maxAttempts,
    maxFunctions: input.maxFunctions,
  });
  const items = makeScheduleItems({
    components,
    snapshots,
    graph,
    ...selection,
    input,
  });
  const scheduledCount = items.filter(
    ({ disposition }) => disposition === "scheduled",
  ).length;
  const limitations = [
    ...new Set(
      items.flatMap((item) => [
        ...item.limitations,
        ...item.evidence_gaps.map(
          (gap) => `Required reconstruction evidence is missing: ${gap}.`,
        ),
        ...item.blocking_dependencies.map(
          ({ address, reason }) =>
            `Dependency ${address} blocks scheduling: ${reason}.`,
        ),
      ]),
    ),
  ].sort(compareUnicodeCodePoints);
  return reconstructionScheduleResultSchema.parse({
    artifact_sha256: first.subject.digest.sha256,
    provider_id: first.evidence.provider.id,
    items,
    components,
    evidence_links: [
      ...new Set(items.flatMap(({ evidence_links: links }) => links)),
    ].sort(compareUnicodeCodePoints),
    limitations,
    planning_only: true,
    retry_counts: "caller_supplied_advisory",
    budget: { requested: input.maxFunctions, scheduled: scheduledCount },
  });
};

type FunctionSnapshot = ReturnType<typeof parseFunctionEvidence>;
type FunctionSnapshots = ReadonlyMap<string, FunctionSnapshot>;

const parseSnapshots = (functions: readonly Evidence[]) => {
  const snapshots = new Map<string, FunctionSnapshot>();
  for (const evidence of functions) {
    const snapshot = parseFunctionEvidence(evidence);
    const address = parseCallPathAddress(snapshot.dossier.procedure.address);
    if (snapshots.has(address))
      throw new TypeError(`Duplicate function Evidence for ${address}`);
    snapshots.set(address, snapshot);
  }
  return snapshots;
};

const assertSharedIdentity = (
  snapshots: FunctionSnapshots,
  first: FunctionSnapshot,
): void => {
  const compatible = [...snapshots.values()].every(
    (snapshot) =>
      snapshot.subject.digest.sha256 === first.subject.digest.sha256 &&
      snapshot.subject.format === first.subject.format &&
      snapshot.subject.architecture === first.subject.architecture &&
      snapshot.evidence.provider.id === first.evidence.provider.id &&
      snapshot.evidence.provider.name === first.evidence.provider.name &&
      snapshot.evidence.provider.version === first.evidence.provider.version,
  );
  if (!compatible)
    throw new TypeError(
      "Schedule Evidence must share artifact and provider identity",
    );
};

interface FunctionGraph {
  readonly edges: Map<string, Set<string>>;
  readonly incoming: Map<string, Set<string>>;
  readonly evidenceByAddress: Map<string, string[]>;
  readonly baseLimitations: Map<string, string[]>;
  readonly missingByAddress: Map<string, string[]>;
  readonly unresolvedByAddress: Map<
    string,
    { address: string; reason: string }[]
  >;
}

const functionGraph = (snapshots: FunctionSnapshots): FunctionGraph => {
  let relationshipCount = 0;
  const graph: FunctionGraph = {
    edges: new Map(),
    incoming: new Map(),
    evidenceByAddress: new Map(),
    baseLimitations: new Map(),
    missingByAddress: new Map(),
    unresolvedByAddress: new Map(),
  };
  for (const [address, snapshot] of snapshots) {
    const dependencies = snapshot.dossier.callees
      .filter(({ classification }) => classification?.external !== true)
      .map(({ address: callee }) => parseCallPathAddress(callee));
    relationshipCount += dependencies.length;
    relationshipCount += snapshot.dossier.unresolved_calls?.length ?? 0;
    if (relationshipCount > MAX_FUNCTION_RELATIONSHIPS)
      throw new RangeError(
        `Function dependency graph exceeds ${MAX_FUNCTION_RELATIONSHIPS} relationships`,
      );
    graph.edges.set(address, new Set(dependencies));
    graph.incoming.set(address, new Set());
    graph.evidenceByAddress.set(address, [snapshot.evidence.evidence_id]);
    graph.baseLimitations.set(address, [
      ...snapshot.limitations,
      ...snapshot.callCoverageLimitations,
    ]);
    graph.missingByAddress.set(
      address,
      dependencies
        .filter((callee) => !snapshots.has(callee))
        .sort(compareUnicodeCodePoints),
    );
    graph.unresolvedByAddress.set(
      address,
      snapshot.dossier.unresolved_calls ?? [],
    );
  }
  for (const [caller, dependencies] of graph.edges)
    for (const callee of dependencies)
      if (graph.incoming.has(callee)) graph.incoming.get(callee)?.add(caller);
  return graph;
};

const orderComponents = (
  components: string[][],
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  incoming: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] => {
  const componentFor = new Map<string, number>();
  components.forEach((members, index) =>
    members.forEach((address) => componentFor.set(address, index)),
  );
  const prerequisites = components.map(() => new Set<number>());
  const dependents = components.map(() => new Set<number>());
  for (const [caller, callees] of graph) {
    const callerComponent = componentFor.get(caller);
    if (callerComponent === undefined) continue;
    for (const callee of callees) {
      const calleeComponent = componentFor.get(callee);
      if (calleeComponent === undefined || calleeComponent === callerComponent)
        continue;
      prerequisites[callerComponent]?.add(calleeComponent);
      dependents[calleeComponent]?.add(callerComponent);
    }
  }
  const compare = (left: number, right: number): number =>
    componentPriority(right, components, incoming) -
      componentPriority(left, components, incoming) ||
    compareUnicodeCodePoints(
      components[left]?.[0] ?? "",
      components[right]?.[0] ?? "",
    );
  const ready = new MinPriorityQueue(compare);
  const remaining = prerequisites.map((items) => items.size);
  remaining.forEach((count, id) => {
    if (count === 0) ready.push(id);
  });
  const ordered: number[] = [];
  while (ready.size > 0) {
    const next = ready.pop();
    if (next === undefined) break;
    ordered.push(next);
    for (const dependent of dependents[next] ?? []) {
      const count = (remaining[dependent] ?? 0) - 1;
      remaining[dependent] = count;
      if (count === 0) ready.push(dependent);
    }
  }
  if (ordered.length !== components.length)
    throw new Error("Condensed function graph unexpectedly contains a cycle");
  return ordered.map((id) => components[id] ?? []);
};

const selectComponents = ({
  components,
  graph,
  incoming,
  snapshots,
  attempts,
  maxAttempts,
  maxFunctions,
}: {
  readonly components: readonly string[][];
  readonly graph: ReadonlyMap<string, ReadonlySet<string>>;
  readonly incoming: ReadonlyMap<string, ReadonlySet<string>>;
  readonly snapshots: FunctionSnapshots;
  readonly attempts: Readonly<Record<string, number>>;
  readonly maxAttempts: number;
  readonly maxFunctions: number;
}): {
  readonly selected: ReadonlySet<number>;
  readonly dispositions: ReadonlyMap<
    number,
    ReconstructionScheduleItem["disposition"]
  >;
  readonly blockers: ReadonlyMap<
    number,
    readonly {
      readonly address: string;
      readonly reason: ReconstructionScheduleItem["blocking_dependencies"][number]["reason"];
    }[]
  >;
  readonly priorityByAddress: ReadonlyMap<string, number>;
} => {
  const componentFor = new Map<string, number>();
  components.forEach((members, index) =>
    members.forEach((address) => componentFor.set(address, index)),
  );
  const selected = new Set<number>();
  const dispositions = new Map<
    number,
    ReconstructionScheduleItem["disposition"]
  >();
  const blockers = new Map<
    number,
    readonly ReconstructionScheduleItem["blocking_dependencies"][number][]
  >();
  const priorityByAddress = new Map(
    [...incoming].map(([address, callers]) => [address, callers.size]),
  );
  let budget = maxFunctions;
  components.forEach((members, component) => {
    const eligible = members.every(
      (address) => (attempts[address] ?? 0) < maxAttempts,
    );
    if (!eligible) {
      dispositions.set(component, "retry_limit");
      return;
    }
    if (
      members.some((address) => {
        const snapshot = snapshots.get(address);
        return (
          snapshot === undefined || functionEvidenceGaps(snapshot).length > 0
        );
      })
    ) {
      dispositions.set(component, "blocked_insufficient_evidence");
      return;
    }
    const blocked: ReconstructionScheduleItem["blocking_dependencies"][number][] =
      [];
    for (const address of members)
      for (const callee of graph.get(address) ?? []) {
        const dependency = componentFor.get(callee);
        if (dependency === undefined) {
          blocked.push({ address: callee, reason: "missing_dossier" });
          continue;
        }
        if (dependency === component || selected.has(dependency)) continue;
        const dependencyDisposition = dispositions.get(dependency);
        if (dependencyDisposition === "deferred_budget") {
          blocked.push({ address: callee, reason: "budget" });
        } else if (dependencyDisposition === "retry_limit") {
          blocked.push({ address: callee, reason: "retry_limit" });
        } else if (dependencyDisposition === "blocked_insufficient_evidence") {
          blocked.push({ address: callee, reason: "insufficient_evidence" });
        } else {
          const inherited = blockers.get(dependency) ?? [];
          if (inherited.length > 0) blocked.push(...inherited);
          else
            blocked.push({ address: callee, reason: "insufficient_evidence" });
        }
      }
    if (blocked.length > 0) {
      blockers.set(component, uniqueBlockers(blocked));
      dispositions.set(component, "blocked_dependency");
      return;
    }
    if (members.length > budget) {
      dispositions.set(component, "deferred_budget");
      return;
    }
    selected.add(component);
    dispositions.set(component, "scheduled");
    budget -= members.length;
  });
  return { selected, dispositions, blockers, priorityByAddress };
};

const makeScheduleItems = ({
  components,
  snapshots,
  graph,
  selected,
  dispositions,
  blockers,
  priorityByAddress,
  input,
}: {
  readonly components: readonly string[][];
  readonly snapshots: FunctionSnapshots;
  readonly graph: FunctionGraph;
  readonly selected: ReadonlySet<number>;
  readonly dispositions: ReadonlyMap<
    number,
    ReconstructionScheduleItem["disposition"]
  >;
  readonly blockers: ReadonlyMap<
    number,
    readonly ReconstructionScheduleItem["blocking_dependencies"][number][]
  >;
  readonly priorityByAddress: ReadonlyMap<string, number>;
  readonly input: z.infer<typeof inputSchema>;
}): ReconstructionScheduleItem[] =>
  components.flatMap((members, component) =>
    members.map((address) => {
      const snapshot = snapshots.get(address);
      if (snapshot === undefined)
        throw new Error(`Missing snapshot ${address}`);
      const evidenceGaps = functionEvidenceGaps(snapshot);
      const componentDisposition = dispositions.get(component);
      if (componentDisposition === undefined)
        throw new Error(`Missing component disposition ${component}`);
      const blockingDependencies = blockers.get(component) ?? [];
      return {
        address,
        name: snapshot.dossier.procedure.name,
        component,
        component_size: members.length,
        evidence_links: graph.evidenceByAddress.get(address) ?? [],
        unresolved_calls: graph.unresolvedByAddress.get(address) ?? [],
        missing_dossiers: graph.missingByAddress.get(address) ?? [],
        blocking_dependencies: blockingDependencies,
        evidence_gaps: evidenceGaps,
        limitations: [
          ...(graph.baseLimitations.get(address) ?? []),
          ...evidenceGaps.map(
            (gap) => `Required reconstruction evidence is missing: ${gap}.`,
          ),
          ...blockingDependencies.map(
            ({ address: dependency, reason }) =>
              `Dependency ${dependency} blocks scheduling: ${reason}.`,
          ),
        ],
        attempt: Math.min(
          (input.attempts[address] ?? 0) + 1,
          input.maxAttempts,
        ),
        priority: priorityByAddress.get(address) ?? 0,
        disposition: selected.has(component)
          ? "scheduled"
          : componentDisposition,
      };
    }),
  );

const stronglyConnectedComponents = (
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] => {
  const nodes = [...graph.keys()].sort(compareUnicodeCodePoints);
  const adjacency = new Map(
    nodes.map((node) => [
      node,
      [...(graph.get(node) ?? [])]
        .filter((item) => graph.has(item))
        .sort(compareUnicodeCodePoints),
    ]),
  );
  const reverse = new Map(nodes.map((node) => [node, new Set<string>()]));
  for (const [node, neighbors] of adjacency)
    for (const neighbor of neighbors) reverse.get(neighbor)?.add(node);

  const visited = new Set<string>();
  const finished: string[] = [];
  for (const root of nodes) {
    if (visited.has(root)) continue;
    visited.add(root);
    const frames = [{ node: root, index: 0 }];
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame === undefined) break;
      const neighbors = adjacency.get(frame.node) ?? [];
      const next = neighbors[frame.index];
      if (next !== undefined) {
        frame.index += 1;
        if (visited.has(next)) continue;
        visited.add(next);
        frames.push({ node: next, index: 0 });
        continue;
      }
      frames.pop();
      finished.push(frame.node);
    }
  }

  visited.clear();
  const result: string[][] = [];
  for (const root of finished.reverse()) {
    if (visited.has(root)) continue;
    const component: string[] = [];
    const pending = [root];
    visited.add(root);
    while (pending.length > 0) {
      const node = pending.pop();
      if (node === undefined) continue;
      component.push(node);
      for (const predecessor of reverse.get(node) ?? []) {
        if (visited.has(predecessor)) continue;
        visited.add(predecessor);
        pending.push(predecessor);
      }
    }
    result.push(component.sort(compareUnicodeCodePoints));
  }
  return result;
};

const functionEvidenceGaps = (snapshot: FunctionSnapshot): string[] => {
  const gaps: string[] = [];
  if (!snapshot.dossier.procedure.body.available) gaps.push("function_body");
  if (snapshot.dossier.procedure.signature === null)
    gaps.push("function_signature");
  if (
    snapshot.dossier.pseudocode.trim().length === 0 &&
    snapshot.dossier.assembly.length === 0 &&
    snapshot.dossier.basic_blocks.length === 0
  )
    gaps.push("body_representation");
  if ((snapshot.dossier.unresolved_calls?.length ?? 0) > 0)
    gaps.push("unresolved_call_targets");
  return gaps.sort(compareUnicodeCodePoints);
};

const componentPriority = (
  component: number,
  components: readonly (readonly string[])[],
  incoming: ReadonlyMap<string, ReadonlySet<string>>,
): number =>
  Math.max(
    0,
    ...(components[component] ?? []).map(
      (address) => incoming.get(address)?.size ?? 0,
    ),
  );

const uniqueBlockers = (
  blockers: readonly ReconstructionScheduleItem["blocking_dependencies"][number][],
): ReconstructionScheduleItem["blocking_dependencies"][number][] => {
  const unique = new Map(
    blockers.map((blocker) => [
      `${blocker.address}\u0000${blocker.reason}`,
      blocker,
    ]),
  );
  return [...unique.values()].sort(
    (left, right) =>
      compareUnicodeCodePoints(left.address, right.address) ||
      compareUnicodeCodePoints(left.reason, right.reason),
  );
};

class MinPriorityQueue {
  readonly #items: number[] = [];
  readonly #compare: (left: number, right: number) => number;

  constructor(compare: (left: number, right: number) => number) {
    this.#compare = compare;
  }

  get size(): number {
    return this.#items.length;
  }

  push(value: number): void {
    this.#items.push(value);
    let index = this.#items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentValue = this.#items[parent];
      const current = this.#items[index];
      if (
        parentValue === undefined ||
        current === undefined ||
        this.#compare(parentValue, current) <= 0
      )
        break;
      this.#items[parent] = current;
      this.#items[index] = parentValue;
      index = parent;
    }
  }

  pop(): number | undefined {
    const first = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length === 0 || last === undefined) return first;
    this.#items[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      const smallestValue = this.#items[smallest];
      const leftValue = this.#items[left];
      const rightValue = this.#items[right];
      if (
        leftValue !== undefined &&
        smallestValue !== undefined &&
        this.#compare(leftValue, smallestValue) < 0
      )
        smallest = left;
      const currentSmallest = this.#items[smallest];
      if (
        rightValue !== undefined &&
        currentSmallest !== undefined &&
        this.#compare(rightValue, currentSmallest) < 0
      )
        smallest = right;
      if (smallest === index) break;
      const temporary = this.#items[index];
      const replacement = this.#items[smallest];
      if (temporary === undefined || replacement === undefined) break;
      this.#items[index] = replacement;
      this.#items[smallest] = temporary;
      index = smallest;
    }
    return first;
  }
}
