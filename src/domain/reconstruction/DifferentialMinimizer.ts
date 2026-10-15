export interface DifferentialCounterexample {
  input: Uint8Array;
  reference: Uint8Array;
  candidate: Uint8Array;
}
/** Minimal pure byte contract; integration must bind real process/provenance Evidence. */
export const differs = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length !== b.length || a.some((value, index) => value !== b[index]);

export const minimizeDifferentialInput = async (
  initial: Uint8Array,
  observe: (input: Uint8Array) => Promise<{ reference: Uint8Array; candidate: Uint8Array }>,
  maxExecutions = 256,
): Promise<{ counterexample: DifferentialCounterexample; executions: number; exhausted: boolean }> => {
  if (!Number.isSafeInteger(maxExecutions) || maxExecutions < 1)
    throw new Error("Invalid execution budget");
  let executions = 0;
  const evaluate = async (input: Uint8Array) => {
    executions++;
    const result = await observe(input.slice());
    if (!(result.reference instanceof Uint8Array) || !(result.candidate instanceof Uint8Array))
      throw new Error("Invalid differential observation");
    return {input: input.slice(), reference: result.reference.slice(), candidate: result.candidate.slice()};
  };
  let current = await evaluate(initial);
  if (!differs(current.reference, current.candidate))
    throw new Error("Initial input is not a differential counterexample");
  let granularity = 2;
  while (current.input.length > 0 && executions < maxExecutions) {
    const chunk = Math.ceil(current.input.length / granularity);
    let changed = false;
    for (let start = 0; start < current.input.length && executions < maxExecutions; start += chunk) {
      const smaller = new Uint8Array(current.input.length - Math.min(chunk, current.input.length - start));
      smaller.set(current.input.subarray(0, start));
      smaller.set(current.input.subarray(start + chunk), start);
      const attempt = await evaluate(smaller);
      if (differs(attempt.reference, attempt.candidate)) {
        current = attempt; granularity = Math.max(2, granularity - 1); changed = true; break;
      }
    }
    if (!changed) {
      if (granularity >= current.input.length) break;
      granularity = Math.min(current.input.length, granularity * 2);
    }
  }
  return {counterexample: current, executions, exhausted: executions >= maxExecutions};
};
