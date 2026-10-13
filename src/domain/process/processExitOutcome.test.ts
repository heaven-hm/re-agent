import { expect, it } from "vitest";
import { compareProcessExitOutcomes } from "./processExitOutcome.js";

const capture = (code: number | null, signal = 0) => ({
  exit: { code, signal, reason: "exited" as const },
  settlement: {
    state: "quiesced" as const,
    elapsed_ms: 100,
    cleanup_outcome: "not_required" as const,
  },
});
it("compares exit codes/signals independently of settlement timing", () => {
  const left = capture(0);
  const right = capture(0);
  right.settlement.elapsed_ms = 250;
  expect(compareProcessExitOutcomes(left, right).status).toBe("unchanged");
  expect(compareProcessExitOutcomes(left, capture(7)).status).toBe("changed");
  expect(compareProcessExitOutcomes(left, capture(null, 9)).status).toBe(
    "changed",
  );
});
it("identical timeouts cannot establish exit outcome equivalence", () => {
  const timed = {
    ...capture(null),
    exit: { code: null, signal: 0, reason: "timeout" as const },
  };
  expect(compareProcessExitOutcomes(timed, timed).status).toBe("unknown");
});
