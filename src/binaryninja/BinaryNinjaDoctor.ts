import type {
  DoctorProviderCheck,
  DoctorProviderInspection,
} from "../application/Doctor.js";
import { readBinaryNinjaConfiguration } from "./BinaryNinjaConfiguration.js";
import { privateRuntimeRootCapability } from "../process/PrivateRuntimeRoot.js";

/** Check the registration without launching Binary Ninja, and retain only the configuration file reference. */
export const inspectBinaryNinjaRegistration = (
  path: string | undefined,
): DoctorProviderInspection => {
  const parsed =
    path === undefined ? undefined : readBinaryNinjaConfiguration(path);
  const valid = parsed?.ok === true;
  const workspaceChecks =
    parsed?.ok === true && parsed.value.mode === "headless"
      ? [inspectPrivateWorkspace()]
      : [];
  return {
    id: "binaryninja",
    configured: path !== undefined,
    available: valid && workspaceChecks.every(({ ok }) => ok),
    providerVersion: null,
    registrationEnvironment:
      valid && path !== undefined ? { REA_BINJA_MCP_CONFIG: path } : {},
    checks: [
      {
        name: "registration",
        ok: valid,
        code: valid
          ? null
          : path === undefined
            ? "not_configured"
            : "invalid_configuration",
        detail: valid
          ? "Binary Ninja MCP registration is valid. Upstream availability, compatibility, and target binding are checked when analysis starts; no Binary Ninja process was launched."
          : parsed !== undefined && !parsed.ok
            ? parsed.error.message
            : "Binary Ninja MCP registration is not configured.",
        remediation: valid
          ? null
          : "Set REA_BINJA_MCP_CONFIG to your upstream Binary Ninja MCP registration JSON; see docs/binary-ninja-provider.md.",
        classification:
          path === undefined ? "missing_analysis_engine" : "config_drift",
      },
      ...workspaceChecks,
    ],
  };
};

const inspectPrivateWorkspace = (): DoctorProviderCheck => {
  const privacy = privateRuntimeRootCapability();
  return {
    name: "private_workspace",
    ok: privacy.available,
    code: privacy.available ? null : "unsupported_host",
    detail: privacy.available
      ? `Private workspace authority is available (${privacy.proof}).`
      : privacy.reason,
    remediation: privacy.available
      ? null
      : "Use a writable local temporary directory.",
    classification: "unsupported_host",
  };
};
