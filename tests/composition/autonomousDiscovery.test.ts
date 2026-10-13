import { expect, it } from "vitest";
import { parseAutonomousAnalysisEvidence } from "../../src/composition/autonomousDiscovery.js";

it("preserves the actual provider failure and remediation instead of reporting malformed successful evidence", () => {
  expect(() =>
    parseAutonomousAnalysisEvidence({
      error: "Analysis failed",
      code: "provider_unavailable",
      message: "Ghidra unavailable",
      retryable: true,
      remediation: { action: "configure_provider" },
    }),
  ).toThrow(/provider_unavailable.*Ghidra unavailable.*configure_provider/u);
});
