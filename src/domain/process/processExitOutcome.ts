import type { ProcessCapture } from "./processCaptureParsing.js";

/** Compare observed termination, excluding incidental settlement duration explicitly. */
export const compareProcessExitOutcomes = (
  left: Pick<ProcessCapture, "exit" | "settlement">,
  right: Pick<ProcessCapture, "exit" | "settlement">,
) => {
  const outcome = (capture: Pick<ProcessCapture, "exit" | "settlement">) => ({
    code: capture.exit.code,
    signal: capture.exit.signal,
    reason: capture.exit.reason,
    settlement_state: capture.settlement.state,
  });
  const a = outcome(left),
    b = outcome(right);
  const differs =
    a.code !== b.code || a.signal !== b.signal || a.reason !== b.reason;
  const complete = [a, b].every(
    (item) =>
      item.reason === "exited" &&
      item.settlement_state === "quiesced" &&
      (item.code !== null || (item.signal !== null && item.signal !== 0)),
  );
  return {
    status: differs
      ? ("changed" as const)
      : complete
        ? ("unchanged" as const)
        : ("unknown" as const),
    left: a,
    right: b,
    limitations: [
      "Exit code, signal and reason are compared; settlement duration is excluded. Timeout or unsettled execution cannot establish outcome equivalence.",
    ],
  };
};
