import type {
  CapabilityDescriptor,
  ProviderIdentity,
} from "../application/AnalysisProvider.js";
import { isAbsolute } from "node:path";

export const CAPA_PROVIDER_IDENTITY: ProviderIdentity = Object.freeze({
  id: "capa",
  name: "Mandiant capa",
  version: null,
});
export const CAPA_LIMITATIONS = [
  "Static capability-rule matches are hypotheses, not verified runtime behavior or equivalence.",
  "Absent matches do not prove absent behavior; coverage depends on the selected extractor and packaged rules.",
  "Uses a provider-owned artifact snapshot; target application code is not launched.",
  "Parser execution is process-isolated, not a security sandbox; bundled tool dependencies require separate license review.",
] as const;

export const capaCapabilities = (
  environment: Readonly<NodeJS.ProcessEnv>,
): readonly CapabilityDescriptor[] => [
  {
    provider: CAPA_PROVIDER_IDENTITY,
    operation: "inspect_capa_capabilities",
    ...(isAbsolute(environment.REA_CAPA_PATH ?? "")
      ? ({ available: true, reason: null } as const)
      : ({
          available: false,
          reason:
            "Set REA_CAPA_PATH to a compatible installed native standalone capa executable.",
        } as const)),
    effects: {
      mutatesArtifact: false,
      launchesProcess: true,
      mayShowUi: false,
      mayAccessNetwork: false,
      mayWriteFilesystem: true,
      changesPermissions: false,
      requiresRoot: false,
    },
    limitations: CAPA_LIMITATIONS,
  },
];
