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

const active = new Map<string, AutonomousInvestigation>();

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
    ...(plan.analysis === undefined
      ? {}
      : {
          discover: (config, signal) =>
            discoverAutonomousFunctions(config.binaryPath, {
              ...(plan.analysis?.provider === undefined
                ? {}
                : { provider: plan.analysis.provider }),
              ...(plan.analysis?.maxFunctions === undefined
                ? {}
                : { maxFunctions: plan.analysis.maxFunctions }),
              environment,
              signal,
            }),
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
  // Persistent control requests are consumed by the owner; never reopen a live journal.
  await AutonomousInvestigation.requestControl(resolve(checkpointPath), action);
};
