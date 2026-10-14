import type {
  CapabilityDescriptor,
  ProviderIdentity,
} from "../application/AnalysisProvider.js";
import { resolveRadare2Executable } from "./Radare2Executable.js";

export const RADARE2_OPERATION = "inspect_radare2_function_inventory" as const;
export const RADARE2_DISASSEMBLY_OPERATION =
  "inspect_radare2_disassembly" as const;

export const RADARE2_PROVIDER_IDENTITY: ProviderIdentity = Object.freeze({
  id: "radare2",
  name: "radare2 static analyzer",
  version: null,
});

export const radare2Capabilities = (
  environment: Readonly<NodeJS.ProcessEnv>,
): readonly CapabilityDescriptor[] => {
  const available = resolveRadare2Executable(environment) !== null;
  return [
    {
      provider: RADARE2_PROVIDER_IDENTITY,
      operation: RADARE2_OPERATION,
      ...(available
        ? { available: true, reason: null }
        : {
            available: false,
            reason:
              "Install radare2 or set REA_RADARE2_PATH to its absolute executable path.",
          }),
      effects: {
        mutatesArtifact: false,
        launchesProcess: true,
        mayShowUi: false,
        mayAccessNetwork: false,
        mayWriteFilesystem: true,
        changesPermissions: false,
        requiresRoot: false,
      },
      limitations: [
        "Function records and boundaries are radare2 analysis inferences, not a proof of complete function recovery.",
        "The selected target is read as bytes and analyzed from a private snapshot; target code is not executed.",
      ],
    },
    {
      provider: RADARE2_PROVIDER_IDENTITY,
      operation: RADARE2_DISASSEMBLY_OPERATION,
      ...(available
        ? { available: true, reason: null }
        : {
            available: false,
            reason:
              "Install radare2 or set REA_RADARE2_PATH to its absolute executable path.",
          }),
      effects: {
        mutatesArtifact: false,
        launchesProcess: true,
        mayShowUi: false,
        mayAccessNetwork: false,
        mayWriteFilesystem: true,
        changesPermissions: false,
        requiresRoot: false,
      },
      limitations: [
        "Instructions are radare2's static decoding at a caller-selected address; function boundaries and runtime reachability are not established.",
        "The target is read as bytes and analyzed from a private snapshot; target code is not executed.",
      ],
    },
  ];
};
