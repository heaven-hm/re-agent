import { z } from "zod";

/**
 * Run-bound verdict derivation for reconstruction reports (#15).
 *
 * Derives PASS/PARTIAL/FAIL/UNVERIFIED strictly from recorded comparison
 * outcomes. It never inspects implementation source, never invents results,
 * and keeps unknown coverage as UNVERIFIED rather than promoting it.
 */
export const runCaseSchema = z.strictObject({
  caseId: z.string().min(1),
  comparisonEvidenceId: z.string().min(1),
  status: z.enum(["pass", "fail", "unknown"]),
});

export type RunCase = z.infer<typeof runCaseSchema>;

export const runVerdictSchema = z.enum([
  "PASS",
  "PARTIAL",
  "FAIL",
  "UNVERIFIED",
]);

export type RunVerdict = z.infer<typeof runVerdictSchema>;

export const verdictReportSchema = z.strictObject({
  verdict: runVerdictSchema,
  passed: z.array(z.string()),
  failed: z.array(z.string()),
  unknown: z.array(z.string()),
  reasons: z.array(z.string()),
});

export type VerdictReport = z.infer<typeof verdictReportSchema>;

export const deriveRunVerdict = (cases: RunCase[]): VerdictReport => {
  const parsed = z.array(runCaseSchema).parse(cases);
  const passed = parsed.filter((c) => c.status === "pass").map((c) => c.caseId);
  const failed = parsed.filter((c) => c.status === "fail").map((c) => c.caseId);
  const unknown = parsed
    .filter((c) => c.status === "unknown")
    .map((c) => c.caseId);
  if (parsed.length === 0) {
    return {
      verdict: "UNVERIFIED",
      passed,
      failed,
      unknown,
      reasons: ["no test cases recorded"],
    };
  }
  if (failed.length === 0 && unknown.length === 0) {
    return {
      verdict: "PASS",
      passed,
      failed,
      unknown,
      reasons: [
        `${String(passed.length)} of ${String(parsed.length)} cases passed`,
      ],
    };
  }
  if (failed.length > 0) {
    return {
      verdict: passed.length > 0 ? "PARTIAL" : "FAIL",
      passed,
      failed,
      unknown,
      reasons: [
        `${String(failed.length)} failed${unknown.length > 0 ? `, ${String(unknown.length)} unknown` : ""}; not a full pass`,
      ],
    };
  }
  return {
    verdict: "UNVERIFIED",
    passed,
    failed,
    unknown,
    reasons: [
      `${String(unknown.length)} of ${String(parsed.length)} cases lack comparison evidence`,
    ],
  };
};
