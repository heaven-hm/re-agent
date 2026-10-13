/** Shared owned command boundary for managed benchmark tooling. */
import { randomUUID } from "node:crypto";
import { runOwnedCommand } from "../../dist/process/OwnedCommand.js";
export async function managedBenchmarkCommand(command, args, options = {}) {
  try {
    const r = await runOwnedCommand(
      {
        command,
        arguments: args,
        cwd: options.cwd,
        env: options.env,
        runId: "rea-engine-managed-" + randomUUID(),
        expectedCommand: null,
      },
      {
        timeoutMs: options.timeoutMs ?? 180000,
        diagnosticBytes: options.outputBytes ?? 64 * 1024 * 1024,
      },
      { signal: options.signal },
    );
    return { stdout: r.stdout.text, stderr: r.stderr.text };
  } catch (cause) {
    // Preserve the original failure and retained cleanup owner for callers.
    cause.stdout = cause.snapshot?.stdout.text ?? "";
    cause.stderr = cause.snapshot?.stderr.text ?? "";
    throw cause;
  }
}
