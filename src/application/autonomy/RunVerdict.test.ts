import { describe, expect, it } from "vitest";
import { deriveRunVerdict } from "./RunVerdict.js";

describe("deriveRunVerdict", () => {
  it("marks empty case lists UNVERIFIED without inventing results", () => {
    expect(deriveRunVerdict([])).toMatchObject({
      verdict: "UNVERIFIED",
      passed: [],
      failed: [],
      unknown: [],
    });
  });

  it("marks all-passed runs PASS", () => {
    const report = deriveRunVerdict([
      { caseId: "help", comparisonEvidenceId: "ev_a", status: "pass" },
      { caseId: "version", comparisonEvidenceId: "ev_b", status: "pass" },
    ]);
    expect(report.verdict).toBe("PASS");
    expect(report.passed).toEqual(["help", "version"]);
  });

  it("marks mixed pass/fail runs PARTIAL and all-fail runs FAIL", () => {
    expect(
      deriveRunVerdict([
        { caseId: "a", comparisonEvidenceId: "ev_a", status: "pass" },
        { caseId: "b", comparisonEvidenceId: "ev_b", status: "fail" },
      ]).verdict,
    ).toBe("PARTIAL");
    expect(
      deriveRunVerdict([
        { caseId: "a", comparisonEvidenceId: "ev_a", status: "fail" },
      ]).verdict,
    ).toBe("FAIL");
  });

  it("keeps unknown coverage UNVERIFIED instead of promoting it", () => {
    const report = deriveRunVerdict([
      { caseId: "a", comparisonEvidenceId: "ev_a", status: "pass" },
      { caseId: "b", comparisonEvidenceId: "ev_b", status: "unknown" },
    ]);
    expect(report.verdict).toBe("UNVERIFIED");
    expect(report.unknown).toEqual(["b"]);
  });

  it("rejects malformed cases instead of grading them", () => {
    expect(() =>
      deriveRunVerdict([
        { caseId: "", comparisonEvidenceId: "ev", status: "pass" },
      ]),
    ).toThrow();
  });
});
