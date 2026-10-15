// Copyright © 2026 Haseeb Mir — RE-Agent contributions and extensions.
import { describe, expect, it } from "vitest";

import { createEvidence, type Evidence } from "./evidence.js";
import type { JsonValue } from "./jsonValue.js";
import { buildReconstructionSchedule } from "./reconstructionSchedule.js";

const observe = (
  address: string,
  callees: readonly string[],
  callers: readonly string[] = [],
  providerName = "Test provider",
  bodyAvailable = true,
): Evidence =>
  createEvidence(
    {
      path: "/tmp/authorized-target",
      sha256: "a".repeat(64),
      format: "elf",
      architecture: "x86_64",
    },
    { id: "test-provider", name: providerName, version: "1" },
    {
      operation: "analyze_function",
      parameters: { procedure: address },
      result: {
        procedure: {
          address,
          name: `fn_${address}`,
          classification: null,
          body: bodyAvailable
            ? {
                available: true,
                provenance: "fixture body extents",
                ranges: [{ start: address, end: address }],
                total_bytes: 1,
                span_bytes: 1,
                non_contiguous: false,
                contains_entry: true,
              }
            : { available: false, reason: "fixture" },
          signature: bodyAvailable ? "int function(void)" : null,
          locals: [],
        },
        pseudocode: bodyAvailable ? "return 0;" : "",
        assembly: [],
        comments: [],
        callers: callers.map((item) => ({
          address: item,
          name: `fn_${item}`,
          classification: null,
          body: { available: false, reason: "fixture" },
        })),
        callees: callees.map((item) => ({
          address: item,
          name: `fn_${item}`,
          classification: null,
          body: { available: false, reason: "fixture" },
        })),
        incoming_references: [],
        outgoing_references: [],
        referenced_strings: [],
        referenced_names: [],
        basic_blocks: [],
        native_api: null,
        native_value_flow: null,
        limitations: [],
      } satisfies JsonValue,
      confidence: "derived",
      authority: "shipped-artifact",
    },
  );

describe("Evidence-backed reconstruction scheduling", () => {
  it("orders dependencies first, keeps recursive functions together, and blocks callers of missing dossiers", () => {
    const result = buildReconstructionSchedule({
      functions: [
        observe("0x100", ["0x200"]),
        observe("0x200", ["0x300"]),
        observe("0x300", ["0x200"]),
      ],
      maxFunctions: 2,
      maxAttempts: 2,
    });
    expect(result.components).toEqual([["0x200", "0x300"], ["0x100"]]);
    expect(
      result.items.map(({ address, disposition }) => [address, disposition]),
    ).toEqual([
      ["0x200", "scheduled"],
      ["0x300", "scheduled"],
      ["0x100", "deferred_budget"],
    ]);
    expect(
      result.items.every(({ evidence_links }) => evidence_links.length === 1),
    ).toBe(true);
    expect(result.planning_only).toBe(true);
    expect(result.retry_counts).toBe("caller_supplied_advisory");
  });

  it("blocks functions when a callee dossier is missing", () => {
    const missing = buildReconstructionSchedule({
      functions: [observe("0x500", ["0x999"]), observe("0x600", [])],
      maxFunctions: 3,
      maxAttempts: 2,
    });
    expect(
      missing.items.find(({ address }) => address === "0x600"),
    ).toMatchObject({ disposition: "scheduled" });
    expect(
      missing.items.find(({ address }) => address === "0x500"),
    ).toMatchObject({
      disposition: "blocked_dependency",
      missing_dossiers: ["0x999"],
      blocking_dependencies: [{ address: "0x999", reason: "missing_dossier" }],
    });
  });

  it("does not schedule callers when a dependency is over budget or exhausted", () => {
    const functions = [observe("0x100", ["0x200"]), observe("0x200", [])];
    const budgeted = buildReconstructionSchedule({
      functions,
      maxFunctions: 1,
      maxAttempts: 2,
    });
    expect(budgeted.items.map(({ disposition }) => disposition)).toEqual([
      "scheduled",
      "deferred_budget",
    ]);
    const exhausted = buildReconstructionSchedule({
      functions,
      maxFunctions: 5,
      maxAttempts: 2,
      attempts: { "0x200": 2 },
    });
    expect(exhausted.items.map(({ disposition }) => disposition)).toEqual([
      "retry_limit",
      "blocked_dependency",
    ]);
    expect(
      exhausted.items.find(({ address }) => address === "0x100"),
    ).toMatchObject({
      disposition: "blocked_dependency",
      blocking_dependencies: [{ address: "0x200", reason: "retry_limit" }],
    });
  });

  it("normalizes retry address keys and rejects canonical collisions", () => {
    const normalized = buildReconstructionSchedule({
      functions: [observe("0x100", [])],
      maxFunctions: 1,
      maxAttempts: 1,
      attempts: { "0X000100": 1 },
    });
    expect(normalized.items[0]).toMatchObject({
      address: "0x100",
      disposition: "retry_limit",
    });

    expect(() =>
      buildReconstructionSchedule({
        functions: [observe("0x100", [])],
        maxFunctions: 1,
        maxAttempts: 1,
        attempts: { "0x100": 0, "0X000100": 1 },
      }),
    ).toThrow("Retry count addresses must be unique after normalization");
  });

  it("preserves unknown relationship coverage as a limitation", () => {
    const result = buildReconstructionSchedule({
      functions: [observe("0x100", ["0x200"])],
      maxFunctions: 2,
      maxAttempts: 1,
    });
    expect(result.items[0]?.missing_dossiers).toEqual(["0x200"]);
    expect(result.items[0]?.limitations).toContain(
      "Provider did not report relationship coverage.",
    );
    expect(result.items[0]?.disposition).toBe("blocked_dependency");
    expect(result.items[0]?.blocking_dependencies).toEqual([
      { address: "0x200", reason: "missing_dossier" },
    ]);
  });
});

describe("reconstruction schedule evidence gates", () => {
  it("blocks functions whose body or signature evidence is unavailable", () => {
    const result = buildReconstructionSchedule({
      functions: [observe("0x100", [], [], "Test provider", false)],
      maxFunctions: 1,
      maxAttempts: 1,
    });
    expect(result.items[0]).toMatchObject({
      disposition: "blocked_insufficient_evidence",
      evidence_gaps: [
        "body_representation",
        "function_body",
        "function_signature",
      ],
    });
  });

  it("scores only observed in-scope caller edges", () => {
    const result = buildReconstructionSchedule({
      functions: [
        observe("0x100", ["0x300"], ["0x999", "0x998"]),
        observe("0x200", ["0x300"]),
        observe("0x300", []),
      ],
      maxFunctions: 3,
      maxAttempts: 1,
    });
    expect(
      result.items.find(({ address }) => address === "0x300")?.priority,
    ).toBe(2);
    expect(
      result.items.find(({ address }) => address === "0x100")?.priority,
    ).toBe(0);
  });

  it("handles the maximum function count without recursive graph traversal", () => {
    const functions = Array.from({ length: 2000 }, (_, index) => {
      const address = `0x${(0x1000 + index).toString(16)}`;
      const callee =
        index === 1999 ? [] : [`0x${(0x1001 + index).toString(16)}`];
      return observe(address, callee);
    });
    const result = buildReconstructionSchedule({
      functions,
      maxFunctions: 2000,
      maxAttempts: 1,
    });
    expect(result.items).toHaveLength(2000);
    expect(result.budget.scheduled).toBe(2000);
    expect(result.items[0]?.address).toBe("0x17cf");
  });

  it("rejects duplicate addresses and mixed target identity", () => {
    expect(() =>
      buildReconstructionSchedule({
        functions: [observe("0x100", []), observe("0x100", [])],
        maxFunctions: 1,
        maxAttempts: 1,
      }),
    ).toThrow("Duplicate function Evidence");
    const other = createEvidence(
      {
        path: "/tmp/other",
        sha256: "b".repeat(64),
        format: "elf",
        architecture: "x86_64",
      },
      { id: "test-provider", name: "Test provider", version: "1" },
      {
        operation: "analyze_function",
        parameters: { procedure: "0x200" },
        result: {
          procedure: {
            address: "0x200",
            name: "f",
            classification: null,
            body: { available: false, reason: "fixture" },
            signature: null,
            locals: [],
          },
          pseudocode: "",
          assembly: [],
          comments: [],
          callers: [],
          callees: [],
          incoming_references: [],
          outgoing_references: [],
          referenced_strings: [],
          referenced_names: [],
          basic_blocks: [],
          native_api: null,
          native_value_flow: null,
          limitations: [],
        },
        confidence: "derived",
        authority: "shipped-artifact",
      },
    );
    expect(() =>
      buildReconstructionSchedule({
        functions: [observe("0x100", []), other],
        maxFunctions: 2,
        maxAttempts: 1,
      }),
    ).toThrow("share artifact and provider identity");
    expect(() =>
      buildReconstructionSchedule({
        functions: [
          observe("0x100", []),
          observe("0x200", [], [], "Other provider name"),
        ],
        maxFunctions: 2,
        maxAttempts: 1,
      }),
    ).toThrow("share artifact and provider identity");
  });
});
