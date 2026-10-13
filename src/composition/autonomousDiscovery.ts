import type { Evidence } from "../domain/evidence.js";
import { parseEvidence } from "../domain/evidence.js";
import { functionSearchResultSchema } from "../domain/functionSearch.js";
import { createDirectAnalysis } from "./directAnalysis.js";
import type { AnalysisProviderSelector } from "../contracts/providerSelection.js";

/** Preserve the provider's safe failure projection instead of parsing it as successful evidence. */
export const parseAutonomousAnalysisEvidence = (value: unknown): Evidence => {
  if (typeof value === "object" && value !== null && "error" in value)
    throw new Error(`Static analysis failed: ${JSON.stringify(value)}`);
  return parseEvidence(value);
};

/** Reuse the selected REA provider; discovered addresses are never caller guesses. */
export const discoverAutonomousFunctions = async (
  binaryPath: string,
  options: {
    readonly provider?: AnalysisProviderSelector;
    readonly maxFunctions?: number;
    readonly environment?: Readonly<NodeJS.ProcessEnv>;
    readonly signal?: AbortSignal;
  } = {},
): Promise<readonly Evidence[]> => {
  const analysis = createDirectAnalysis(options.environment ?? process.env);
  const maxFunctions = options.maxFunctions ?? 8;
  if (
    !Number.isSafeInteger(maxFunctions) ||
    maxFunctions < 1 ||
    maxFunctions > 64
  )
    throw new TypeError("Function investigation budget must be 1..64");
  const selected = {
    ...(options.provider === undefined ? {} : { providerId: options.provider }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  const inventory = parseAutonomousAnalysisEvidence(
    await analysis.runDirectAnalysis(
      binaryPath,
      "search_procedures",
      { pattern: ".*", mode: "regex", case_sensitive: true },
      selected,
    ),
  );
  const names = functionSearchResultSchema
    .parse(inventory.normalized_result)
    .map((item) => ({ address: item.address, name: item.value }));
  const evidence: Evidence[] = [inventory];
  // Prioritize recovered code over import thunks. Inventory retains the complete search.
  const candidates = [...names]
    .sort((left, right) => {
      const importRank = (name: string) =>
        /^(imp\.|sym\.imp\.|__imp_|j_)/u.test(name) ? 1 : 0;
      return (
        importRank(left.name) - importRank(right.name) ||
        left.address.localeCompare(right.address)
      );
    })
    .slice(0, maxFunctions);
  for (const candidate of candidates) {
    options.signal?.throwIfAborted();
    const result = await analysis.runDirectAnalysis(
      binaryPath,
      "analyze_function",
      {
        procedure: candidate.address,
      },
      selected,
    );
    // A failed provider operation must remain a failure, never a verified function.
    evidence.push(parseAutonomousAnalysisEvidence(result));
  }
  return evidence;
};
