import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AutonomousInvestigation,
  normalizeInvestigationConfig,
  parseInvestigationState,
} from "../application/autonomy/AutonomousInvestigation.js";
import type {
  InvestigationHooks,
  InvestigationState,
} from "../application/autonomy/AutonomousInvestigation.js";
import {
  autonomousPlanSchema,
  type AutonomousPlan,
} from "../application/autonomy/AutonomousPlan.js";
import { createModelBackend } from "../application/autonomy/ModelBackend.js";
import { discoverAutonomousFunctions } from "./autonomousDiscovery.js";
import { generateNumericExperiments } from "../domain/autonomyExperiments.js";
import { createAffineRecoveryHooks } from "../application/autonomy/AffineRecovery.js";
import { resolveAutonomyEnvironment } from "./autonomyEnvironment.js";
import { ArtifactResourceScope } from "../artifacts/ArtifactResourceScope.js";
import { analyzeJavaScriptApplication } from "../application/javascript/JavaScriptApplicationService.js";
import { parseApplicationGraphEvidence } from "../application/javascript/JavaScriptApplicationEvidenceGraph.js";
import type { Evidence } from "../domain/evidence.js";

const active = new Map<string, AutonomousInvestigation>();

const discoverApplicationArtifacts = async (
  config: AutonomousPlan["investigation"],
  signal: AbortSignal,
): Promise<readonly Evidence[]> => {
  const artifacts = config.applicationArtifacts ?? [];
  if (artifacts.length === 0) return [];
  const resources = new ArtifactResourceScope();
  const evidence: Evidence[] = [];
  try {
    for (const artifact of artifacts) {
      signal.throwIfAborted();
      const result = await analyzeJavaScriptApplication(
        { input_path: artifact.path },
        resources,
        { signal },
      );
      if (!result.ok)
        throw new Error(
          `Application analysis failed for ${artifact.path}: ${JSON.stringify(result.error)}`,
        );
      const source = parseApplicationGraphEvidence(result.value);
      if (!source.ok)
        throw new Error(
          `Application Evidence failed authentication for ${artifact.path}: ${JSON.stringify(source.error)}`,
        );
      if (source.value.rootArtifactSha256 !== artifact.sha256)
        throw new Error(
          `Application artifact changed during discovery: ${artifact.path}; expected SHA-256 ${artifact.sha256}, observed ${source.value.rootArtifactSha256}`,
        );
      evidence.push(result.value);
    }
  } finally {
    await resources.close();
  }
  return evidence;
};

const hooksFor = (
  plan: AutonomousPlan,
  environment: Readonly<NodeJS.ProcessEnv>,
): InvestigationHooks => {
  const reconstruction = plan.reconstruction;
  const model =
    plan.model === undefined
      ? undefined
      : createModelBackend(
          {
            provider: plan.model.provider,
            model: plan.model.model,
            ...(plan.model.baseUrl === undefined
              ? {}
              : { baseUrl: plan.model.baseUrl }),
            ...(plan.model.credentialEnvironmentVariable === undefined
              ? {}
              : {
                  credentialEnvironmentVariable:
                    plan.model.credentialEnvironmentVariable,
                }),
            ...(plan.model.timeoutMs === undefined
              ? {}
              : { timeoutMs: plan.model.timeoutMs }),
            ...(plan.model.maxOutputTokens === undefined
              ? {}
              : { maxOutputTokens: plan.model.maxOutputTokens }),
          },
          { environment },
        );
  const generate = async (
    state: Readonly<InvestigationState>,
    signal: AbortSignal,
    repair: boolean,
  ) => {
    if (reconstruction === undefined || model === undefined) return undefined;
    const sourcePath = resolve(
      state.config.workspace,
      reconstruction.sourcePath,
    );
    let currentSource: string | undefined;
    if (repair) currentSource = await readFile(sourcePath, "utf8");
    const request = {
      language: reconstruction.language,
      objective: reconstruction.objective,
      evidence: state.evidence.map((record) => ({
        id: record.evidence_id,
        kind: record.operation,
        content: record.normalized_result,
      })),
      ...(currentSource === undefined ? {} : { currentSource }),
      ...(repair
        ? { mismatches: state.results.filter((item) => item.status !== "pass") }
        : {}),
    };
    const content = repair
      ? await model.repair(request, signal)
      : await model.reconstruct(request, signal);
    return { files: [{ path: sourcePath, content }] };
  };
  return {
    ...(reconstruction?.policy === "piecewise-affine" &&
    reconstruction.range !== undefined
      ? createAffineRecoveryHooks({
          range: reconstruction.range,
          sourcePath: resolve(
            plan.investigation.workspace,
            reconstruction.sourcePath,
          ),
        })
      : {}),
    ...(plan.analysis === undefined &&
    (plan.investigation.applicationArtifacts?.length ?? 0) === 0
      ? {}
      : {
          discover: async (config, signal) => {
            const applicationEvidence = await discoverApplicationArtifacts(
              config,
              signal,
            );
            if (plan.analysis === undefined) return applicationEvidence;
            const functionEvidence = await discoverAutonomousFunctions(
              config.binaryPath,
              {
                ...(plan.analysis.provider === undefined
                  ? {}
                  : { provider: plan.analysis.provider }),
                ...(plan.analysis.maxFunctions === undefined
                  ? {}
                  : { maxFunctions: plan.analysis.maxFunctions }),
                environment,
                signal,
              },
            );
            return [...applicationEvidence, ...functionEvidence];
          },
        }),
    ...(model === undefined
      ? {}
      : {
          reconstruct: (state, signal) => generate(state, signal, false),
          repair: (state, signal) => generate(state, signal, true),
        }),
  };
};

/** One shared production workflow, exposed by REA CLI and MCP adapters. */
export const runAutonomousPlan = async (
  planInput: unknown,
  checkpointPath: string,
  options: {
    readonly resume?: boolean;
    readonly environment?: Readonly<NodeJS.ProcessEnv>;
    readonly signal?: AbortSignal;
  } = {},
): Promise<InvestigationState> => {
  const {
    resume = false,
    environment: selectedEnvironment = process.env,
    signal,
  } = options;
  const plan = autonomousPlanSchema.parse(planInput);
  const environment =
    plan.analysis === undefined
      ? selectedEnvironment
      : await resolveAutonomyEnvironment(selectedEnvironment);
  if (plan.experiments !== undefined) {
    const generated = generateNumericExperiments(plan.experiments).map(
      (item) => ({ id: item.id, arguments: [...item.arguments] }),
    );
    plan.investigation.cases.push(...generated);
  }
  plan.investigation = await normalizeInvestigationConfig(plan.investigation);
  const key = resolve(checkpointPath);
  if (active.has(key)) throw new Error("Investigation is already active");
  if (
    resume &&
    JSON.stringify(plan.investigation) !==
      JSON.stringify((await readAutonomousStatus(key)).config)
  )
    throw new Error(
      "Resume plan differs from persisted investigation; preserve its declared suite and commands",
    );
  const investigation = resume
    ? await AutonomousInvestigation.open(key)
    : await AutonomousInvestigation.create(key, plan.investigation);
  const abort = () => {
    void investigation.pause();
  };
  signal?.throwIfAborted();
  active.set(key, investigation);
  try {
    const running = investigation.run(hooksFor(plan, environment));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    return await running;
  } finally {
    signal?.removeEventListener("abort", abort);
    active.delete(key);
  }
};

export const readAutonomousStatus = async (
  checkpointPath: string,
): Promise<InvestigationState> => {
  const live = active.get(resolve(checkpointPath));
  if (live !== undefined) return structuredClone(live.state);
  return parseInvestigationState(
    JSON.parse(await readFile(checkpointPath, "utf8")),
  );
};

export const controlAutonomousInvestigation = async (
  checkpointPath: string,
  action: "pause" | "stop",
): Promise<void> => {
  const live = active.get(resolve(checkpointPath));
  if (live !== undefined) {
    await live[action]();
    return;
  }
  // Live owners consume persistent controls; inactive checkpoints persist the
  // requested status under exclusive checkpoint ownership.
  await AutonomousInvestigation.requestControl(resolve(checkpointPath), action);
};
