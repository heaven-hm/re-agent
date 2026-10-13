import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runOwnedCommand } from "../process/OwnedCommand.js";
import { jsonValueSchema } from "../domain/jsonValue.js";
import {
  traceFridaAutonomy,
  fridaAutonomyInputSchema,
  FridaAutonomyCleanupError,
} from "../native/FridaAutonomyTrace.js";

export const traceAutonomyFunction = (config: unknown, signal?: AbortSignal) =>
  traceFridaAutonomy(fridaAutonomyInputSchema.parse(config), signal);

/** Keep failed native process owners alive through the host MCP/CLI lifecycle. */
export class AutonomyFunctionTraceScope {
  readonly #pending = new Set<FridaAutonomyCleanupError>();
  readonly #active = new Set<Promise<unknown>>();
  #closed = false;
  async run(config: unknown, signal?: AbortSignal) {
    if (this.#closed) throw new Error("Runtime observation scope is closed");
    await this.retryCleanup();
    if (this.#closed) throw new Error("Runtime observation scope is closed");
    const running = traceAutonomyFunction(config, signal);
    this.#active.add(running);
    try {
      return await running;
    } catch (cause) {
      if (cause instanceof FridaAutonomyCleanupError) this.#pending.add(cause);
      throw cause;
    } finally {
      this.#active.delete(running);
    }
  }
  async retryCleanup() {
    const failures: FridaAutonomyCleanupError[] = [];
    for (const owner of this.#pending) {
      const result = await owner.retryCleanup();
      if (result?.status === "incomplete" || result === undefined)
        failures.push(owner);
      else this.#pending.delete(owner);
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        "Owned function observation cleanup remains incomplete",
      );
  }
  async close() {
    this.#closed = true;
    await Promise.allSettled(this.#active);
    await this.retryCleanup();
  }
}

/** Run the pinned official-wheel installer as an owned process; partial installation remains explicit. */
export const installAutonomyTools = async (
  binaryPath: string,
  signal?: AbortSignal,
) => {
  const execution = await runOwnedCommand(
    {
      command: process.execPath,
      arguments: [
        fileURLToPath(
          new URL(
            "../../scripts/install-autonomy-analysis-tools.mjs",
            import.meta.url,
          ),
        ),
        resolve(binaryPath),
      ],
      cwd: process.cwd(),
      runId: `autonomy-tool-install-${Date.now()}`,
    },
    {
      timeoutMs: 600000,
      diagnosticBytes: 1024 * 1024,
      acceptNonZeroExit: true,
    },
    (signal === undefined ? {} : { signal }),
  );
  const text = execution.stdout.text.trim();
  const report = text === "" ? null : jsonValueSchema.parse(JSON.parse(text));
  const health =
    report !== null &&
    typeof report === "object" &&
    !Array.isArray(report) &&
    Array.isArray(report.health)
      ? report.health
      : [];
  const healthy = health.filter(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      item.status === "passed",
  ).length;
  return {
    status:
      report === null
        ? "failed"
        : health.length > 0 && healthy === health.length
          ? "profile-healthy"
          : "partial",
    report,
    diagnostics: execution.stderr.text,
    scope:
      "Workspace-local supported Python analysis engines; unavailable dependencies remain reported failures or skips.",
  };
};
