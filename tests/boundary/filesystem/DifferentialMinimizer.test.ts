import { expect, it } from "vitest";
import { minimizeDifferentialInput } from "../../../src/domain/reconstruction/DifferentialMinimizer.js";

it("minimizes reproducible divergent input with a bounded oracle", async () => {
  const observe = async (input: Uint8Array) => ({
    reference: new Uint8Array([input.includes(42) ? 1 : 0]),
    candidate: new Uint8Array([0]),
  });
  const result = await minimizeDifferentialInput(new Uint8Array([1, 2, 42, 3, 4]), observe);
  expect([...result.counterexample.input]).toEqual([42]);
  expect(result.executions).toBeLessThanOrEqual(256);
});
it("rejects non-divergent initial observations", async () => {
  await expect(minimizeDifferentialInput(new Uint8Array([1]), async () => ({reference:new Uint8Array([0]),candidate:new Uint8Array([0])}))).rejects.toThrow(/not a differential/u);
});

it("preserves a caller-defined differential failure class", async () => {
  const observe = async (input: Uint8Array) => ({reference:new Uint8Array([input.includes(42) ? 7 : input.includes(9) ? 3 : 0]), candidate:new Uint8Array([0])});
  const result = await minimizeDifferentialInput(new Uint8Array([9,42]), observe, 256, (initial, candidate) =>
    candidate.reference[0] === initial.reference[0] && candidate.candidate[0] === initial.candidate[0]);
  expect([...result.counterexample.input]).toEqual([42]);
});

it("rejects nondeterministic observations rather than retaining flaky counterexamples", async () => {
  let n = 0;
  await expect(minimizeDifferentialInput(new Uint8Array([1]),async () => ({
    reference:new Uint8Array([++n%2]),candidate:new Uint8Array([3]),
  }))).rejects.toThrow(/Nondeterministic/u);
});

it("cancels running observer on timeout via abort signal and reaps active observer", async () => {
  let observerAborted = false;
  let observerCleanedUp = false;
  const observe = async (_input: Uint8Array, context?: { readonly signal: AbortSignal }) => {
    return new Promise<{ reference: Uint8Array; candidate: Uint8Array }>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({ reference: new Uint8Array([1]), candidate: new Uint8Array([0]) });
      }, 500);
      context?.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        observerAborted = true;
        observerCleanedUp = true;
        reject(context.signal.reason);
      }, { once: true });
    });
  };
  await expect(
    minimizeDifferentialInput(new Uint8Array([1, 2, 3]), observe, 256, undefined, { timeoutMs: 25 }),
  ).rejects.toThrow(/Differential observation timeout/u);
  expect(observerAborted).toBe(true);
  expect(observerCleanedUp).toBe(true);
});

it("cancels running observer and awaits cleanup when external signal aborts", async () => {
  const controller = new AbortController();
  let observerAborted = false;
  let observerCleanedUp = false;
  const observe = async (_input: Uint8Array, context?: { readonly signal: AbortSignal }) => {
    return new Promise<{ reference: Uint8Array; candidate: Uint8Array }>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({ reference: new Uint8Array([1]), candidate: new Uint8Array([0]) });
      }, 500);
      context?.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        observerAborted = true;
        observerCleanedUp = true;
        reject(context.signal.reason);
      }, { once: true });
    });
  };
  setTimeout(() => controller.abort(new Error("caller cancellation")), 25);
  await expect(
    minimizeDifferentialInput(new Uint8Array([1, 2, 3]), observe, 256, undefined, { signal: controller.signal }),
  ).rejects.toThrow(/caller cancellation/u);
  expect(observerAborted).toBe(true);
  expect(observerCleanedUp).toBe(true);
});

it("external cancellation interrupts a stalled observer without a timeout", async () => {
  const parent = new AbortController();
  let invoked = 0;
  let aborted = false;
  const observer = (_input: Uint8Array, context?: { readonly signal: AbortSignal }) => {
    invoked++;
    return new Promise<{ reference: Uint8Array; candidate: Uint8Array }>((_resolve, reject) => {
      context?.signal.addEventListener("abort", () => {
        aborted = true;
        reject(context.signal.reason);
      }, { once: true });
    });
  };
  const pending = minimizeDifferentialInput(new Uint8Array([42]), observer, 4,
    undefined, { signal: parent.signal });
  setTimeout(() => parent.abort(new Error("cancel test")), 10);
  await expect(pending).rejects.toThrow(/cancel test/u);
  expect(aborted).toBe(true);
  expect(invoked).toBe(1);
});
