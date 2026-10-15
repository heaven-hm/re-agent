import { randomUUID } from "node:crypto";
import {
  readFile,
  writeFile,
  rename,
  mkdir,
  unlink,
  realpath,
  link,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEvidence, type Evidence } from "../../domain/evidence.js";
import { functionDossierSchema } from "../../domain/hopperValues.js";
import { functionSearchResultSchema } from "../../domain/functionSearch.js";
import { observeProcessStartIdentity } from "../../process/ProcessOwnershipObservation.js";
import {
  investigationStateSchema,
  parseInvestigationState,
  type InvestigationHooks,
  type InvestigationState,
  type RepairCandidate,
} from "./InvestigationContracts.js";

import {
  hashFile,
  normalizeInvestigationConfig,
} from "./InvestigationIdentity.js";
import { InvestigationWorkspace } from "./InvestigationWorkspace.js";
import { InvestigationProcessEvidence } from "./InvestigationProcessEvidence.js";
import { createEmptyBehavioralGraph } from "../../domain/reconstruction/BehavioralEvidenceGraph.js";
import { projectEvidenceToBehavioralGraph } from "../investigation/BehavioralGraphProjection.js";

export {
  investigationConfigSchema,
  investigationStateSchema,
  parseInvestigationState,
} from "./InvestigationContracts.js";
export type {
  InvestigationConfig,
  InvestigationHooks,
  InvestigationState,
  RepairCandidate,
} from "./InvestigationContracts.js";

export {
  hashFile,
  normalizeInvestigationConfig,
} from "./InvestigationIdentity.js";

/** Durable bounded controller extending REA's owned process and Evidence workflows. */
export class AutonomousInvestigation {
  #controller = new AbortController();
  #active = false;
  #controlPoll: Promise<void> = Promise.resolve();
  #writes: Promise<void> = Promise.resolve();
  readonly #workspace: InvestigationWorkspace;
  readonly #processEvidence: InvestigationProcessEvidence;
  private constructor(
    readonly storePath: string,
    public state: InvestigationState,
  ) {
    this.#workspace = new InvestigationWorkspace(
      state,
      storePath,
      (event, detail) => this.#save(event, detail),
      (value) => this.#record(value),
    );
    this.#processEvidence = new InvestigationProcessEvidence(state, storePath, {
      save: (event, detail) => this.#save(event, detail),
      record: (value) => this.#record(value),
      signal: () => this.#controller.signal,
      assertBinary: () => this.#assertBinary(),
    });
  }

  static async create(
    storePath: string,
    input: unknown,
  ): Promise<AutonomousInvestigation> {
    try {
      await readFile(storePath);
      throw new Error("Checkpoint already exists; use open/resume");
    } catch (cause) {
      if (
        !(cause instanceof Error && "code" in cause && cause.code === "ENOENT")
      )
        throw cause;
    }
    const config = await normalizeInvestigationConfig(input);
    const originalArgumentSha256: Record<string, string> = {};
    for (const argument of [
      ...config.original.arguments,
      ...config.cases.flatMap((item) => item.arguments),
    ]) {
      try {
        const path = await realpath(
          resolve(config.original.cwd ?? config.workspace, argument),
        );
        originalArgumentSha256[path] = await hashFile(path);
      } catch (cause) {
        if (
          !(
            cause instanceof Error &&
            "code" in cause &&
            ["ENOENT", "ENOTDIR", "EISDIR"].includes(String(cause.code))
          )
        )
          throw cause;
      }
    }
    const binarySha256 = await hashFile(config.binaryPath);
    const instance = new AutonomousInvestigation(resolve(storePath), {
      version: 1,
      id: randomUUID(),
      binarySha256,
      originalArgumentSha256,
      config,
      status: "ready",
      iteration: 0,
      evidence: [],
      behavioralGraph: createEmptyBehavioralGraph(binarySha256),
      regressions: [],
      functions: [],
      history: [],
      results: [],
      pendingRollback: [],
      iterationPhase: null,
      pendingCandidate: null,
      limitations: [
        "Passing means equality only in the declared cases and observation dimensions; universal equivalence is unproven.",
        "The process harness provides owned process cleanup and output/time bounds, not an operating-system security sandbox.",
        "Ambient environment, unobserved memory, graphics, audio, and network behavior are not proven equivalent.",
        "Exit comparison includes strict settlement timing; it is unverified unless explicitly selected as a comparison dimension.",
      ],
    });
    await instance.#save(
      "created",
      "Investigation bound to original binary SHA-256",
    );
    return instance;
  }

  static async open(storePath: string): Promise<AutonomousInvestigation> {
    await AutonomousInvestigation.#checkLock(storePath);
    await writeFile(
      `${storePath}.lock`,
      JSON.stringify({
        pid: process.pid,
        identity: await observeProcessStartIdentity(process.pid),
      }),
      { flag: "wx", mode: 0o600 },
    );
    try {
      const instance = new AutonomousInvestigation(
        resolve(storePath),
        parseInvestigationState(JSON.parse(await readFile(storePath, "utf8"))),
      );
      await instance.#assertBinary();
      if (instance.state.pendingRollback.length > 0)
        await instance.#rollbackForInterruption();
      await instance.#consumeControl();
      if (instance.state.status === "running") instance.state.status = "paused";
      await instance.#save(
        "opened",
        "Checkpoint restored; interrupted candidate rolled back",
      );
      return instance;
    } finally {
      await unlink(`${storePath}.lock`);
    }
  }

  /** Cross-process controls never open or mutate an active checkpoint. */
  static async requestControl(
    storePath: string,
    action: "pause" | "stop",
  ): Promise<void> {
    const temporary = `${storePath}.control.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ action }), { mode: 0o600 });
    await rename(temporary, `${storePath}.control.json`);
    // A live owner consumes its sidecar. An inactive checkpoint can be stopped
    // immediately under the same exclusive ownership protocol as resume.
    try {
      await AutonomousInvestigation.#checkLock(storePath);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("live owner"))
        return;
      throw cause;
    }
    try {
      await AutonomousInvestigation.open(storePath);
    } catch (cause) {
      if (
        cause instanceof Error &&
        (("code" in cause && cause.code === "EEXIST") ||
          cause.message.includes("live owner"))
      )
        return;
      throw cause;
    }
  }

  static async #checkLock(storePath: string): Promise<void> {
    let lock: { pid: number; identity: unknown };
    try {
      lock = JSON.parse(
        await readFile(`${storePath}.lock`, "utf8"),
      ) as typeof lock;
    } catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
        return;
      throw cause;
    }
    const observation = await observeProcessStartIdentity(lock.pid);
    if (
      observation !== undefined &&
      (observation.state !== "readable" ||
        JSON.stringify(observation) === JSON.stringify(lock.identity))
    )
      throw new Error(
        "Checkpoint has a live owner; use requestControl to pause or stop",
      );
    await unlink(`${storePath}.lock`);
  }

  async pause(): Promise<void> {
    this.state.status = "paused";
    this.#controller.abort();
    await this.#save("paused", "Cancellation requested");
  }
  async stop(): Promise<void> {
    this.state.status = "stopped";
    this.#controller.abort();
    await this.#save("stopped", "Cancellation requested");
  }
  async resume(hooks: InvestigationHooks = {}): Promise<InvestigationState> {
    if (this.#active)
      throw new Error("Investigation still draining cancelled resources");
    if (this.state.status === "stopped")
      throw new Error("Stopped investigations cannot resume");
    return this.run(hooks);
  }

  async run(hooks: InvestigationHooks = {}): Promise<InvestigationState> {
    if (this.#active) throw new Error("Investigation is already running");
    if (["stopped", "suite-passed"].includes(this.state.status))
      return this.state;
    this.#active = true;
    this.#controller = new AbortController();
    let ownsLock = false;
    let checkpointValidated = false;
    let controlTimer: NodeJS.Timeout | undefined;
    try {
      await AutonomousInvestigation.#checkLock(this.storePath);
      await writeFile(
        `${this.storePath}.lock`,
        JSON.stringify({
          pid: process.pid,
          identity: await observeProcessStartIdentity(process.pid),
        }),
        { flag: "wx", mode: 0o600 },
      );
      ownsLock = true;
      const current = parseInvestigationState(
        JSON.parse(await readFile(this.storePath, "utf8")),
      );
      if (
        current.id !== this.state.id ||
        current.history.length !== this.state.history.length
      )
        throw new Error(
          "Checkpoint advanced since it was opened; reload before running",
        );
      checkpointValidated = true;
      await this.#consumeControl();
      if (this.state.status === "stopped") return this.state;
      controlTimer = this.#pollControls();
      await this.#assertBinary();
      this.#controller.signal.throwIfAborted();
      this.state.status = "running";
      await this.#save("running", "Started bounded reconstruction loop");
      if (
        this.state.pendingCandidate !== null &&
        this.state.pendingRollback.length === 0
      )
        await this.#apply(this.state.pendingCandidate);
      else await this.#prepare(hooks);
      while (
        this.state.iterationPhase !== null ||
        this.state.iteration < this.state.config.maxIterations
      ) {
        const outcome = await this.#iteration(hooks);
        this.state.iterationPhase = null;
        await this.#save("iteration-completed", String(this.state.iteration));
        if (outcome === "pass") return this.state;
        if (outcome === "break") break;
      }
      this.state.status = "budget-exhausted";
      await this.#save("budget-exhausted", "Further investigation required");
    } catch (cause) {
      if (!checkpointValidated) throw cause;
      if (this.state.pendingRollback.length > 0) {
        if (this.#controller.signal.aborted)
          await this.#rollbackForInterruption();
        else await this.#rollback();
      }
      if (!this.#controller.signal.aborted) this.state.status = "failed";
      await this.#save(
        "interrupted",
        cause instanceof Error ? cause.message : String(cause),
      );
      if (!this.#controller.signal.aborted) throw cause;
    } finally {
      clearInterval(controlTimer);
      await this.#controlPoll;
      if (ownsLock) await unlink(`${this.storePath}.lock`);
      this.#active = false;
    }
    return this.state;
  }

  async #prepare(hooks: InvestigationHooks): Promise<void> {
    if (hooks.discover !== undefined && this.state.iteration === 0) {
      for (const evidence of await hooks.discover(
        this.state.config,
        this.#controller.signal,
      ))
        this.#record(evidence);
      await this.#save("discovery", "Static evidence collected");
    }
    if (hooks.reconstruct !== undefined && this.state.iteration === 0) {
      const candidate = await this.#invokeWithEvidence(() =>
        hooks.reconstruct!(
          structuredClone(this.state),
          this.#controller.signal,
        ),
      );
      this.#controller.signal.throwIfAborted();
      if (candidate !== undefined) await this.#apply(candidate);
    }
  }

  #pollControls(): NodeJS.Timeout {
    let pollingControl = false;
    return setInterval(() => {
      if (pollingControl) return;
      pollingControl = true;
      this.#controlPoll = this.#consumeControl()
        .catch((cause: unknown) => {
          if (
            !(
              cause instanceof Error &&
              "code" in cause &&
              cause.code === "ENOENT"
            )
          )
            this.#controller.abort(cause);
        })
        .finally(() => {
          pollingControl = false;
        });
    }, 250);
  }

  async #iteration(
    hooks: InvestigationHooks,
  ): Promise<"next" | "break" | "pass"> {
    this.#controller.signal.throwIfAborted();
    if (this.state.iterationPhase === null) {
      this.state.iterationPhase = {
        baselinePassed: this.state.results
          .filter((item) => item.status === "pass")
          .map((item) => item.caseId),
      };
      this.state.iteration += 1;
      await this.#save("iteration", String(this.state.iteration));
    }
    const baselinePassed = new Set(this.state.iterationPhase.baselinePassed);
    try {
      await this.#build();
      await this.#compare();
    } catch (cause) {
      if (this.#controller.signal.aborted) throw cause;
      await this.#save(
        "execution-failure",
        cause instanceof Error ? cause.message : String(cause),
      );
      if (
        hooks.repair !== undefined &&
        this.state.iteration < this.state.config.maxIterations
      ) {
        const candidate = await this.#invokeWithEvidence(() =>
          hooks.repair!(structuredClone(this.state), this.#controller.signal),
        );
        this.#controller.signal.throwIfAborted();
        if (candidate !== undefined) {
          if (this.state.pendingRollback.length > 0) await this.#rollback();
          await this.#apply(candidate);
          return "next";
        }
      }
      if (this.state.pendingRollback.length === 0) throw cause;
      await this.#rollback();
      await this.#save(
        "candidate-rejected",
        cause instanceof Error ? cause.message : String(cause),
      );
      await this.#build();
      await this.#compare();
    }
    if (this.state.pendingRollback.length > 0) {
      const regression = this.state.results.some(
        (item) => baselinePassed.has(item.caseId) && item.status !== "pass",
      );
      if (regression) {
        await this.#rollback();
        await this.#save(
          "candidate-rejected",
          "Previously passing case regressed",
        );
        await this.#build();
        await this.#compare();
      } else {
        this.state.pendingRollback = [];
        this.state.pendingCandidate = null;
        await this.#save(
          "candidate-retained",
          "Build and regression suite accepted candidate",
        );
      }
    }
    if (this.state.results.every((item) => item.status === "pass")) {
      this.state.status = "suite-passed";
      await this.#save(
        "suite-passed",
        "All declared observations passed; no universal equivalence claim",
      );
      return "pass";
    }
    if (
      this.state.iteration >= this.state.config.maxIterations ||
      hooks.repair === undefined
    )
      return "break";
    const candidate = await this.#invokeWithEvidence(() =>
      hooks.repair!(structuredClone(this.state), this.#controller.signal),
    );
    if (candidate === undefined) return "break";
    this.#controller.signal.throwIfAborted();
    await this.#apply(candidate);
    return "next";
  }

  async #consumeControl(): Promise<void> {
    const consumed = `${this.storePath}.control.${randomUUID()}.consumed.json`;
    try {
      await rename(`${this.storePath}.control.json`, consumed);
    } catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
        return;
      throw cause;
    }
    const text = await readFile(consumed, "utf8");
    const control = JSON.parse(text) as { action?: string };
    if (control.action === "stop") await this.stop();
    else if (control.action === "pause") await this.pause();
    else throw new Error("Invalid investigation control action");
    await unlink(consumed);
  }

  async #rollbackForInterruption(): Promise<void> {
    await this.#workspace.rollback(true);
    await this.#save(
      "candidate-replayable",
      "Interrupted source rolled back; candidate retained for resume",
    );
  }

  async #invokeWithEvidence<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (cause instanceof Error) {
        const evidence: unknown = Reflect.get(cause, "evidence");
        if (Array.isArray(evidence))
          for (const item of evidence) this.#record(item);
      }
      throw cause;
    }
  }

  async #assertBinary(): Promise<void> {
    if (
      (await hashFile(this.state.config.binaryPath)) !== this.state.binarySha256
    )
      throw new Error("Original binary changed; checkpoint cannot be reused");
    for (const [path, digest] of Object.entries(
      this.state.originalArgumentSha256,
    ))
      if ((await hashFile(path)) !== digest)
        throw new Error(`Original argument artifact changed: ${path}`);
  }
  #record(input: unknown): Evidence {
    const evidence = parseEvidence(input);
    if (
      !this.state.evidence.some(
        (item) => item.evidence_id === evidence.evidence_id,
      )
    ) {
      const nextEvidence = [...this.state.evidence, evidence];
      const nextGraph = projectEvidenceToBehavioralGraph(
        this.state.binarySha256,
        {
          records: nextEvidence,
          nativeGraphs: [],
          applicationSources: [],
          nonTargetEvidence: "exclude-with-coverage",
        },
      );
      this.state.evidence = nextEvidence;
      this.state.behavioralGraph = nextGraph;
    }
    if (evidence.operation === "search_procedures") {
      const names = functionSearchResultSchema.parse(
        evidence.normalized_result,
      );
      for (const item of names) {
        const existing = this.state.functions.find(
          (fn) => fn.address === item.address,
        );
        if (existing === undefined)
          this.state.functions.push({
            address: item.address,
            name: item.value,
            lifecycle: "DISCOVERED",
            evidenceIds: [evidence.evidence_id],
          });
        else if (!existing.evidenceIds.includes(evidence.evidence_id))
          existing.evidenceIds.push(evidence.evidence_id);
      }
    }
    if (evidence.operation === "analyze_function") {
      const dossier = functionDossierSchema.safeParse(
        evidence.normalized_result,
      );
      if (dossier.success) {
        const item = dossier.data.procedure;
        const existing = this.state.functions.find(
          (fn) => fn.address === item.address,
        );
        if (existing === undefined)
          this.state.functions.push({
            address: item.address,
            name: item.name ?? item.address,
            lifecycle: "ANALYZED",
            evidenceIds: [evidence.evidence_id],
          });
        else {
          existing.lifecycle = "ANALYZED";
          if (!existing.evidenceIds.includes(evidence.evidence_id))
            existing.evidenceIds.push(evidence.evidence_id);
        }
      }
    }
    return evidence;
  }
  async #build(): Promise<void> {
    await this.#processEvidence.build();
  }
  async #compare(): Promise<void> {
    await this.#processEvidence.compare();
  }
  async #apply(candidate: RepairCandidate): Promise<void> {
    await this.#workspace.apply(candidate);
  }
  async #rollback(): Promise<void> {
    await this.#workspace.rollback();
  }
  async #save(event: string, detail: string): Promise<void> {
    this.state.history.push({ at: new Date().toISOString(), event, detail });
    const snapshot = JSON.stringify(
      investigationStateSchema.parse(this.state),
      null,
      2,
    );
    this.#writes = this.#writes.then(async () => {
      await mkdir(dirname(this.storePath), { recursive: true });
      const temporary = `${this.storePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      if (event === "created") {
        await link(temporary, this.storePath);
        await unlink(temporary);
      } else await rename(temporary, this.storePath);
    });
    await this.#writes;
  }
}
