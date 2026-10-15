import { describe, expect, it } from "vitest";
import { mergeBehavioralGraphs, validateBehavioralGraph } from "../../../src/domain/reconstruction/BehavioralEvidenceGraph.js";

const sha = "a".repeat(64);
const ev = "ev_" + "b".repeat(64);
const node = (id: string, binarySha256 = sha) => ({ id, binarySha256, kind: "function" as const });
const edge = { from: "a", to: "b", kind: "calls" as const, evidenceIds: [ev], confidence: "observed" as const };
const graph = { schemaVersion: 1, nodes: [node("a"), node("b")], edges: [edge] };
describe("behavioral graph provenance contract", () => {
  it("accepts and idempotently joins a valid graph", () => {
    expect(mergeBehavioralGraphs(graph, graph)).toEqual(graph);
  });
  it("rejects ungrounded or cross-binary relationships", () => {
    expect(() => validateBehavioralGraph({...graph, edges: [{...edge, to:"missing"}]})).toThrow(/Dangling/u);
    expect(() => validateBehavioralGraph({...graph, nodes: [node("a"), node("b", "c".repeat(64))]})).toThrow(/Cross-binary/u);
  });
  it("rejects ambiguous identity and repeated evidence", () => {
    expect(() => validateBehavioralGraph({...graph, nodes: [node("a"), node("a")]})).toThrow(/Duplicate/u);
    expect(() => validateBehavioralGraph({...graph, edges: [{...edge, evidenceIds: [ev, ev]}]})).toThrow(/Duplicate/u);
  });
});

it("canonicalizes edge evidence order across graph merges", () => {
  const e2 = "ev_" + "c".repeat(64);
  const left = {...graph, edges: [{...edge, evidenceIds: [ev, e2]}]};
  const right = {...graph, edges: [{...edge, evidenceIds: [e2, ev]}]};
  expect(mergeBehavioralGraphs(left, right).edges).toHaveLength(1);
  expect(() => mergeBehavioralGraphs(left, {...right, edges: [{...right.edges[0]!, confidence: "inferred"}]})).toThrow(/Conflicting behavioral edge confidence/u);
});

it("permits duplicate local IDs across distinct binaries without inventing cross-binary edges", () => {
  const a = {schemaVersion:1,nodes:[node("same")],edges:[]};
  const b = {schemaVersion:1,nodes:[node("same", "c".repeat(64))],edges:[]};
  expect(mergeBehavioralGraphs(a,b).nodes).toHaveLength(2);
});
