import { TOOL_CONTRACTS } from "../contracts/toolContracts.js";
import { AnalysisInputError } from "../domain/analysisErrorCore.js";
import type { JsonValue } from "../domain/jsonValue.js";
import { err, ok } from "../domain/result.js";
import { binjaAddressSchema } from "./BinaryNinjaProtocolValues.js";
import { projectInputIssues } from "../domain/inputIssueProjection.js";

/** Apply the named public contract and Binary Ninja's address boundary before execution. */
export const parseBinaryNinjaInput = (
  operation: string,
  parameters: Readonly<Record<string, JsonValue>>,
) => {
  const contract = TOOL_CONTRACTS.find(({ name }) => name === operation);
  const parsed = contract?.inputSchema.safeParse(parameters);
  if (parsed?.success !== true)
    return err(
      new AnalysisInputError(
        operation,
        { cause: parsed?.error },
        parsed?.error === undefined
          ? []
          : projectInputIssues(parsed.error.issues, parameters),
      ),
    );
  if (operation === "xrefs" && typeof parameters.address !== "string")
    return err(
      new AnalysisInputError(operation, undefined, [
        {
          path: ["address"],
          reason: "missing_argument",
          message: "Binary Ninja requires an explicit hexadecimal address.",
        },
      ]),
    );
  if (
    parameters.address !== undefined &&
    !binjaAddressSchema.safeParse(parameters.address).success
  )
    return err(
      new AnalysisInputError(operation, undefined, [
        {
          path: ["address"],
          reason: "invalid_format",
          message: "Binary Ninja requires a hexadecimal address.",
        },
      ]),
    );
  if (
    typeof parameters.procedure === "string" &&
    parameters.procedure.length === 0
  )
    return err(
      new AnalysisInputError(operation, undefined, [
        {
          path: ["procedure"],
          reason: "invalid_value",
          message: "Supply a function name or address.",
        },
      ]),
    );
  return ok(parameters);
};
