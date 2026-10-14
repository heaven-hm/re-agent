import { RADARE2_TOOL_CONTRACTS } from "../contracts/native/radare2ToolContracts.js";
import type { EvidenceMcpServer } from "./EvidenceMcpServer.js";
import type { EvidenceWriter } from "../application/investigation/InvestigationRecordPort.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import type { Logger } from "pino";
import type { WithAdmittedAnalysis } from "./analysisAdmission.js";
import { registerEvidenceTools } from "./registerEvidenceTools.js";

/** Register the radare2 operation on REA's shared active binary session. */
export const registerRadare2Tools = (
  server: EvidenceMcpServer,
  options: {
    readonly logger: Logger;
    readonly activeTarget: (() => BinaryTarget | undefined) | undefined;
    readonly recordEvidence: EvidenceWriter["recordEvidence"] | undefined;
    readonly withAdmittedAnalysis: WithAdmittedAnalysis;
  },
): void => {
  registerEvidenceTools(server, RADARE2_TOOL_CONTRACTS, options);
};
