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
          body: { available: false, reason: "fixture" },
          signature: null,
          locals: [],
        },
        pseudocode: "",
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
  it("orders dependencies first, keeps recursive functions together, and marks missing dossiers", () => {
    const result = buildReconstructionSchedule({
      functions: [
        observe("0x100", ["0x200"]),
        observe("0x200", ["0x300", "0x400"]),
        observe("0x300", ["0x200"]),
        observe("0x400", ["0x999"]),
      ],
      maxFunctions: 3,
      maxAttempts: 2,
    });
    expect(result.components).toEqual([
      ["0x400"],
      ["0x200", "0x300"],
      ["0x100"],
    ]);
    expect(
      result.items.map(({ address, disposition }) => [address, disposition]),
    ).toEqual([
      ["0x400", "scheduled"],
      ["0x200", "scheduled"],
      ["0x300", "scheduled"],
      ["0x100", "deferred_budget"],
    ]);
    expect(
      result.items.find(({ address }) => address === "0x400")?.missing_dossiers,
    ).toEqual(["0x999"]);
    expect(
      result.items.every(({ evidence_links }) => evidence_links.length === 1),
    ).toBe(true);
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
      "deferred_budget",
    ]);
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
    expect(result.items[0]?.disposition).toBe("scheduled");
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
