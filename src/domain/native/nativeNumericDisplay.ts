import { nativeUiSnapshotSchema } from "./nativeUiObservation.js";

export const numericDisplayNormalization = [
  "Remove Unicode bidi controls",
  "Remove English thousands separators",
  "Normalize Unicode minus to ASCII minus",
] as const;
/** Select observable numeric text, excluding labels such as the application title. */
export const observeNativeNumericDisplay = (input: unknown) => {
  const snapshot = nativeUiSnapshotSchema.parse(input);
  if (snapshot.truncated)
    return {
      status: "unknown" as const,
      reason: "Accessibility snapshot is truncated",
    };
  if (snapshot.gaps.length > 0)
    return {
      status: "unknown" as const,
      reason: "Accessibility snapshot has observation gaps",
    };
  const candidates = snapshot.nodes
    .filter((node) => node.role === "AXStaticText" && node.value !== null)
    .map((node) => ({
      path: node.path,
      value: node
        .value!.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "")
        .replace(/\u2212/gu, "-")
        .trim(),
    }))
    .filter((node) =>
      /^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:[eE][-+]?\d+)?$/u.test(
        node.value,
      ),
    )
    .map((node) => ({ ...node, value: node.value.replace(/,/gu, "") }));
  const values = [...new Set(candidates.map((node) => node.value))];
  if (values.length !== 1)
    return {
      status: "unknown" as const,
      reason:
        values.length === 0
          ? "No supported numeric display observed"
          : "Multiple different numeric displays are ambiguous",
    };
  return {
    status: "observed" as const,
    value: values[0]!,
    paths: candidates.map((node) => node.path),
    normalization: numericDisplayNormalization,
  };
};
