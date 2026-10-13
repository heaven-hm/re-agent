import { expect, it } from "vitest";
import { observeNativeNumericDisplay } from "./nativeNumericDisplay.js";
const snapshot = (values: string[], truncated = false) => ({
  window: {
    pid: 1,
    window_id: 2,
    executable: "/fixture/replica",
    launch_time: 1,
    title: "REA recovered calculator boundary",
  },
  nodes: values.map((value, index) => ({
    path: [index],
    role: "AXStaticText",
    title: null,
    value,
    actions: [],
    children_count: 0,
  })),
  screenshot: null,
  gaps: [],
  truncated,
});
it("selects the actual result instead of the window title or pending expression", () => {
  expect(
    observeNativeNumericDisplay(
      snapshot(["2+3", "‎5", "REA recovered calculator boundary"]),
    ),
  ).toMatchObject({ status: "observed", value: "5", paths: [[1]] });
});
it("does not claim an ambiguous, unsupported or truncated display was verified", () => {
  expect(observeNativeNumericDisplay(snapshot(["4", "5"])).status).toBe(
    "unknown",
  );
  expect(observeNativeNumericDisplay(snapshot(["Error"])).status).toBe(
    "unknown",
  );
  expect(observeNativeNumericDisplay(snapshot(["5"], true)).status).toBe(
    "unknown",
  );
  expect(
    observeNativeNumericDisplay({
      ...snapshot(["5"]),
      gaps: ["AX child count unavailable at path []"],
    }).status,
  ).toBe("unknown");
});
it("retains precision and declares sign/separator normalization", () => {
  expect(
    observeNativeNumericDisplay(snapshot(["−1,234.567890123"])),
  ).toMatchObject({ status: "observed", value: "-1234.567890123" });
  expect(observeNativeNumericDisplay(snapshot(["1,2"])).status).toBe("unknown");
});
