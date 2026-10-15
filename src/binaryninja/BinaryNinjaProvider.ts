import { snapshotEnvironment } from "../process/snapshotEnvironment.js";
import { createAnalysisProfile } from "../domain/analysisProfile.js";
import type { AnalysisProfileCommitment } from "../domain/analysisProfile.js";
import type { BinaryTarget } from "../domain/binaryTargetTypes.js";
import { err, ok } from "../domain/result.js";
import { AnalysisCancelledError } from "../domain/analysisErrorCore.js";
import type {
  AnalysisClient,
  AnalysisProfileResolutionOptions,
  AnalysisProviderCandidate,
  ProviderAvailability,
  ProviderTargetSupport,
} from "../application/AnalysisProvider.js";
import type { AppConfig } from "../config/types.js";
import type { ConfigurationError } from "../domain/configurationErrors.js";
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { Result } from "../domain/result.js";
import {
  readBinaryNinjaConfiguration,
  type BinaryNinjaConfiguration,
  binaryNinjaConfigurationError,
} from "./BinaryNinjaConfiguration.js";
import {
  createBinaryNinjaMcpConnection,
  type BinaryNinjaMcpConnection,
} from "./BinaryNinjaMcpConnection.js";
import {
  binaryNinjaCapabilities,
  BINARYNINJA_PROVIDER_IDENTITY,
} from "./BinaryNinjaProviderCapabilities.js";
import { BinaryNinjaSessionClient } from "./BinaryNinjaSessionClient.js";
import { privateRuntimeRootCapability } from "../process/PrivateRuntimeRoot.js";

/** Bring-your-own Binary Ninja MCP candidate; discovery performs no provider startup. */
export class BinaryNinjaProvider implements AnalysisProviderCandidate {
  #registration: Result<BinaryNinjaConfiguration, ConfigurationError> | undefined;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(
    private readonly config: AppConfig,
    environment: Readonly<NodeJS.ProcessEnv>,
    private readonly connectionFactory: (
      config: BinaryNinjaConfiguration,
      environment: Readonly<NodeJS.ProcessEnv>,
    ) => BinaryNinjaMcpConnection = createBinaryNinjaMcpConnection,
  ) {
    this.environment = snapshotEnvironment(environment);
  }

  identity() {
    return BINARYNINJA_PROVIDER_IDENTITY;
  }

  capabilities() {
    const config = this.#configuration();
    return binaryNinjaCapabilities(
      config.ok ? config.value.mode : "attached",
      config.ok && "command" in config.value,
    );
  }

  inspectAvailability(): ProviderAvailability {
    const config = this.#configuration();
    if (config.ok && config.value.mode === "headless") {
      const privacy = privateRuntimeRootCapability();
      if (!privacy.available)
        return {
          status: "unavailable",
          code: "unsupported_host",
          reason: privacy.reason,
          diagnostics: {
            configured: true,
            mode: "headless",
            live_connection_probed: false,
            private_workspace_available: false,
          },
        };
    }
    return config.ok
      ? {
          status: "available",
          code: null,
          reason: null,
          diagnostics: {
            configured: true,
            mode: config.value.mode,
            transport: "command" in config.value ? "stdio" : "http",
            live_connection_probed: false,
          },
        }
      : {
          status: "unavailable",
          code:
            this.config.binjaMcpConfigPath === undefined
              ? "not_configured"
              : "open_options_invalid",
          reason: config.error.message,
          diagnostics: { configured: false, live_connection_probed: false },
        };
  }

  inspectTargetSupport(target: BinaryTarget): ProviderTargetSupport {
    const diagnostics = {
      target_kind: target.kind,
      target_format: target.format,
    };
    if (target.kind !== "executable")
      return {
        status: "unsupported",
        code: "target_kind_unsupported",
        reason:
          "Binary Ninja MCP integration admits executable inputs, not analysis databases.",
        diagnostics,
      };
    return { status: "supported", code: null, reason: null, diagnostics };
  }

  async resolveAnalysisProfile(
    _target: BinaryTarget,
    options?: AnalysisProfileResolutionOptions,
  ) {
    if (options?.signal?.aborted === true)
      return err(new AnalysisCancelledError("binaryninja:profile"));
    const config = this.#configuration();
    if (!config.ok) return config;
    return ok({
      profile: createAnalysisProfile(BINARYNINJA_PROVIDER_IDENTITY, {
        version_scope: "rea-binja-adapter",
        engine_version: null,
        upstream_distribution_version: null,
        mode: config.value.mode,
        compatibility_profile: "binaryninja-mcp",
        database_revision: null,
        cache_policy: "live",
        registration_digest: createHash("sha256")
          .update(canonicalize(config.value) ?? "")
          .digest("hex"),
      }),
    });
  }

  createClient(
    target: BinaryTarget,
    profile?: AnalysisProfileCommitment,
  ): AnalysisClient {
    const config = this.#configuration();
    if (!config.ok)
      return {
        execute: async () => err(config.error),
        close: async () => ok(null),
      };
    return new BinaryNinjaSessionClient(
      config.value,
      target,
      this.connectionFactory(config.value, this.environment),
      profile,
    );
  }

  #configuration() {
    this.#registration ??=
      this.config.binjaMcpConfigPath === undefined
        ? readBinaryNinjaConfigurationNotConfigured()
        : readBinaryNinjaConfiguration(this.config.binjaMcpConfigPath);
    return this.#registration;
  }
}

const readBinaryNinjaConfigurationNotConfigured = () =>
  err(
    binaryNinjaConfigurationError(
      "Set REA_BINJA_MCP_CONFIG to an upstream Binary Ninja MCP JSON registration; see docs/binary-ninja-provider.md.",
    ),
  );
