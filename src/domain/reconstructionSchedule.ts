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
  attempts: z.record(z.string(), z.number().int().nonnegative()).default({}),
});

/** Public session-tool input for an Evidence-backed reconstruction plan. */
export const reconstructionScheduleInputSchema = z.strictObject({
  functions: z.array(evidenceSchema).min(1).max(2000),
  max_functions: z.number().int().min(1).max(10000),
  max_attempts: z.number().int().min(1).max(100),
  attempts: z.record(z.string(), z.number().int().nonnegative()).default({}),
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
      limitations: z.array(z.string()),
      attempt: z.number().int().positive(),
      priority: z.number().int().nonnegative(),
      disposition: z.enum(["scheduled", "deferred_budget", "retry_limit"]),
    }),
  ),
  components: z.array(z.array(z.string().min(1)).min(1)),
  evidence_links: z.array(z.string().min(1)).min(1),
  limitations: z.array(z.string()),
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
  readonly limitations: readonly string[];
  readonly attempt: number;
  readonly priority: number;
  readonly disposition: "scheduled" | "deferred_budget" | "retry_limit";
}

export interface ReconstructionSchedule {
  readonly artifact_sha256: string;
  readonly provider_id: string;
  readonly items: readonly ReconstructionScheduleItem[];
  readonly components: readonly (readonly string[])[];
  readonly evidence_links: readonly string[];
  readonly limitations: readonly string[];
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
    snapshots,
  );
  const selected = selectComponents({
    components,
    graph: graph.edges,
    attempts: input.attempts,
    maxAttempts: input.maxAttempts,
    maxFunctions: input.maxFunctions,
  });
  const items = makeScheduleItems({
    components,
    snapshots,
    graph,
    selected,
    input,
  });
  const scheduledCount = items.filter(
    ({ disposition }) => disposition === "scheduled",
  ).length;
  const limitations = [
    ...new Set(items.flatMap(({ limitations: values }) => values)),
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
  readonly evidenceByAddress: Map<string, string[]>;
  readonly baseLimitations: Map<string, string[]>;
  readonly missingByAddress: Map<string, string[]>;
  readonly unresolvedByAddress: Map<
    string,
    { address: string; reason: string }[]
  >;
}

const functionGraph = (snapshots: FunctionSnapshots): FunctionGraph => {
  const graph: FunctionGraph = {
    edges: new Map(),
    evidenceByAddress: new Map(),
    baseLimitations: new Map(),
    missingByAddress: new Map(),
    unresolvedByAddress: new Map(),
  };
  for (const [address, snapshot] of snapshots) {
    const dependencies = snapshot.dossier.callees.map(({ address: callee }) =>
      parseCallPathAddress(callee),
    );
    graph.edges.set(address, new Set(dependencies));
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
  return graph;
};

const orderComponents = (
  components: string[][],
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  snapshots: FunctionSnapshots,
): string[][] => {
  const componentFor = new Map<string, number>();
  components.forEach((members, index) =>
    members.forEach((address) => componentFor.set(address, index)),
  );
  const pending = new Set(components.map((_, index) => index));
  const ordered: number[] = [];
  const ready = (id: number): boolean =>
    (components[id] ?? []).every((address) =>
      [...(graph.get(address) ?? [])].every((callee) => {
        const dependency = componentFor.get(callee);
        return (
          dependency === undefined ||
          dependency === id ||
          !pending.has(dependency)
        );
      }),
    );
  const score = (id: number): number =>
    Math.max(
      ...(components[id] ?? []).map(
        (address) => snapshots.get(address)?.dossier.callers.length ?? 0,
      ),
    );
  while (pending.size > 0) {
    const next = [...pending]
      .filter(ready)
      .sort(
        (left, right) =>
          score(right) - score(left) ||
          compareUnicodeCodePoints(
            components[left]?.[0] ?? "",
            components[right]?.[0] ?? "",
          ),
      )[0];
    if (next === undefined)
      throw new Error("Condensed function graph unexpectedly contains a cycle");
    ordered.push(next);
    pending.delete(next);
  }
  return ordered.map((id) => components[id] ?? []);
};

const selectComponents = ({
  components,
  graph,
  attempts,
  maxAttempts,
  maxFunctions,
}: {
  readonly components: readonly string[][];
  readonly graph: ReadonlyMap<string, ReadonlySet<string>>;
  readonly attempts: Readonly<Record<string, number>>;
  readonly maxAttempts: number;
  readonly maxFunctions: number;
}): Set<number> => {
  const componentFor = new Map<string, number>();
  components.forEach((members, index) =>
    members.forEach((address) => componentFor.set(address, index)),
  );
  const selected = new Set<number>();
  let budget = maxFunctions;
  components.forEach((members, component) => {
    const eligible = members.every(
      (address) => (attempts[address] ?? 0) < maxAttempts,
    );
    const dependenciesSelected = members.every((address) =>
      [...(graph.get(address) ?? [])].every((callee) => {
        const dependency = componentFor.get(callee);
        return (
          dependency === undefined ||
          dependency === component ||
          selected.has(dependency)
        );
      }),
    );
    if (!eligible || !dependenciesSelected || members.length > budget) return;
    selected.add(component);
    budget -= members.length;
  });
  return selected;
};

const makeScheduleItems = ({
  components,
  snapshots,
  graph,
  selected,
  input,
}: {
  readonly components: readonly string[][];
  readonly snapshots: FunctionSnapshots;
  readonly graph: FunctionGraph;
  readonly selected: ReadonlySet<number>;
  readonly input: z.infer<typeof inputSchema>;
}): ReconstructionScheduleItem[] =>
  components.flatMap((members, component) =>
    members.map((address) => {
      const snapshot = snapshots.get(address);
      if (snapshot === undefined)
        throw new Error(`Missing snapshot ${address}`);
      const retriesExhausted =
        (input.attempts[address] ?? 0) >= input.maxAttempts;
      return {
        address,
        name: snapshot.dossier.procedure.name,
        component,
        component_size: members.length,
        evidence_links: graph.evidenceByAddress.get(address) ?? [],
        unresolved_calls: graph.unresolvedByAddress.get(address) ?? [],
        missing_dossiers: graph.missingByAddress.get(address) ?? [],
        limitations: graph.baseLimitations.get(address) ?? [],
        attempt: (input.attempts[address] ?? 0) + 1,
        priority: snapshot.dossier.callers.length,
        disposition: retriesExhausted
          ? "retry_limit"
          : selected.has(component)
            ? "scheduled"
            : "deferred_budget",
      };
    }),
  );

const stronglyConnectedComponents = (
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] => {
  let index = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  const visit = (address: string): void => {
    indices.set(address, index);
    lowLinks.set(address, index);
    index += 1;
    stack.push(address);
    onStack.add(address);
    for (const callee of [...(graph.get(address) ?? [])]
      .filter((item) => graph.has(item))
      .sort(compareUnicodeCodePoints)) {
      if (!indices.has(callee)) {
        visit(callee);
        lowLinks.set(
          address,
          Math.min(lowLinks.get(address) ?? 0, lowLinks.get(callee) ?? 0),
        );
      } else if (onStack.has(callee)) {
        lowLinks.set(
          address,
          Math.min(lowLinks.get(address) ?? 0, indices.get(callee) ?? 0),
        );
      }
    }
    if (lowLinks.get(address) !== indices.get(address)) return;
    const component: string[] = [];
    while (true) {
      const member = stack.pop();
      if (member === undefined) throw new Error("SCC stack underflow");
      onStack.delete(member);
      component.push(member);
      if (member === address) break;
    }
    result.push(component.sort(compareUnicodeCodePoints));
  };
  for (const address of [...graph.keys()].sort(compareUnicodeCodePoints))
    if (!indices.has(address)) visit(address);
  return result;
};
