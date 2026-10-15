import { CapaCapabilitiesService } from "../application/native/CapaCapabilitiesService.js";
import { CapaCapabilityProvider } from "../capa/CapaCapabilityProvider.js";
import { snapshotEnvironment } from "../process/snapshotEnvironment.js";

/** Compose the optional installed engine through one shared local Evidence service. */
export const createCapaCapabilitiesService = (
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): CapaCapabilitiesService =>
  new CapaCapabilitiesService(
    new CapaCapabilityProvider(snapshotEnvironment(environment)),
  );
